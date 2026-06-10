import { describe, it, expect, vi, beforeEach } from "vitest";

import { ensureNodeWallet, rpcCode } from "./bitcoindNodeActions";

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
