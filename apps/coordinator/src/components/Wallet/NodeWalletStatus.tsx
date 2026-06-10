import React, { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  LinearProgress,
  Typography,
} from "@mui/material";
import { enqueueSnackbar } from "notistack";

import {
  autoImportAndScan,
  beginScanPolling,
} from "../../actions/bitcoindNodeActions";
import { setScanStatus } from "../../actions/clientActions";
import { getUnknownAddresses } from "../../selectors/wallet";
import { useGetDescriptors } from "../../hooks";

/**
 * Trigger + status surface for the zero-config node-wallet pipeline.
 *
 * On Umbrel it automatically imports this wallet's descriptors into the
 * node's watch-only wallet and, when the node has never seen the wallet,
 * kicks off (and tracks) the blockchain rescan. Outside Umbrel it renders
 * the manual "click Import Addresses" hint.
 */
const NodeWalletStatus = () => {
  const dispatch = useDispatch();
  const client = useSelector((state: any) => state.client);
  const nodesLoaded = useSelector(
    (state: any) => state.wallet?.common?.nodesLoaded,
  );
  const unknownAddresses = useSelector(getUnknownAddresses) as string[];
  const descriptors = useGetDescriptors();
  const { phase, progress, error } = client.scanStatus || { phase: "idle" };
  const prevPhase = useRef(phase);

  const umbrelActive = Boolean(client.umbrel?.active);
  const isPrivate = client.type === "private";

  useEffect(() => {
    if (!umbrelActive || !isPrivate || !nodesLoaded) return;
    if (phase !== "idle") return;
    if (!unknownAddresses.length) return;
    if (!descriptors.receive || !descriptors.change) return;
    dispatch(
      autoImportAndScan({
        receive: descriptors.receive,
        change: descriptors.change,
      }) as any,
    );
  }, [
    umbrelActive,
    isPrivate,
    nodesLoaded,
    phase,
    unknownAddresses.length,
    descriptors.receive,
    descriptors.change,
  ]);

  // a reloaded tab mid-scan has phase "scanning" in fresh state only after
  // autoImportAndScan resumes it; but if the reducer was rehydrated some
  // other way, make sure a poller exists
  useEffect(() => {
    if (phase === "scanning") dispatch(beginScanPolling() as any);
  }, [phase]);

  useEffect(() => {
    if (prevPhase.current === "scanning" && phase === "done") {
      enqueueSnackbar("Scan complete — wallet history loaded", {
        variant: "success",
      });
    }
    prevPhase.current = phase;
  }, [phase]);

  if (!isPrivate || !nodesLoaded) return null;

  if (!umbrelActive) {
    // stock behavior: manual import hint
    if (!unknownAddresses.length) return null;
    return (
      <Box mt={2}>
        <Alert severity="info">
          This wallet&apos;s addresses are not yet imported into your
          node&apos;s wallet, so balances can&apos;t be shown. Click
          &quot;Import Addresses&quot; under Wallet Actions (enable Rescan
          first if these addresses have transaction history).
        </Alert>
      </Box>
    );
  }

  if (phase === "checking" || phase === "importing") {
    return (
      <Box mt={2}>
        <Alert severity="info" icon={<CircularProgress size={18} />}>
          Preparing your node&apos;s watch-only wallet…
        </Alert>
      </Box>
    );
  }

  if (phase === "scanning") {
    return (
      <Box mt={2}>
        <Alert severity="info">
          <Typography variant="body2" gutterBottom>
            Scanning the blockchain for this wallet&apos;s history — usually a
            few minutes on Umbrel. Balances appear when it finishes.
            {typeof progress === "number" &&
              ` (${Math.round(progress * 100)}%)`}
          </Typography>
          <LinearProgress
            variant={
              typeof progress === "number" ? "determinate" : "indeterminate"
            }
            value={typeof progress === "number" ? progress * 100 : 0}
          />
        </Alert>
      </Box>
    );
  }

  if (phase === "error") {
    return (
      <Box mt={2}>
        <Alert
          severity="error"
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() =>
                dispatch(setScanStatus({ phase: "idle", error: "" }))
              }
            >
              Retry
            </Button>
          }
        >
          {`Node wallet setup failed: ${error}`}
        </Alert>
      </Box>
    );
  }

  return null;
};

export default NodeWalletStatus;
