#!/usr/bin/env bash
set -euo pipefail

# Resume the paused VPS data refresh in one command. Run on the VPS from
# /root/admitday-data. Refreshes, merges the data PR, then reinstalls cron.
# Any failure exits before cron is touched.

APP_DIR="${APP_DIR:-/root/admitday-data}"
BRANCH="${DATA_REFRESH_BRANCH:-data/weekly-refresh}"
REPO="${GITHUB_REPO:-neinna/AdmitDay}"
REFRESH_SCRIPT="${REFRESH_SCRIPT:-./scripts/vps-data-refresh.sh}"
CRONTAB_BIN="${CRONTAB_BIN:-crontab}"
CRON_FILE="${CRON_FILE:-scripts/vps-data-cron.txt}"

export APP_DIR

# `pr` already rebuilds embeddings (scripts/refresh-data.ts step 5).
"$REFRESH_SCRIPT" pr

if gh pr view "$BRANCH" --repo "$REPO" >/dev/null 2>&1; then
  gh pr checks "$BRANCH" --repo "$REPO" --watch --fail-fast
  "$REFRESH_SCRIPT" merge
else
  echo "No data PR to merge."
fi

# Idempotent: drop old refresh lines, append the repo's cron lines. Comments
# and blank lines of the cron file are skipped so repeat runs don't stack them.
current="$("$CRONTAB_BIN" -l 2>/dev/null || true)"
{
  printf '%s\n' "$current" | grep -v 'vps-data-refresh.sh' || true
  grep -v -e '^[[:space:]]*#' -e '^[[:space:]]*$' "$CRON_FILE" || true
} | "$CRONTAB_BIN" -

"$CRONTAB_BIN" -l
