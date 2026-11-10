#!/usr/bin/env bash
# Preserve all other sites and restore the file if validation fails.
set -Eeuo pipefail
cd "$(dirname "$0")"
backup=$(mktemp)
cp /etc/caddy/sites/dev.caddy "$backup"
trap 'rm -f "$backup"' EXIT
python3 install.py
if ! sudo -n -u caddy /usr/bin/caddy validate --config /etc/caddy/Caddyfile; then
  cat "$backup" > /etc/caddy/sites/dev.caddy
  exit 1
fi
if ! sudo -n /usr/bin/systemctl reload caddy; then
  cat "$backup" > /etc/caddy/sites/dev.caddy
  sudo -n /usr/bin/systemctl reload caddy
  exit 1
fi
