import { Dispatch } from "react";

import { DEFAULT_BITCOIND_WALLET_NAME } from "../utils/umbrelRuntime";
import { getUnknownAddressSlices, getWalletSlices } from "../selectors/wallet";
import { fetchSliceData } from "./braidActions";
import { updateBlockchainClient, setScanStatus } from "./clientActions";

// bitcoind JSON-RPC error codes we react to. Note -4 is overloaded by
// bitcoind: "wallet already exists" (createwallet), "address not in wallet"
// (getreceivedbyaddress) AND "wallet is currently rescanning" — callers must
// disambiguate by context.
const RPC_WALLET_NOT_FOUND = -18;
const RPC_WALLET_ALREADY_LOADED = -35;
const RPC_WALLET_EXISTS_OR_BUSY = -4;

export const rpcCode = (e: any): number | undefined =>
  e?.response?.data?.error?.code ?? e?.code;

/**
 * Guarantees the configured watch-only node wallet exists and is loaded.
 *
 * Umbrel-only behavior (no-op otherwise): listwallets -> loadwallet ->
 * createwallet, tolerating the races another tab (or a previous run) can
 * produce. After this resolves successfully, wallet-scoped RPCs like
 * getwalletinfo stop failing with -18, which is the invariant the
 * connection test and the auto-import flow rely on.
 */
export const ensureNodeWallet = () => {
  return async (
    dispatch: Dispatch<any>,
    getState: () => { client: any },
  ): Promise<{ created: boolean }> => {
    const { client } = getState();
    if (client.type !== "private" || !client.umbrel?.active) {
      return { created: false };
    }
    const bc = dispatch(updateBlockchainClient()) as any;
    const name = client.walletName || DEFAULT_BITCOIND_WALLET_NAME;

    const wallets = await bc.listWallets();
    if (wallets.includes(name)) return { created: false };

    try {
      await bc.loadWallet(name);
      return { created: false };
    } catch (e: any) {
      if (
        rpcCode(e) !== RPC_WALLET_NOT_FOUND &&
        rpcCode(e) !== RPC_WALLET_ALREADY_LOADED
      ) {
        throw e;
      }
      if (rpcCode(e) === RPC_WALLET_ALREADY_LOADED) return { created: false };
    }

    try {
      await bc.createWallet(name);
      return { created: true };
    } catch (e: any) {
      const code = rpcCode(e);
      // -4: createwallet race ("Wallet already exists"); -35: already loaded
      if (code === RPC_WALLET_EXISTS_OR_BUSY || code === RPC_WALLET_ALREADY_LOADED) {
        try {
          await bc.loadWallet(name);
        } catch (e2: any) {
          if (rpcCode(e2) !== RPC_WALLET_ALREADY_LOADED) throw e2;
        }
        return { created: false };
      }
      throw e;
    }
  };
};

const throwOnDescriptorErrors = (response: any) => {
  const results = response?.result;
  if (!Array.isArray(results)) return;
  const failure = results.find((r: any) => r && r.success === false);
  if (failure) {
    throw new Error(
      failure.error?.message || "importdescriptors reported a failure",
    );
  }
};

// module-level (non-serializable) poll handle; one scan at a time per tab
let scanPollTimer: ReturnType<typeof setInterval> | null = null;
const SCAN_POLL_INTERVAL_MS = 2000;
const SCAN_POLL_MAX_CONSECUTIVE_FAILURES = 30; // ~1 minute of solid failure
// importdescriptors with rescan blocks until the scan finishes (and a proxy
// may 504 it long before that) — this window only distinguishes immediate
// failures (bad descriptors) from a scan that is now running
const IMPORT_FAST_FAIL_WINDOW_MS = 4000;

/**
 * Polls getwalletinfo until the node finishes rescanning, driving the
 * scanStatus state the UI renders. On completion, refetches every slice.
 */
export const beginScanPolling = () => {
  return (dispatch: Dispatch<any>, getState: () => any) => {
    if (scanPollTimer) return;
    dispatch(
      setScanStatus({ phase: "scanning", progress: null, startedAt: Date.now() }),
    );
    let consecutiveFailures = 0;
    scanPollTimer = setInterval(async () => {
      try {
        const bc = dispatch(updateBlockchainClient()) as any;
        const { scanning } = await bc.getWalletScanStatus();
        consecutiveFailures = 0;
        if (scanning) {
          dispatch(
            setScanStatus({
              phase: "scanning",
              progress:
                typeof scanning.progress === "number"
                  ? scanning.progress
                  : null,
            }),
          );
          return;
        }
        if (scanPollTimer) clearInterval(scanPollTimer);
        scanPollTimer = null;
        // unblock the fetch gates BEFORE refetching
        dispatch(setScanStatus({ phase: "done", progress: 1 }));
        await dispatch(await fetchSliceData(getWalletSlices(getState())));
      } catch (e: any) {
        consecutiveFailures += 1;
        if (consecutiveFailures >= SCAN_POLL_MAX_CONSECUTIVE_FAILURES) {
          if (scanPollTimer) clearInterval(scanPollTimer);
          scanPollTimer = null;
          dispatch(
            setScanStatus({
              phase: "error",
              error: `Lost contact with the node while scanning: ${e.message}`,
            }),
          );
        }
      }
    }, SCAN_POLL_INTERVAL_MS);
  };
};

// test seam: clear the module-level timer between tests
export const __stopScanPollingForTests = () => {
  if (scanPollTimer) clearInterval(scanPollTimer);
  scanPollTimer = null;
};

/**
 * The zero-config pipeline that runs once the wallet view loads with
 * addresses the node doesn't know yet (umbrel + private client only):
 *
 *   ensureNodeWallet -> already scanning? resume polling
 *                    -> probe one unknown address (now that the wallet
 *                       certainly exists, -4 here really means "not
 *                       imported", not "no wallet")
 *                    -> known? refetch slices, done
 *                    -> importdescriptors, rescan iff txcount === 0
 *                    -> rescan running? poll to completion
 */
export const autoImportAndScan = (descriptors: {
  receive: string;
  change: string;
}) => {
  return async (dispatch: Dispatch<any>, getState: () => any) => {
    const { client } = getState();
    if (client.type !== "private" || !client.umbrel?.active) return;
    if (client.scanStatus.phase !== "idle") return; // one-shot guard
    dispatch(setScanStatus({ phase: "checking", error: "" }));
    try {
      await dispatch(ensureNodeWallet());
      const bc = dispatch(updateBlockchainClient()) as any;

      const { scanning, txcount } = await bc.getWalletScanStatus();
      if (scanning) {
        // page (re)loaded mid-scan: just resume the progress UI
        dispatch(beginScanPolling());
        return;
      }

      const slices = getUnknownAddressSlices(getState());
      if (!slices.length) {
        dispatch(setScanStatus({ phase: "done" }));
        return;
      }
      const probe: any = await bc.getAddressStatus(
        slices[0].multisig.address,
      );
      if (!probe?.addressNotFound) {
        // descriptors are already on the node; generation-time "unknown" was
        // stale — refresh and finish
        await dispatch(await fetchSliceData(slices));
        dispatch(setScanStatus({ phase: "done" }));
        return;
      }

      // a wallet that has never seen a transaction needs history backfilled;
      // an already-used wallet only needs the new (gap) addresses watched
      const rescan = txcount === 0;
      dispatch(setScanStatus({ phase: "importing" }));
      const importPromise = bc.importDescriptors({
        receive: descriptors.receive,
        change: descriptors.change,
        rescan,
      });

      if (!rescan) {
        throwOnDescriptorErrors(await importPromise);
        await dispatch(await fetchSliceData(getUnknownAddressSlices(getState())));
        dispatch(setScanStatus({ phase: "done" }));
        return;
      }

      // expected late rejection (proxy timeout while the scan keeps running
      // server-side) must never surface as unhandled
      importPromise.catch(() => {});
      const fast: any = await Promise.race([
        importPromise.then(
          (r: any) => ({ r }),
          (e: any) => ({ e }),
        ),
        new Promise((res) => {
          setTimeout(() => res(null), IMPORT_FAST_FAIL_WINDOW_MS);
        }),
      ]);
      if (fast?.e) {
        // immediate failure vs. a proxy hiccup while the scan actually runs
        const { scanning: nowScanning } = await bc.getWalletScanStatus();
        if (!nowScanning) throw fast.e;
      }
      if (fast?.r) throwOnDescriptorErrors(fast.r);
      dispatch(beginScanPolling());
    } catch (e: any) {
      dispatch(setScanStatus({ phase: "error", error: e.message }));
    }
  };
};
