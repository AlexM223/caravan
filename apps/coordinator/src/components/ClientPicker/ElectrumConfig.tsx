import React from "react";

// Components
import { Grid, TextField, Button, FormHelperText, Box } from "@mui/material";

import {
  ClientSettings,
} from "../../actions/clientActions";

export interface ElectrumConfigProps {
  handleBackendUrlChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleAuthTokenChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  client: ClientSettings;
  backendUrlError: string;
  connectSuccess: boolean;
  connectError: string;
  testConnection: () => void;
}

const ElectrumConfig = ({
  handleBackendUrlChange,
  handleAuthTokenChange,
  client,
  backendUrlError,
  connectSuccess,
  connectError,
  testConnection,
}: ElectrumConfigProps) => {
  return (
    <div>
      <p>
        Connect to an Electrum/Fulcrum backend service running on your own server.
      </p>
      <p>
        <small>
          {
            "Specify the backend endpoint URL (e.g., http://localhost:3001) that proxies requests to your Fulcrum server."
          }
        </small>
      </p>
      <form>
        <Grid container direction="column" spacing={1}>
          <Grid item>
            <TextField
              fullWidth
              label="Backend Endpoint URL"
              placeholder="http://localhost:3001"
              value={client.electrumBackendUrl || ""}
              variant="standard"
              onChange={handleBackendUrlChange}
              error={backendUrlError !== ""}
              helperText={backendUrlError || "Full URL of the backend service"}
            />
          </Grid>

          <Grid item>
            <TextField
              id="electrum-auth-token"
              fullWidth
              type="password"
              label="Auth Token (Optional)"
              value={client.electrumAuthToken || ""}
              variant="standard"
              onChange={handleAuthTokenChange}
              helperText="Authentication token if backend requires it"
            />
          </Grid>
          <Grid item>
            <Box mt={1}>
              <Button variant="contained" onClick={testConnection}>
                Test Connection
              </Button>
            </Box>
            <Box mt={2}>
              {connectSuccess && (
                <FormHelperText>Connection Success!</FormHelperText>
              )}
              {connectError !== "" && (
                <FormHelperText error>{connectError}</FormHelperText>
              )}
            </Box>
          </Grid>
        </Grid>
      </form>
    </div>
  );
};

ElectrumConfig.defaultProps = {
  backendUrlError: "",
  connectSuccess: false,
  connectError: "",
};

export default ElectrumConfig;
