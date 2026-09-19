#!/usr/bin/env bash
set -euo pipefail

# VPS-only data refresh runner. It relies on secrets already present on the VPS
# and must not be run in GitHub Actions with app secrets duplicated there.

MODE="${1:-pr}"
APP_DIR="${APP_DIR:-/root/admitday-data}"  # /root/app is a different app (hs-navigator)
APP_ENV_FILE="${APP_ENV_FILE:-$APP_DIR/.env.local}"
ROOT_ENV_FILE="${ROOT_ENV_FILE:-/root/.env.local}"
AGENT_ENV_FILE="${AGENT_ENV_FILE:-/root/.env.agents}"
BRANCH="${DATA_REFRESH_BRANCH:-data/weekly-refresh}"
REPO="${GITHUB_REPO:-neinna/AdmitDay}"
EXPECTED_DATA_FILES="data/school-embeddings.json
schools.json"

load_env_file() {
  local file="$1"
  if [ -f "$file" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$file"
    set +a
  fi
}

require_env() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
}

require_gh_token() {
  if [ -z "${GH_TOKEN:-}" ] && [ -n "${GITHUB_TOKEN:-}" ]; then
    export GH_TOKEN="$GITHUB_TOKEN"
  fi
  require_env GH_TOKEN
}

prepare_checkout() {
  cd "$APP_DIR"
  git fetch origin main
  git switch main
  git pull --ff-only origin main
}

install_dependencies() {
  # Ubuntu 24.04 blocks `pip install --user` (PEP 668), which aborted every
  # run. The VPS has python3-bs4 and python3-requests from apt, so only fall
  # back to pip if an import is actually missing.
  if ! python3 -c 'import bs4, requests, openpyxl' 2>/dev/null; then
    python3 -m pip install --user --break-system-packages beautifulsoup4 requests openpyxl
  fi
  npm ci
}

report_refresh_failure() {
  local summary="$1"
  require_gh_token

  local title="Data refresh failed"
  local body
  body="$(cat <<BODY
The scheduled VPS data refresh (\`scripts/vps-data-refresh.sh pr\`) failed during the scrape or validation step.

Time (UTC): $(date -u +%Y-%m-%dT%H:%M:%SZ)
Branch: $BRANCH

Failure summary:
\`\`\`
$summary
\`\`\`
BODY
)"

  local existing
  existing="$(gh issue list --repo "$REPO" --search "$title in:title" --state open --json number --jq '.[0].number // empty')"

  if [ -n "$existing" ]; then
    gh issue comment "$existing" --repo "$REPO" --body "$body"
  else
    gh issue create --repo "$REPO" --title "$title" --body "$body"
  fi
}

build_refresh_pr_body() {
  local previous_file="$1"
  local fetched_at
  fetched_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  node -e '
    const fs = require("fs");
    function load(filePath) {
      if (!fs.existsSync(filePath)) return [];
      try {
        const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    const previous = load(process.argv[1]);
    const current = load(process.argv[2]);
    const fetchedAt = process.argv[3];
    const excluded = load(process.argv[4]).filter((d) => typeof d === "string");
    const dbn = (s) => (s && typeof s.dbn === "string" ? s.dbn : null);
    const programCount = (schools) =>
      schools.reduce((n, s) => n + (Array.isArray(s.programs) ? s.programs.length : 0), 0);
    const previousDbns = new Set(previous.map(dbn).filter(Boolean));
    const currentDbns = new Set(current.map(dbn).filter(Boolean));
    const added = [...currentDbns].filter((d) => !previousDbns.has(d));
    const removed = [...previousDbns].filter((d) => !currentDbns.has(d));
    const fmt = (list) => (list.length ? list.join(", ") : "(none)");

    console.log(`Automated school data refresh.

- School count: ${previous.length} -> ${current.length}
- Added DBNs: ${fmt(added)}
- Removed DBNs: ${fmt(removed)}
- Excluded DBNs (no programs in this admissions cycle on MySchools): ${fmt(excluded)}
- Program count: ${programCount(previous)} -> ${programCount(current)}
- Fetched at: ${fetchedAt}

This run used the validated refresh pipeline:
- scrape NYC-SIFT, DOE Open Data, and MySchools program data
- validate school count, required fields, and MySchools program provenance
- rebuild RAG embeddings

This PR is intended to be merged by the VPS data refresh runner, not by a human. Run \`scripts/vps-data-refresh.sh merge\` after CI passes; it only merges when the changed files are the expected data artifacts and the GitHub CI test is green. Loading happens in Vercel after the data PR merges (/api/cron/seed-schools).`);
  ' "$previous_file" "schools.json" "$fetched_at" "schools.excluded.json"
}

open_refresh_pr() {
  require_env OPENAI_API_KEY
  require_gh_token

  prepare_checkout
  git switch -C "$BRANCH" origin/main
  install_dependencies

  local previous_schools
  previous_schools="$(mktemp)"
  cp schools.json "$previous_schools" 2>/dev/null || echo '[]' >"$previous_schools"

  local refresh_log
  refresh_log="$(mktemp)"

  if ! ADMITDAY_SKIP_POSTGRES_SEED=1 npm run refresh:data >"$refresh_log" 2>&1; then
    cat "$refresh_log"
    report_refresh_failure "$(tail -n 200 "$refresh_log")"
    rm -f "$refresh_log" "$previous_schools"
    exit 1
  fi
  cat "$refresh_log"
  rm -f "$refresh_log"

  git add schools.json data/school-embeddings.json
  if git diff --cached --quiet; then
    echo "No tracked data changes to commit."
    rm -f "$previous_schools"
    return 0
  fi

  git commit -m "data: refresh school program data"
  git push --force-with-lease origin "$BRANCH"
  gh workflow run ci.yml --repo "$REPO" --ref "$BRANCH"

  local body
  body="$(build_refresh_pr_body "$previous_schools")"
  rm -f "$previous_schools"

  if gh pr view "$BRANCH" --repo "$REPO" --json number >/dev/null 2>&1; then
    gh pr edit "$BRANCH" --repo "$REPO" --title "data: refresh school program data" --body "$body"
  else
    gh pr create --repo "$REPO" --base main --head "$BRANCH" --title "data: refresh school program data" --body "$body"
  fi
}

assert_refresh_pr_files() {
  require_gh_token

  local files
  files="$(gh pr diff "$BRANCH" --repo "$REPO" --name-only | sort)"

  if [ "$files" != "$EXPECTED_DATA_FILES" ]; then
    echo "Refusing to merge data refresh PR with unexpected files:" >&2
    echo "$files" >&2
    exit 1
  fi
}

assert_refresh_ci_green() {
  require_gh_token

  local passing_tests
  passing_tests="$(gh pr view "$BRANCH" --repo "$REPO" --json statusCheckRollup --jq '[.statusCheckRollup[] | select((.name // .context) == "test") | select(((.status // "") == "COMPLETED" and (.conclusion // "") == "SUCCESS") or ((.state // "") == "SUCCESS"))] | length')"

  if [ "$passing_tests" != "1" ]; then
    echo "Refusing to merge data refresh PR before the GitHub CI test is green." >&2
    exit 1
  fi
}

merge_refresh_pr() {
  assert_refresh_pr_files
  assert_refresh_ci_green

  gh pr merge "$BRANCH" --repo "$REPO" --squash --delete-branch --subject "data: refresh school program data"
}

apply_merged_data() {
  echo "Loading happens in Vercel after the data PR merges (/api/cron/seed-schools)"
  exit 0
}

load_env_file "$APP_ENV_FILE"
load_env_file "$ROOT_ENV_FILE"
load_env_file "$AGENT_ENV_FILE"

case "$MODE" in
  pr)
    open_refresh_pr
    ;;
  merge)
    merge_refresh_pr
    ;;
  apply)
    apply_merged_data
    ;;
  *)
    echo "Usage: $0 [pr|merge|apply]" >&2
    exit 2
    ;;
esac
