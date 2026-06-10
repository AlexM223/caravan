#!/bin/sh
# Generates the nginx config at container start. BITCOIND_* env vars are
# injected by the Umbrel app's docker-compose from the Bitcoin app's exports.
set -eu
AUTH="$(printf '%s:%s' "${BITCOIND_USER:-}" "${BITCOIND_PASS:-}" | base64 | tr -d '\n')"
cat > /etc/nginx/conf.d/default.conf <<CONF
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;
  client_max_body_size 16m;
  location = /bitcoind { return 308 /bitcoind/; }
  location /bitcoind/ {
    proxy_pass http://${BITCOIND_HOST:?BITCOIND_HOST not set}:${BITCOIND_PORT:-8332}/;
    proxy_set_header Authorization "Basic ${AUTH}";
    proxy_set_header Host \$host;
    proxy_read_timeout 300s;
  }
  location / { try_files \$uri \$uri/ /index.html; }
}
CONF
