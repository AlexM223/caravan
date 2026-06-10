import { initUmbrelRuntime } from "./utils/umbrelRuntime";

// Resolve the (optional) Umbrel runtime config BEFORE the store and reducers
// are evaluated, so reducer initialState can be umbrel-aware. finally()
// guarantees the app renders even if the fetch fails or times out.
initUmbrelRuntime().finally(() => import("./renderApp"));
