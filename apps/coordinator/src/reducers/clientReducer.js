import {
  getUmbrelRuntime,
  DEFAULT_BITCOIND_WALLET_NAME,
  UMBREL_DUMMY_USERNAME,
  UMBREL_DUMMY_PASSWORD,
} from "../utils/umbrelRuntime";
import updateState from "./utils";
import {
  SET_CLIENT_TYPE,
  SET_CLIENT_PROVIDER,
  SET_CLIENT_URL,
  SET_CLIENT_USERNAME,
  SET_CLIENT_PASSWORD,
  SET_CLIENT_URL_ERROR,
  SET_CLIENT_USERNAME_ERROR,
  SET_CLIENT_PASSWORD_ERROR,
  SET_BLOCKCHAIN_CLIENT,
  SET_CLIENT_WALLET_NAME,
  SET_SCAN_STATUS,
} from "../actions/clientActions";

export const initialScanStatus = {
  // idle | checking | importing | scanning | done | error
  phase: "idle",
  progress: null, // 0..1 from getwalletinfo.scanning.progress
  startedAt: null,
  error: "",
};

// Evaluated after initUmbrelRuntime() resolves (see src/index.jsx), so on an
// Umbrel deployment a brand-new session — and any RESET_WALLET, which
// re-initializes from this state — starts pointed at the node proxy with
// working (dummy) credentials instead of the public mempool API.
const buildInitialState = () => {
  const umbrel = getUmbrelRuntime();
  return {
    type: umbrel.active ? "private" : "public",
    provider: "mempool",
    url: umbrel.active ? umbrel.bitcoindUrl : "",
    username: umbrel.active ? UMBREL_DUMMY_USERNAME : "",
    password: umbrel.active ? UMBREL_DUMMY_PASSWORD : "",
    urlError: "",
    walletName: umbrel.active ? DEFAULT_BITCOIND_WALLET_NAME : "",
    usernameError: "",
    passwordError: "",
    status: "unknown",
    blockchainClient: null,
    umbrel: { active: umbrel.active, network: umbrel.network },
    scanStatus: initialScanStatus,
  };
};

export default (state = buildInitialState(), action) => {
  switch (action.type) {
    case SET_CLIENT_TYPE:
      return updateState(state, { type: action.value });
    case SET_CLIENT_PROVIDER:
      return updateState(state, { provider: action.value });
    case SET_CLIENT_URL:
      return updateState(state, { url: action.value });
    case SET_CLIENT_USERNAME:
      return updateState(state, { username: action.value });
    case SET_CLIENT_PASSWORD:
      return updateState(state, { password: action.value });
    case SET_CLIENT_URL_ERROR:
      return updateState(state, { urlError: action.value });
    case SET_CLIENT_USERNAME_ERROR:
      return updateState(state, { usernameError: action.value });
    case SET_CLIENT_PASSWORD_ERROR:
      return updateState(state, { passwordError: action.value });
    case SET_CLIENT_WALLET_NAME:
      return updateState(state, { walletName: action.value });
    case SET_BLOCKCHAIN_CLIENT:
      return updateState(state, { blockchainClient: action.value });
    case SET_SCAN_STATUS:
      return updateState(state, {
        scanStatus: { ...state.scanStatus, ...action.value },
      });

    default:
      return state;
  }
};
