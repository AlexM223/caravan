import { SET_SCAN_STATUS } from "../actions/clientActions";

const loadReducer = async () => (await import("./clientReducer")).default;

describe("clientReducer", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unmock("../utils/umbrelRuntime");
  });

  it("defaults to the stock public client when umbrel runtime is inactive", async () => {
    vi.doMock("../utils/umbrelRuntime", async (importOriginal) => ({
      ...(await importOriginal()),
      getUmbrelRuntime: () => ({
        active: false,
        bitcoindUrl: "",
        network: null,
      }),
    }));
    const reducer = await loadReducer();
    const state = reducer(undefined, { type: "@@INIT" });
    expect(state.type).toBe("public");
    expect(state.url).toBe("");
    expect(state.walletName).toBe("");
    expect(state.umbrel.active).toBe(false);
    expect(state.scanStatus.phase).toBe("idle");
  });

  it("seeds private proxy defaults when umbrel runtime is active", async () => {
    vi.doMock("../utils/umbrelRuntime", async (importOriginal) => {
      const original = await importOriginal();
      return {
        ...original,
        getUmbrelRuntime: () => ({
          active: true,
          bitcoindUrl: "http://umbrel.local:4242/bitcoind",
          network: "testnet",
        }),
      };
    });
    const reducer = await loadReducer();
    const state = reducer(undefined, { type: "@@INIT" });
    expect(state.type).toBe("private");
    expect(state.url).toBe("http://umbrel.local:4242/bitcoind");
    expect(state.username).toBe("umbrel");
    expect(state.password).toBe("umbrel");
    // per-config wallet names are derived at import/confirm time — a static
    // default here would recreate the shared-wallet bug
    expect(state.walletName).toBe("");
    expect(state.umbrel).toEqual({ active: true, network: "testnet" });
  });

  it("merges partial SET_SCAN_STATUS updates", async () => {
    const reducer = await loadReducer();
    let state = reducer(undefined, { type: "@@INIT" });
    state = reducer(state, {
      type: SET_SCAN_STATUS,
      value: { phase: "scanning", progress: 0.25 },
    });
    expect(state.scanStatus.phase).toBe("scanning");
    expect(state.scanStatus.progress).toBe(0.25);
    expect(state.scanStatus.error).toBe("");
    state = reducer(state, {
      type: SET_SCAN_STATUS,
      value: { progress: 0.5 },
    });
    expect(state.scanStatus.phase).toBe("scanning");
    expect(state.scanStatus.progress).toBe(0.5);
  });
});
