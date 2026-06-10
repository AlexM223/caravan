import { Network } from "@caravan/bitcoin";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  initUmbrelRuntime,
  getUmbrelRuntime,
  deriveNodeWalletName,
  __setUmbrelRuntimeForTests,
} from "./umbrelRuntime";

const inactive = { active: false, bitcoindUrl: "", network: null };

describe("umbrelRuntime", () => {
  beforeEach(() => {
    __setUmbrelRuntimeForTests(inactive);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("activates with absolute proxy URL and mapped network on valid config", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          umbrel: true,
          bitcoindPath: "/bitcoind",
          network: "testnet4",
        }),
      }),
    );
    const rt = await initUmbrelRuntime();
    expect(rt.active).toBe(true);
    expect(rt.bitcoindUrl).toBe(`${window.location.origin}/bitcoind`);
    expect(rt.network).toBe(Network.TESTNET);
    expect(getUmbrelRuntime()).toEqual(rt);
  });

  it("stays inactive on 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );
    expect((await initUmbrelRuntime()).active).toBe(false);
  });

  it("stays inactive when the body is not JSON (SPA fallback HTML)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError("Unexpected token <");
        },
      }),
    );
    expect((await initUmbrelRuntime()).active).toBe(false);
  });

  it("stays inactive when umbrel flag is not strictly true", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ umbrel: "yes" }),
      }),
    );
    expect((await initUmbrelRuntime()).active).toBe(false);
  });

  it("stays inactive when fetch rejects (timeout/abort)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")),
    );
    expect((await initUmbrelRuntime()).active).toBe(false);
  });

  it("defaults unknown networks to null (mainnet handling upstream)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ umbrel: true, network: "lightning" }),
      }),
    );
    expect((await initUmbrelRuntime()).network).toBe(null);
  });
});

describe("deriveNodeWalletName", () => {
  const base = {
    network: "mainnet",
    addressType: "P2WSH",
    quorum: { requiredSigners: 2, totalSigners: 3 },
    extendedPublicKeys: [{ xpub: "xpubAAA" }, { xpub: "xpubBBB" }, { xpub: "xpubCCC" }],
  };

  it("is deterministic and filesystem-safe", async () => {
    const a = await deriveNodeWalletName(base);
    const b = await deriveNodeWalletName(JSON.parse(JSON.stringify(base)));
    expect(a).toBe(b);
    expect(a).toMatch(/^caravan-[0-9a-f]{16}$/);
  });

  it("ignores xpub ordering", async () => {
    const shuffled = {
      ...base,
      extendedPublicKeys: [
        { xpub: "xpubCCC" },
        { xpub: "xpubAAA" },
        { xpub: "xpubBBB" },
      ],
    };
    expect(await deriveNodeWalletName(shuffled)).toBe(
      await deriveNodeWalletName(base),
    );
  });

  it("changes when identity inputs change", async () => {
    const baseName = await deriveNodeWalletName(base);
    expect(
      await deriveNodeWalletName({ ...base, network: "testnet" }),
    ).not.toBe(baseName);
    expect(
      await deriveNodeWalletName({ ...base, addressType: "P2SH" }),
    ).not.toBe(baseName);
    expect(
      await deriveNodeWalletName({
        ...base,
        quorum: { requiredSigners: 3, totalSigners: 5 },
      }),
    ).not.toBe(baseName);
    expect(
      await deriveNodeWalletName({
        ...base,
        extendedPublicKeys: [{ xpub: "xpubZZZ" }, { xpub: "xpubBBB" }, { xpub: "xpubCCC" }],
      }),
    ).not.toBe(baseName);
  });
});
