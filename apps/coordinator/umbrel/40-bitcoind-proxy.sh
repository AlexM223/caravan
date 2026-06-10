#!/bin/sh
# Generates the nginx config at container start. BITCOIND_* env vars are
# injected by the Umbrel app's docker-compose from the Bitcoin app's exports.
set -eu
AUTH="$(printf '%s:%s' "${BITCOIND_USER:-}" "${BITCOIND_PASS:-}" | base64 | tr -d '\n')"
UPSTREAM="http://${BITCOIND_HOST:?BITCOIND_HOST not set}:${BITCOIND_PORT:-8332}/"
cat > /etc/nginx/conf.d/default.conf <<CONF
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;
  client_max_body_size 16m;
  absolute_redirect off;
  # Proxy both /bitcoind and /bitcoind/... directly. No redirect between the
  # two forms: nginx's implicit/return redirects rebuild Location from \$host,
  # which drops the public :4242 port and strands clients on port 80.
  location = /bitcoind {
    proxy_pass ${UPSTREAM};
    proxy_set_header Authorization "Basic ${AUTH}";
    proxy_set_header Host \$host;
    proxy_read_timeout 300s;
  }
  location /bitcoind/ {
    proxy_pass ${UPSTREAM};
    proxy_set_header Authorization "Basic ${AUTH}";
    proxy_set_header Host \$host;
    proxy_read_timeout 300s;
  }
  location / { try_files \$uri \$uri/ /index.html; }
}
CONF
