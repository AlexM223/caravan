import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./braidActions", () => ({
  // matches the real double-async shape: await fetchSliceData(slices) -> thunk
  fetchSliceData: vi.fn(async () => async () => {}),
}));
vi.mock("../selectors/wallet", () => ({
  getUnknownAddressSlices: vi.fn(() => []),
  getWalletSlices: vi.fn(() => []),
}));

import {
  getUnknownAddressSlices,
  getWalletSlices,
} from "../selectors/wallet";
import { fetchSliceData } from "./braidActions";
import {
  ensureNodeWallet,
  autoImportAndScan,
  beginScanPolling,
  rpcCode,
  __stopScanPollingForTests,
} from "./bitcoindNodeActions";
import { SET_SCAN_STATUS } from "./clientActions";

const mkErr = (code: number) => Object.assign(new Error(`rpc ${code}`), { code });

describe("ensureNodeWallet", () => {
  let bc: {
    listWallets: ReturnType<typeof vi.fn>;
    loadWallet: ReturnType<typeof vi.fn>;
    createWallet: ReturnType<typeof vi.fn>;
  };
  let dispatch: ReturnType<typeof vi.fn>;
  const getState = (overrides = {}) => () => ({
    client: {
      type: "private",
      umbrel: { active: true, network: null },
      walletName: "caravan-main",
      ...overrides,
    },
  });

  beforeEach(() => {
    bc = {
      listWallets: vi.fn().mockResolvedValue([]),
      loadWallet: vi.fn(),
      createWallet: vi.fn(),
    };
    // the thunk dispatches updateBlockchainClient(), which resolves to the
    // blockchain client instance
    dispatch = vi.fn().mockReturnValue(bc);
  });

  it("no-ops outside umbrel mode", async () => {
    const result = await ensureNodeWallet()(
      dispatch,
      getState({ umbrel: { active: false } }) as any,
    );
    expect(result).toEqual({ created: false });
    expect(bc.listWallets).not.toHaveBeenCalled();
  });

  it("no-ops for public clients", async () => {
    const result = await ensureNodeWallet()(
      dispatch,
      getState({ type: "public" }) as any,
    );
    expect(result).toEqual({ created: false });
  });

  it("returns early when the wallet is already loaded", async () => {
    bc.listWallets.mockResolvedValue(["caravan-main"]);
    const result = await ensureNodeWallet()(dispatch, getState() as any);
    expect(result).toEqual({ created: false });
    expect(bc.loadWallet).not.toHaveBeenCalled();
    expect(bc.createWallet).not.toHaveBeenCalled();
  });

  it("loads an existing on-disk wallet", async () => {
    bc.loadWallet.mockResolvedValue({ name: "caravan-main" });
    const result = await ensureNodeWallet()(dispatch, getState() as any);
    expect(result).toEqual({ created: false });
    expect(bc.loadWallet).toHaveBeenCalledWith("caravan-main");
    expect(bc.createWallet).not.toHaveBeenCalled();
  });

  it("creates the wallet when load reports -18 (not found)", async () => {
    bc.loadWallet.mockRejectedValue(mkErr(-18));
    bc.createWallet.mockResolvedValue({ name: "caravan-main" });
    const result = await ensureNodeWallet()(dispatch, getState() as any);
    expect(result).toEqual({ created: true });
    expect(bc.createWallet).toHaveBeenCalledWith("caravan-main");
  });

  it("tolerates a createwallet race (-4) by loading instead", async () => {
    bc.loadWallet
      .mockRejectedValueOnce(mkErr(-18))
      .mockResolvedValueOnce({ name: "caravan-main" });
    bc.createWallet.mockRejectedValue(mkErr(-4));
    const result = await ensureNodeWallet()(dispatch, getState() as any);
    expect(result).toEqual({ created: false });
    expect(bc.loadWallet).toHaveBeenCalledTimes(2);
  });

  it("treats -35 (already loaded) as success", async () => {
    bc.loadWallet.mockRejectedValue(mkErr(-35));
    const result = await ensureNodeWallet()(dispatch, getState() as any);
    expect(result).toEqual({ created: false });
    expect(bc.createWallet).not.toHaveBeenCalled();
  });

  it("propagates unexpected RPC errors", async () => {
    bc.loadWallet.mockRejectedValue(mkErr(-28)); // node warming up
    await expect(
      ensureNodeWallet()(dispatch, getState() as any),
    ).rejects.toThrow("rpc -28");
  });

  it("rpcCode reads both BitcoindRPCError and axios shapes", () => {
    expect(rpcCode(mkErr(-18))).toBe(-18);
    expect(
      rpcCode({ response: { data: { error: { code: -4 } } } }),
    ).toBe(-4);
    expect(rpcCode(new Error("plain"))).toBeUndefined();
  });
});

describe("autoImportAndScan", () => {
  let bc: any;
  let state: any;
  // mini store: executes thunks, applies SET_SCAN_STATUS merges
  const getState = () => state;
  const dispatch: any = vi.fn((a: any) => {
    if (typeof a === "function") return a(dispatch, getState);
    if (a?.type === SET_SCAN_STATUS) {
      state.client.scanStatus = { ...state.client.scanStatus, ...a.value };
    }
    return a;
  });

  const descriptors = { receive: "rdesc", change: "cdesc" };
  const slice = { multisig: { address: "addr0" }, bip32Path: "m/0/0" };

  beforeEach(() => {
    vi.clearAllMocks();
    __stopScanPollingForTests();
    bc = {
      listWallets: vi.fn().mockResolvedValue(["caravan-main"]),
      loadWallet: vi.fn(),
      createWallet: vi.fn(),
      getWalletScanStatus: vi
        .fn()
        .mockResolvedValue({ scanning: false, txcount: 0 }),
      getAddressStatus: vi
        .fn()
        .mockResolvedValue({ used: false, addressNotFound: true }),
      importDescriptors: vi.fn().mockResolvedValue({
        result: [{ success: true }, { success: true }],
      }),
    };
    // the REAL updateBlockchainClient thunk runs; shape the cached client so
    // matchesClient() returns it instead of constructing a new one
    bc.type = "private";
    bc.network = "mainnet";
    bc.bitcoindParams = {
      url: "http://umbrel.local:4242/bitcoind",
      auth: { username: "umbrel", password: "umbrel" },
      walletName: "caravan-main",
    };
    state = {
      settings: { network: "mainnet" },
      client: {
        type: "private",
        url: "http://umbrel.local:4242/bitcoind",
        username: "umbrel",
        password: "umbrel",
        umbrel: { active: true, network: null },
        walletName: "caravan-main",
        scanStatus: { phase: "idle", progress: null, startedAt: null, error: "" },
        blockchainClient: bc,
      },
    };
    (getUnknownAddressSlices as any).mockReturnValue([slice]);
    (getWalletSlices as any).mockReturnValue([slice]);
  });

  afterEach(() => {
    __stopScanPollingForTests();
    vi.useRealTimers();
  });

  it("no-ops when a run is already in flight (one-shot guard)", async () => {
    state.client.scanStatus.phase = "checking";
    await autoImportAndScan(descriptors)(dispatch, getState);
    expect(bc.importDescriptors).not.toHaveBeenCalled();
  });

  it("resumes polling when the node is already scanning (reload mid-scan)", async () => {
    bc.getWalletScanStatus.mockResolvedValue({
      scanning: { duration: 5, progress: 0.4 },
      txcount: 0,
    });
    await autoImportAndScan(descriptors)(dispatch, getState);
    expect(bc.importDescriptors).not.toHaveBeenCalled();
    expect(state.client.scanStatus.phase).toBe("scanning");
  });

  it("skips import when the probe says the address is already known", async () => {
    bc.getAddressStatus.mockResolvedValue({ used: false });
    await autoImportAndScan(descriptors)(dispatch, getState);
    expect(bc.importDescriptors).not.toHaveBeenCalled();
    expect(fetchSliceData).toHaveBeenCalled();
    expect(state.client.scanStatus.phase).toBe("done");
  });

  it("imports with rescan for a virgin wallet and polls to completion", async () => {
    vi.useFakeTimers();
    // wallet busy: the import promise stays pending past the race window
    bc.importDescriptors.mockReturnValue(new Promise(() => {}));
    // first call (pre-import check) idle; polls report scanning then done
    bc.getWalletScanStatus
      .mockResolvedValueOnce({ scanning: false, txcount: 0 })
      .mockResolvedValueOnce({
        scanning: { duration: 2, progress: 0.5 },
        txcount: 0,
      })
      .mockResolvedValue({ scanning: false, txcount: 9 });

    const run = autoImportAndScan(descriptors)(dispatch, getState);
    await vi.advanceTimersByTimeAsync(4100); // past the fast-fail window
    await run;
    expect(bc.importDescriptors).toHaveBeenCalledWith({
      receive: "rdesc",
      change: "cdesc",
      rescan: true,
    });
    expect(state.client.scanStatus.phase).toBe("scanning");

    await vi.advanceTimersByTimeAsync(2100); // first poll: scanning 50%
    expect(state.client.scanStatus.progress).toBe(0.5);
    await vi.advanceTimersByTimeAsync(2100); // second poll: done
    expect(state.client.scanStatus.phase).toBe("done");
    expect(fetchSliceData).toHaveBeenCalled();
  });

  it("imports without rescan when the wallet already has history", async () => {
    bc.getWalletScanStatus.mockResolvedValue({ scanning: false, txcount: 12 });
    await autoImportAndScan(descriptors)(dispatch, getState);
    expect(bc.importDescriptors).toHaveBeenCalledWith({
      receive: "rdesc",
      change: "cdesc",
      rescan: false,
    });
    expect(state.client.scanStatus.phase).toBe("done");
  });

  it("surfaces an immediate import failure as an error phase", async () => {
    bc.importDescriptors.mockRejectedValue(new Error("bad descriptor"));
    // scan-status check after the failure confirms nothing is scanning
    bc.getWalletScanStatus.mockResolvedValue({ scanning: false, txcount: 0 });
    await autoImportAndScan(descriptors)(dispatch, getState);
    expect(state.client.scanStatus.phase).toBe("error");
    expect(state.client.scanStatus.error).toContain("bad descriptor");
  });

  it("beginScanPolling is idempotent while a poll is active", () => {
    beginScanPolling()(dispatch, getState);
    const callsAfterFirst = dispatch.mock.calls.length;
    beginScanPolling()(dispatch, getState);
    expect(dispatch.mock.calls.length).toBe(callsAfterFirst);
  });
});
