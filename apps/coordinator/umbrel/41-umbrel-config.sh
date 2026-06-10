#!/bin/sh
# Writes the runtime config the SPA fetches at boot (see
# src/utils/umbrelRuntime.ts). Stock deployments don't have this file, so its
# absence means "behave like upstream Caravan" — one build artifact for both.
set -eu
cat > /usr/share/nginx/html/umbrel-config.json <<JSON
{
  "umbrel": true,
  "bitcoindPath": "/bitcoind",
  "network": "${BITCOIND_NETWORK:-mainnet}"
}
JSON
