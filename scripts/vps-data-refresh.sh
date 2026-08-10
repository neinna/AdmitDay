#!/usr/bin/env bash
set -euo pipefail

# VPS-only data refresh runner. It relies on secrets already present on the VPS
# and must not be run in GitHub Actions with app secrets duplicated there.

MODE="${1:-pr}"
APP_DIR="${APP_DIR:-/root/app}"
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
  python3 -m pip install --user beautifulsoup4 requests
  npm ci
}

open_refresh_pr() {
  require_env OPENAI_API_KEY
  require_gh_token

  prepare_checkout
  git switch -C "$BRANCH" origin/main
  install_dependencies

  ADMITDAY_SKIP_POSTGRES_SEED=1 npm run refresh:data

  git add schools.json data/school-embeddings.json
  if git diff --cached --quiet; then
    echo "No tracked data changes to commit."
    return 0
  fi

  git commit -m "data: refresh school program data"
  git push --force-with-lease origin "$BRANCH"
  gh workflow run ci.yml --repo "$REPO" --ref "$BRANCH"

  local body
  body="$(cat <<'PR_BODY'
Automated weekly school data refresh.

This run used the validated refresh pipeline:
- scrape NYC-SIFT, DOE Open Data, and MySchools program data
- validate school count, required fields, and MySchools program provenance
- rebuild RAG embeddings
- skip production Postgres seeding until merge

This PR is intended to be merged by the VPS data refresh runner, not by a human. Run `scripts/vps-data-refresh.sh merge` after CI passes; it only merges when the changed files are the expected data artifacts and the GitHub CI test is green. Then run `scripts/vps-data-refresh.sh apply` to seed Postgres from the merged `schools.json`.
PR_BODY
)"

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
  require_env POSTGRES_URL

  prepare_checkout
  install_dependencies

  npx ts-node --compiler-options '{"module":"commonjs","moduleResolution":"node"}' --transpile-only scripts/seed-schools.ts
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
