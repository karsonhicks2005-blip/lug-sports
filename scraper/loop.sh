#!/usr/bin/env bash
# Keeps the data fresh for one long run (GitHub skips many short scheduled runs at busy times):
# a fast refresh every 15 minutes, a full refresh once a day after 3am Toronto time,
# and each result pushed to the repo's "data" branch, which the app reads directly.
set -u
END=$(( $(date +%s) + ${LOOP_MINUTES:-345} * 60 ))
FORCE_MODE="${FORCE_MODE:-}"

publish() {
  local tmp; tmp=$(mktemp -d)
  cp site/data/data.json site/data/logos.json site/data/reg.json site/data/version.json "$tmp"/ 2>/dev/null
  ( cd "$tmp" && git init -q && git checkout -q -b data \
    && git -c user.name="lug-refresh" -c user.email="actions@users.noreply.github.com" add -A \
    && git -c user.name="lug-refresh" -c user.email="actions@users.noreply.github.com" commit -q -m "Data $(date -u +%FT%TZ)" \
    && git push -q --force "https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" data:data ) \
    && echo "published data $(date -u +%T)" || echo "publish FAILED"
  rm -rf "$tmp"
}

full_due() {
  [ -n "$FORCE_MODE" ] && { [ "$FORCE_MODE" = full ]; return; }
  local hour today last
  hour=$(TZ=America/Toronto date +%-H); today=$(TZ=America/Toronto date +%F)
  last=$(node -e 'try{const d=require("./site/data/data.json");const t=d.full_at;process.stdout.write(t?new Date(t).toLocaleDateString("en-CA",{timeZone:"America/Toronto"}):"")}catch{}')
  [ "$hour" -ge 3 ] && [ "$last" != "$today" ]
}

node scraper/fetch-current.mjs
while :; do
  start=$(date +%s)
  mode=fast; full_due && mode=full
  FORCE_MODE=""
  echo "=== $(TZ=America/Toronto date '+%a %H:%M') Toronto: $mode refresh"
  if node scraper/refresh.mjs --mode=$mode; then publish; else echo "refresh failed; keeping the last data"; fi
  next=$(( start + 900 )); now=$(date +%s)
  [ $(( next + 600 )) -ge "$END" ] && break
  [ "$next" -gt "$now" ] && sleep $(( next - now ))
done
echo "loop finished"
