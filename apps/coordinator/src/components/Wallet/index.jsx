import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import {
  satoshisToBitcoins,
  validateBIP32Index,
  validateBIP32Path,
  validateExtendedPublicKey,
} from "@caravan/bitcoin";
import { PublicBitcoinProvider } from "@caravan/clients";
import { Box, Button, FormHelperText, Grid } from "@mui/material";
import { downloadFile } from "../../utils";
import {
  getUmbrelRuntime,
  DEFAULT_BITCOIND_WALLET_NAME,
  UMBREL_DUMMY_USERNAME,
  UMBREL_DUMMY_PASSWORD,
} from "../../utils/umbrelRuntime";
import {
  resetWallet as resetWalletAction,
  updateChangeSliceAction,
  updateDepositSliceAction,
  updateWalletNameAction as updateWalletNameActionImport,
  updateWalletPolicyRegistrationsAction,
  updateWalletUuidAction,
} from "../../actions/walletActions";
import { fetchSliceData as fetchSliceDataAction } from "../../actions/braidActions";
import walletSelectors from "../../selectors";
import { CARAVAN_CONFIG } from "./constants";
import WalletInfoCard from "./WalletInfoCard";
import NetworkPicker from "../NetworkPicker";
import QuorumPicker from "../QuorumPicker";
import AddressTypePicker from "../AddressTypePicker";
import ClientPicker from "../ClientPicker";
import StartingAddressIndexPicker from "../StartingAddressIndexPicker";
import WalletGenerator from "./WalletGenerator";
import WalletActionsPanel from "./WalletActionsPanel";
import NodeWalletStatus from "./NodeWalletStatus";
import {
  getUnknownAddresses,
  getUnknownAddressSlices,
  getWalletDetailsText,
} from "../../selectors/wallet";
import {
  setAddressType as setAddressTypeAction,
  setNetwork as setNetworkAction,
  setRequiredSigners as setRequiredSignersAction,
  setStartingAddressIndex as setStartingAddressIndexAction,
  setTotalSigners as setTotalSignersAction,
} from "../../actions/settingsActions";
import {
  setExtendedPublicKeyImporterBIP32Path as setExtendedPublicKeyImporterBIP32PathAction,
  setExtendedPublicKeyImporterExtendedPublicKey as setExtendedPublicKeyImporterExtendedPublicKeyAction,
  setExtendedPublicKeyImporterExtendedPublicKeyRootFingerprint as setExtendedPublicKeyImporterExtendedPublicKeyRootFingerprintAction,
  setExtendedPublicKeyImporterFinalized as setExtendedPublicKeyImporterFinalizedAction,
  setExtendedPublicKeyImporterMethod as setExtendedPublicKeyImporterMethodAction,
  setExtendedPublicKeyImporterName as setExtendedPublicKeyImporterNameAction,
  setExtendedPublicKeyImporterVisible as setExtendedPublicKeyImporterVisibleAction,
} from "../../actions/extendedPublicKeyImporterActions";
import { wrappedActions } from "../../actions/utils";
import {
  SET_CLIENT_PASSWORD,
  SET_CLIENT_TYPE,
  SET_CLIENT_URL,
  SET_CLIENT_USERNAME,
  SET_CLIENT_WALLET_NAME,
  SET_CLIENT_PROVIDER,
} from "../../actions/clientActions";
import { clientPropTypes, slicePropTypes } from "../../proptypes";
import { ExtendedPublicKeyImporters } from "./ExtendedPublicKeyImporters";

class CreateWallet extends React.Component {
  static validateProperties(config, properties, key) {
    for (let index = 0; index < properties.length; index += 1) {
      const property = properties[index];
      const configObj = key !== "" ? config[key] : config;
      if (!Object.prototype.hasOwnProperty.call(configObj, property)) {
        return `Configuration missing property "${
          key !== "" ? `${key}.` : ""
        }${property}"`;
      }
    }
    return "";
  }

  static validateConfig(config) {
    const configProperties = [
      "name",
      "addressType",
      "network",
      "quorum",
      "extendedPublicKeys",
    ];
    const validProperties = CreateWallet.validateProperties(
      config,
      configProperties,
      "",
    );
    if (validProperties !== "") return validProperties;

    if (config.startingAddressIndex !== undefined) {
      const startingAddressIndexError = validateBIP32Index(
        String(config.startingAddressIndex),
        { mode: "unhardened " },
      ).replace("BIP32", "Starting Address");
      if (startingAddressIndexError !== "") return startingAddressIndexError;
    }

    if (config.client) {
      const clientProperties = [
        "public",
        PublicBitcoinProvider.MEMPOOL,
        PublicBitcoinProvider.BLOCKSTREAM,
      ].includes(config.client.type)
        ? ["type"]
        : // on Umbrel a partial private client (e.g. only a walletName) is
          // fine — the zero-config defaults fill in url/username/password
          getUmbrelRuntime().active
          ? ["type"]
          : ["type", "url", "username"];
      const validClient = CreateWallet.validateProperties(
        config,
        clientProperties,
        "client",
      );
      if (validClient !== "") return validClient;
    }

    const quorumProperties = ["requiredSigners", "totalSigners"];
    const validQuorum = CreateWallet.validateProperties(
      config,
      quorumProperties,
      "quorum",
    );
    if (validQuorum !== "") return validQuorum;

    return CreateWallet.validateExtendedPublicKeys(
      config.extendedPublicKeys,
      config.network,
    );
  }

  static validateExtendedPublicKeys(xpubs, network) {
    let tmpNetwork = network;
    if (network === "regtest") {
      tmpNetwork = "testnet";
    }
    const xpubFields = {
      name: (name, index) =>
        typeof name === "string"
          ? ""
          : `Extended public key ${index} name must be a string`,
      bip32Path: (bip32Path, index) => {
        if (xpubs[index - 1].method === "text") return "";
        if (typeof xpubs[index - 1].method === "undefined") return "";
        const pathError = validateBIP32Path(bip32Path);
        if (pathError !== "")
          return `Extended public key ${index} error: ${pathError}`;
        return "";
      },
      xpub: (xpub) => validateExtendedPublicKey(xpub, tmpNetwork),
      method: (method, index) => {
        if (
          [
            "jade",
            "bitbox",
            "trezor",
            "coldcard",
            "ledger",
            "hermit",
            "xpub",
            "text",
            "sparrow",
            "bcur2",
            undefined,
          ].includes(method)
        ) {
          return "";
        }
        return `Invalid method for extended public key ${index}`;
      },
    };

    const keys = Object.keys(xpubFields);
    const seen = [];
    for (let xpubIndex = 0; xpubIndex < xpubs.length; xpubIndex += 1) {
      if (!seen.includes(xpubs[xpubIndex].xpub)) {
        seen.push(xpubs[xpubIndex].xpub);
      } else {
        return "Duplicate xpub found.";
      }
      for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
        const key = keys[keyIndex];
        const value = xpubs[xpubIndex][key];
        const valueError = xpubFields[key](value, xpubIndex + 1);
        if (valueError !== "") return valueError;
      }
    }
    return "";
  }

  constructor(props) {
    super(props);
    this.state = {
      configError: "",
      configJson: "",
      refreshing: false,
      generating: false,
    };
  }

  componentDidMount() {
    if (sessionStorage) {
      const configJson = sessionStorage.getItem(CARAVAN_CONFIG);
      if (configJson) this.setConfigJson(configJson);
    }
  }

  setConfigJson(configJson) {
    let configError;
    try {
      const config = JSON.parse(configJson);
      configError = CreateWallet.validateConfig(config);
    } catch (parseError) {
      configError = "Invalid JSON";
    }

    if (sessionStorage && configError === "") {
      sessionStorage.setItem(CARAVAN_CONFIG, configJson);
    }

    // async since importDetails needs the updated state for it to work
    this.setState({ configJson, configError }, () => {
      if (configError === "") this.importDetails();
    });
  }

  setGenerating(_val) {
    const { generating } = this.state;
    let val = _val;
    if (_val === undefined) val = !generating;
    this.setState({ generating: val });
  }

  handleImport = ({ target }) => {
    const fileReader = new FileReader();
    if (target.files[0] && target.files[0].size < 1048576) {
      fileReader.onload = (event) => {
        const configJson = event.target.result;
        this.setConfigJson(configJson);
      };
      fileReader.readAsText(target.files[0]);
    } else {
      this.setState({ configError: "Problem uploading file." });
    }
  };

  refresh = async () => {
    // wallet RPCs are unavailable while the node rescans; the scan poller
    // refreshes everything on completion
    if (this.props.client?.scanStatus?.phase === "scanning") return;
    this.setState({ refreshing: true });
    await this.generatorRefresh();
    this.setState({ refreshing: false });
  };

  resetErrorAndClearTargetValue = (event) => {
    // eslint-disable-next-line no-param-reassign
    event.target.value = "";
    this.setState({ configError: "" });
  };

  importDetails = () => {
    const { configJson } = this.state;
    const {
      setTotalSigners,
      setRequiredSigners,
      setAddressType,
      setNetwork,
      setStartingAddressIndex,
      setExtendedPublicKeyImporterMethod,
      setExtendedPublicKeyImporterExtendedPublicKey,
      setExtendedPublicKeyImporterExtendedPublicKeyRootFingerprint,
      setExtendedPublicKeyImporterBIP32Path,
      setExtendedPublicKeyImporterFinalized,
      setExtendedPublicKeyImporterName,
      updateWalletNameAction,
      updateWalletUuid,
      setClientType,
      setClientUrl,
      setClientUsername,
      setClientPassword,
      setWalletName,
      updateWalletPolicyRegistrations,
      setClientProvider,
    } = this.props;

    const walletConfiguration = JSON.parse(configJson);
    setTotalSigners(walletConfiguration.quorum.totalSigners);
    setRequiredSigners(walletConfiguration.quorum.requiredSigners);
    setAddressType(walletConfiguration.addressType);
    setNetwork(walletConfiguration.network);
    updateWalletNameAction(0, walletConfiguration.name);
    updateWalletUuid(walletConfiguration.uuid);

    const umbrel = getUmbrelRuntime();
    if (walletConfiguration.client) {
      const clientType = walletConfiguration.client.type;
      if (clientType === "private") {
        setClientType(clientType);
        const cfgUrl = walletConfiguration.client.url;
        // configs exported elsewhere usually carry meaningless localhost
        // URLs; on Umbrel point those at the same-origin node proxy. A
        // deliberate non-localhost URL is honored as-is.
        const useProxy =
          umbrel.active &&
          (!cfgUrl || /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(cfgUrl));
        setClientUrl(useProxy ? umbrel.bitcoindUrl : cfgUrl);
        setClientUsername(
          walletConfiguration.client.username ||
            (umbrel.active ? UMBREL_DUMMY_USERNAME : ""),
        );
        // older configs may omit the wallet name; fall back to the wallet
        // this build provisions on the node, since wallet RPCs require one
        setWalletName(
          walletConfiguration.client.walletName ||
            DEFAULT_BITCOIND_WALLET_NAME,
        );
        if (umbrel.active) {
          // configs never carry passwords and the Umbrel proxy injects the
          // real credentials server-side; dispatch LAST so WalletGenerator's
          // debounced auto connection test sees the finished client state
          setClientPassword(UMBREL_DUMMY_PASSWORD);
        }
      } else if (clientType === "mempool" || clientType === "blockstream") {
        setClientType("public");
        setClientProvider(clientType); // This will set provider to "mempool" or "blockstream"
      } else {
        setClientType(clientType);
        if (walletConfiguration.client.provider) {
          setClientProvider(walletConfiguration.client.provider);
        }
      }
    } else if (umbrel.active) {
      // "client": null exports (e.g. from the public caravan site) land on
      // working zero-config defaults instead of forcing manual client setup
      setClientType("private");
      setClientUrl(umbrel.bitcoindUrl);
      setClientUsername(UMBREL_DUMMY_USERNAME);
      setWalletName(DEFAULT_BITCOIND_WALLET_NAME);
      setClientPassword(UMBREL_DUMMY_PASSWORD);
    } else {
      setClientType("unknown");
    }
    // optionally, set starting address index
    if (walletConfiguration.startingAddressIndex) {
      setStartingAddressIndex(walletConfiguration.startingAddressIndex);
    }
    walletConfiguration.extendedPublicKeys.forEach(
      (extendedPublicKey, index) => {
        const number = index + 1;
        setExtendedPublicKeyImporterName(number, extendedPublicKey.name);
        if (extendedPublicKey.method) {
          setExtendedPublicKeyImporterMethod(number, extendedPublicKey.method);
        } else {
          setExtendedPublicKeyImporterMethod(number, "unknown");
        }

        setExtendedPublicKeyImporterBIP32Path(
          number,
          extendedPublicKey.bip32Path,
        );
        setExtendedPublicKeyImporterExtendedPublicKey(
          number,
          extendedPublicKey.xpub,
        );
        if (extendedPublicKey.xfp) {
          setExtendedPublicKeyImporterExtendedPublicKeyRootFingerprint(
            number,
            extendedPublicKey.xfp,
          );
        } else {
          setExtendedPublicKeyImporterExtendedPublicKeyRootFingerprint(
            number,
            "unknown",
          );
        }

        setExtendedPublicKeyImporterFinalized(number, true);
      },
    );

    // config might not have this field at all, so need to account for it
    // being empty
    if (walletConfiguration.ledgerPolicyHmacs) {
      walletConfiguration.ledgerPolicyHmacs.forEach(
        updateWalletPolicyRegistrations,
      );
    }
  };

  // add client picker if client === 'unknown'
  renderWalletImporter = () => {
    const { configError } = this.state;
    const { configuring } = this.props;

    if (configuring)
      return (
        <>
          <label htmlFor="upload-config">
            <input
              style={{ display: "none" }}
              id="upload-config"
              name="upload-config"
              accept="application/json"
              onChange={this.handleImport}
              onClick={this.resetErrorAndClearTargetValue}
              type="file"
            />

            <Button color="primary" variant="contained" component="span">
              Import Wallet Configuration
            </Button>
          </label>
          <FormHelperText error>{configError}</FormHelperText>
        </>
      );
    return "";
  };

  renderSettings = () => {
    const { configuring } = this.props;
    let settings = null;

    if (configuring)
      settings = (
        <Grid item md={4}>
          <Box>
            <QuorumPicker />
          </Box>
          <Box mt={2}>
            <AddressTypePicker />
          </Box>
          <Box mt={2}>
            <NetworkPicker />
          </Box>
          <Box mt={2}>
            <ClientPicker />
          </Box>
          <Box mt={2}>
            <StartingAddressIndexPicker />
          </Box>
        </Grid>
      );
    return settings;
  };

  downloadWalletDetails = (event) => {
    const { walletDetailsText } = this.props;
    event.preventDefault();
    const filename = this.walletDetailsFilename();
    downloadFile(walletDetailsText, filename);
  };

  walletDetailsFilename = () => {
    const { totalSigners, requiredSigners, addressType, walletName } =
      this.props;
    return `bitcoin-${requiredSigners}-of-${totalSigners}-${addressType}-${walletName}.json`;
  };

  totalBalance = () => {
    const { deposits, change } = this.props;
    if (!Object.keys(deposits.nodes).length) return "";
    return satoshisToBitcoins(deposits.balanceSats.plus(change.balanceSats));
  };

  clearConfig = (e) => {
    const { setExtendedPublicKeyImporterVisible, resetWallet } = this.props;
    e.preventDefault();
    resetWallet();
    setExtendedPublicKeyImporterVisible(true);
    this.setState({ generating: false });
  };

  /**
   * Callback function to pass to the address importer
   * after addresses have been imported we want
   * @param {boolean} rescan - whether a rescan is being performed
   */
  async afterImportAddresses(rescan) {
    // if rescan is true then there's no point in fetching
    // the slice data yet since we likely won't get anything
    // until the rescan is complete
    if (rescan) return;

    // importdescriptors imports the whole braid's descriptors, so every
    // previously-unknown slice is now known to the node; refresh them all
    const { unknownSlices, fetchSliceData } = this.props;
    await fetchSliceData(unknownSlices);
  }

  render = () => {
    const {
      client,
      configuring,
      confirmedBalance,
      walletName,
      setName,
      deposits,
      change,
      network,
      pendingBalance,
      nodesLoaded,
      frozen,
      unknownAddresses,
    } = this.props;
    const { refreshing, generating } = this.state;
    const walletLoadError =
      change.fetchUTXOsErrors + deposits.fetchUTXOsErrors > 0
        ? "Wallet loaded, but with errors..."
        : "";

    return (
      <>
        <Box mt={3}>
          <Grid container spacing={3}>
            <Grid item xs={10} md={6}>
              <WalletInfoCard
                editable={
                  !Object.keys(deposits.nodes).length ||
                  !Object.keys(change.nodes).length
                }
                walletName={walletName}
                setName={setName}
                balance={+satoshisToBitcoins(confirmedBalance)}
                pendingBalance={+satoshisToBitcoins(pendingBalance)}
                network={network}
                style={{ fontSize: "inherit" }}
              />
            </Grid>
            <Grid item xs={10} md={6}>
              {(nodesLoaded || frozen) && (
                <WalletActionsPanel
                  addresses={unknownAddresses}
                  refreshing={refreshing}
                  walletActivated={nodesLoaded}
                  handleRefresh={() => this.refresh()}
                  onClearConfig={(e) => {
                    this.clearConfig(e);
                  }}
                  onDownloadConfig={(e) => this.downloadWalletDetails(e)}
                  client={client}
                  onImportAddresses={(addresses, rescan) =>
                    this.afterImportAddresses(rescan)
                  }
                />
              )}
            </Grid>
          </Grid>
        </Box>
        <NodeWalletStatus />
        {walletLoadError.length ? (
          <FormHelperText
            style={{ float: "right", padding: "11px", fontSize: "1.5em" }}
            error
          >
            {walletLoadError}
          </FormHelperText>
        ) : (
          ""
        )}
        <Box>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Grid container style={{ marginTop: "10px" }} spacing={3}>
                <Grid item>{this.renderWalletImporter()}</Grid>
              </Grid>
            </Grid>
            <Grid item md={configuring ? 8 : 12}>
              <ExtendedPublicKeyImporters
                totalSigners={this.props.totalSigners}
                configuring={this.props.configuring}
              />
              <Box mt={2}>
                <WalletGenerator
                  generating={generating}
                  setGenerating={(value) => this.setGenerating(value)}
                  downloadWalletDetails={this.downloadWalletDetails}
                  // eslint-disable-next-line no-return-assign
                  refreshNodes={(click) => (this.generatorRefresh = click)} // FIXME TIGHT COUPLING ALERT, this calls function downstream
                />
              </Box>
            </Grid>
            {this.renderSettings()}
          </Grid>
        </Box>
      </>
    );
  };
}

CreateWallet.propTypes = {
  addressType: PropTypes.string.isRequired,
  change: PropTypes.shape({
    balanceSats: PropTypes.shape({}),
    fetchUTXOsErrors: PropTypes.number,
    nodes: PropTypes.shape({}),
  }).isRequired,
  client: PropTypes.shape(clientPropTypes).isRequired,
  configuring: PropTypes.bool.isRequired,
  deposits: PropTypes.shape({
    balanceSats: PropTypes.shape({
      plus: PropTypes.func,
    }),
    fetchUTXOsErrors: PropTypes.number,
    nodes: PropTypes.shape({}),
  }).isRequired,
  confirmedBalance: PropTypes.oneOfType([PropTypes.number, PropTypes.string])
    .isRequired,
  extendedPublicKeyImporters: PropTypes.shape({}).isRequired,
  frozen: PropTypes.bool.isRequired,
  fetchSliceData: PropTypes.func.isRequired,
  network: PropTypes.string.isRequired,
  nodesLoaded: PropTypes.bool.isRequired,
  pendingBalance: PropTypes.number,
  requiredSigners: PropTypes.number.isRequired,
  resetWallet: PropTypes.func.isRequired,
  setTotalSigners: PropTypes.func.isRequired,
  setRequiredSigners: PropTypes.func.isRequired,
  setAddressType: PropTypes.func.isRequired,
  setName: PropTypes.func.isRequired,
  setNetwork: PropTypes.func.isRequired,
  setStartingAddressIndex: PropTypes.func.isRequired,
  setExtendedPublicKeyImporterMethod: PropTypes.func.isRequired,
  setExtendedPublicKeyImporterExtendedPublicKey: PropTypes.func.isRequired,
  setExtendedPublicKeyImporterExtendedPublicKeyRootFingerprint:
    PropTypes.func.isRequired,
  setExtendedPublicKeyImporterBIP32Path: PropTypes.func.isRequired,
  setExtendedPublicKeyImporterFinalized: PropTypes.func.isRequired,
  setExtendedPublicKeyImporterName: PropTypes.func.isRequired,
  setExtendedPublicKeyImporterVisible: PropTypes.func.isRequired,
  setClientType: PropTypes.func.isRequired,
  setClientUrl: PropTypes.func.isRequired,
  setWalletName: PropTypes.func.isRequired,
  setClientUsername: PropTypes.func.isRequired,
  setClientPassword: PropTypes.func.isRequired,
  totalSigners: PropTypes.number.isRequired,
  updateWalletNameAction: PropTypes.func.isRequired,
  updateWalletUuid: PropTypes.func.isRequired,
  unknownAddresses: PropTypes.arrayOf(PropTypes.string).isRequired,
  unknownSlices: PropTypes.arrayOf(PropTypes.shape(slicePropTypes)).isRequired,
  walletName: PropTypes.string.isRequired,
  walletDetailsText: PropTypes.string.isRequired,
  updateWalletPolicyRegistrations: PropTypes.func.isRequired,
  setClientProvider: PropTypes.func.isRequired,
};

CreateWallet.defaultProps = {
  pendingBalance: 0,
};

function mapStateToProps(state) {
  return {
    ...state.settings,
    ...state.quorum,
    ...{
      walletName: state.wallet.common.walletName,
      nodesLoaded: state.wallet.common.nodesLoaded,
      walletMode: state.wallet.common.walletMode,
    },
    confirmedBalance: walletSelectors.getConfirmedBalance(state),
    pendingBalance: walletSelectors.getPendingBalance(state),
    walletDetailsText: getWalletDetailsText(state),
    unknownAddresses: getUnknownAddresses(state),
    unknownSlices: getUnknownAddressSlices(state),
    ...state.wallet,
    client: state.client,
  };
}

const mapDispatchToProps = {
  fetchSliceData: fetchSliceDataAction,
  resetWallet: resetWalletAction,
  setName: updateWalletNameActionImport,
  setTotalSigners: setTotalSignersAction,
  setRequiredSigners: setRequiredSignersAction,
  setAddressType: setAddressTypeAction,
  setNetwork: setNetworkAction,
  setStartingAddressIndex: setStartingAddressIndexAction,
  setExtendedPublicKeyImporterMethod: setExtendedPublicKeyImporterMethodAction,
  setExtendedPublicKeyImporterExtendedPublicKey:
    setExtendedPublicKeyImporterExtendedPublicKeyAction,
  setExtendedPublicKeyImporterBIP32Path:
    setExtendedPublicKeyImporterBIP32PathAction,
  setExtendedPublicKeyImporterExtendedPublicKeyRootFingerprint:
    setExtendedPublicKeyImporterExtendedPublicKeyRootFingerprintAction,
  setExtendedPublicKeyImporterName: setExtendedPublicKeyImporterNameAction,
  setExtendedPublicKeyImporterFinalized:
    setExtendedPublicKeyImporterFinalizedAction,
  setExtendedPublicKeyImporterVisible:
    setExtendedPublicKeyImporterVisibleAction,
  updateWalletNameAction: updateWalletNameActionImport,
  updateWalletUuid: updateWalletUuidAction,
  updateWalletPolicyRegistrations: updateWalletPolicyRegistrationsAction,
  ...wrappedActions({
    setClientType: SET_CLIENT_TYPE,
    setClientUrl: SET_CLIENT_URL,
    setClientUsername: SET_CLIENT_USERNAME,
    setClientPassword: SET_CLIENT_PASSWORD,
    setWalletName: SET_CLIENT_WALLET_NAME,
    setClientProvider: SET_CLIENT_PROVIDER,
  }),
  updateDepositNode: updateDepositSliceAction,
  updateChangeNode: updateChangeSliceAction,
};

export default connect(mapStateToProps, mapDispatchToProps)(CreateWallet);
