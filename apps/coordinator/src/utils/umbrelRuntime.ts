import { Network } from "@caravan/bitcoin";

// the wallet the Umbrel build creates/uses on the connected node by default
export const DEFAULT_BITCOIND_WALLET_NAME = "caravan-main";
// The Umbrel build's nginx injects the node's real RPC credentials
// server-side, so any non-empty values work from the browser.
export const UMBREL_DUMMY_USERNAME = "umbrel";
export const UMBREL_DUMMY_PASSWORD = "umbrel";

export interface UmbrelRuntime {
  active: boolean;
  // absolute URL: @caravan/clients builds wallet paths with `new URL(baseUrl)`,
  // which throws on relative paths
  bitcoindUrl: string;
  network: Network | null;
}

const INACTIVE: UmbrelRuntime = { active: false, bitcoindUrl: "", network: null };

let runtime: UmbrelRuntime = INACTIVE;

export const getUmbrelRuntime = (): UmbrelRuntime => runtime;

// test seam
export const __setUmbrelRuntimeForTests = (value: UmbrelRuntime) => {
  runtime = value;
};

/**
 * Deterministic per-config node wallet name. Same config → same wallet (the
 * chain rescan happens once); different config → different wallet (no
 * descriptor cross-contamination — Bitcoin Core has no descriptor-removal
 * RPC, so sharing one watch-only wallet across configs accumulates every
 * config's addresses forever). Identity inputs: network, addressType,
 * quorum, and the sorted xpub set.
 *
 * Hash is FNV-1a 64-bit, NOT crypto.subtle: the Umbrel deployment serves
 * over plain http on the LAN, where crypto.subtle does not exist (secure
 * contexts only). This is a local naming scheme, not a security boundary —
 * collision odds across a user's handful of configs are negligible. Kept
 * async for API stability.
 */
export async function deriveNodeWalletName(cfg: {
  network: string;
  addressType: string;
  quorum: { requiredSigners: number; totalSigners: number };
  extendedPublicKeys: { xpub: string }[];
}): Promise<string> {
  const identity = JSON.stringify({
    n: cfg.network,
    t: cfg.addressType,
    q: [cfg.quorum.requiredSigners, cfg.quorum.totalSigners],
    k: cfg.extendedPublicKeys.map((e) => e.xpub).sort(),
  });
  const FNV_PRIME = 0x100000001b3n;
  const MASK = 0xffffffffffffffffn;
  let h = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(identity)) {
    h ^= BigInt(byte);
    h = (h * FNV_PRIME) & MASK;
  }
  return `caravan-${h.toString(16).padStart(16, "0")}`;
}

const normalizeNetwork = (n?: string): Network | null => {
  switch ((n || "").toLowerCase()) {
    case "mainnet":
      return Network.MAINNET;
    case "testnet":
    case "testnet4":
      return Network.TESTNET;
    case "signet":
      return Network.SIGNET;
    case "regtest":
      return Network.REGTEST;
    default:
      return null;
  }
};

/**
 * Resolves the Umbrel runtime config before the app renders.
 *
 * The Umbrel container's entrypoint writes /umbrel-config.json next to the
 * SPA; stock deployments don't have it, so any failure (404, HTML fallback,
 * timeout, bad shape) means "not Umbrel" and the app behaves exactly like
 * upstream Caravan. Reducers read the resolved singleton for their
 * initialState, which is why this must complete before the store module is
 * evaluated (see src/index.jsx).
 */
export async function initUmbrelRuntime(
  timeoutMs = 3000,
): Promise<UmbrelRuntime> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(
      new URL("umbrel-config.json", window.location.origin).toString(),
      { cache: "no-store", signal: ctrl.signal },
    );
    clearTimeout(timer);
    if (!res.ok) return runtime;
    const cfg = await res.json(); // SPA-fallback HTML throws here => stock
    if (cfg?.umbrel !== true) return runtime;
    runtime = {
      active: true,
      bitcoindUrl: new URL(
        typeof cfg.bitcoindPath === "string" ? cfg.bitcoindPath : "/bitcoind",
        window.location.origin,
      ).toString(),
      network: normalizeNetwork(cfg.network),
    };
  } catch {
    runtime = INACTIVE;
  }
  return runtime;
}
