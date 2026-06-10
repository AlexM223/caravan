import { Dispatch } from "react";

import { DEFAULT_BITCOIND_WALLET_NAME } from "../utils/umbrelRuntime";
import { updateBlockchainClient } from "./clientActions";

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
