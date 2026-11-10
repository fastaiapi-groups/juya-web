#!/usr/bin/env bash
# Build first, then atomically publish HTML and gracefully reload existing Nginx.
# Never recreate a production API, merchant, database or web container.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
docker=${DOCKER_BIN:-docker}
version=$(git rev-parse HEAD)
image="fastai-website-pages:${version}"
target=${WEBSITE_CONTAINER:-fastai-website-website-1}
backup=".local/website-publish/$(date -u +%Y%m%dT%H%M%SZ)-${version:0:8}"
mkdir -p "$backup"
chmod 700 .local "$backup"
"$docker" build -t "$image" .
temp=$("$docker" create "$image")
trap '"$docker" rm "$temp" >/dev/null 2>&1 || true' EXIT
"$docker" cp "$temp:/usr/share/nginx/html" "$backup/new-html"
"$docker" cp "$temp:/etc/nginx/conf.d/default.conf" "$backup/new-nginx.conf"
"$docker" cp "$target:/etc/nginx/conf.d/default.conf" "$backup/previous-nginx.conf"
"$docker" cp "$target:/usr/share/nginx/html" "$backup/previous-html"
# Keep a durable Compose declaration as well as the live connection.
if ! "$docker" inspect "$target" --format '{{json .NetworkSettings.Networks}}' | grep -q '"design_default"'; then
  "$docker" network connect design_default "$target"
fi
"$docker" cp "$backup/new-nginx.conf" "$target:/etc/nginx/conf.d/default.conf"
if ! "$docker" exec "$target" nginx -t; then
  "$docker" cp "$backup/previous-nginx.conf" "$target:/etc/nginx/conf.d/default.conf"
  exit 1
fi
# Hashed assets are copied first and old hashes remain for already-open pages.
mv "$backup/new-html/index.html" "$backup/new-index.html"
mv "$backup/new-html/fastaiui/index.html" "$backup/new-ui-index.html"
"$docker" cp "$backup/new-html/." "$target:/usr/share/nginx/html/"
"$docker" cp "$backup/new-index.html" "$target:/usr/share/nginx/html/index.html.next"
"$docker" cp "$backup/new-ui-index.html" "$target:/usr/share/nginx/html/fastaiui/index.html.next"
"$docker" exec "$target" sh -c 'find /usr/share/nginx/html -type d -exec chmod 755 {} +; find /usr/share/nginx/html -type f -exec chmod 644 {} +; mv /usr/share/nginx/html/index.html.next /usr/share/nginx/html/index.html; mv /usr/share/nginx/html/fastaiui/index.html.next /usr/share/nginx/html/fastaiui/index.html; nginx -s reload'
# reload returns before new workers start accepting; allow that bounded handoff.
healthy=false
for attempt in {1..30}; do
  if "$docker" exec "$target" wget -q -O /dev/null http://127.0.0.1/fastaiui/downloads/manju &&
     "$docker" exec "$target" wget -q -O /dev/null http://127.0.0.1/api/merchant/healthz; then
    healthy=true; break
  fi
  sleep 0.2
done
"$healthy" || { echo 'Website post-reload health check failed; rollback files retained.' >&2; exit 1; }
printf 'Published website %s; rollback files: %s\n' "$version" "$backup"
