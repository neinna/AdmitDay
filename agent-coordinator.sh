#!/bin/bash

# AdmitDay autonomous coding agent coordinator.
# Polls GitHub for open issues labeled "agent-ok", runs a Claude agent per issue
# on a branch, verifies with npm test + npm run build, has an independent
# reviewer approve the diff, and opens a PR. On a clean approval it enables
# GitHub auto-merge on the PR (GitHub merges once the required "test" check
# passes); a diff the reviewer flags as touching the database/connection
# layer, migrations, seeding, secrets, or deploy/infra config is labeled
# "needs-you" instead and left for a human to merge.
#
# Two labels, deliberately distinct. They used to be one ("needs-review"),
# which made an issue list read as a backlog of neglect when most of it was
# not waiting on anybody:
#   needs-you    a pull request exists and is waiting on a human decision —
#                an escalated diff to verify and merge, or a real merge
#                conflict to resolve. Actionable.
#   agent-stuck  no pull request exists. The agent ran out of budget, failed
#                its attempts, or could not open the PR. A flag, not a task:
#                the fix is usually to resize or re-specify the issue.
# This coordinator itself NEVER pushes to main and NEVER merges directly.

# Load credentials
source /home/agent/.env.agents

# The Langfuse SDK reads these from the environment, so they must survive into
# the trace script's process whether or not .env.agents used `export`. Values
# are never logged, never passed as arguments, and never written to the repo.
export LANGFUSE_PUBLIC_KEY LANGFUSE_SECRET_KEY LANGFUSE_HOST
# ANTHROPIC_API_KEY comes from /home/agent/.env.agents (sourced above). The
# app checkout holds no secrets: /home/agent/app/.env.local was removed on
# 2026-09-18 after the agent read it and wrote placeholder keys into it.

APP_DIR="/home/agent/app"
LOG_FILE="/home/agent/agent-coordinator.log"
OFFSET_FILE="/home/agent/.tg_offset"
TRIGGER_LABEL="agent-ok"
CLAUDE_TIMEOUT=1800
CLAUDE_IMPLEMENT_MODEL="${CLAUDE_IMPLEMENT_MODEL:-sonnet}"
CLAUDE_REVIEW_MODEL="${CLAUDE_REVIEW_MODEL:-sonnet}"
CLAUDE_PLANNER_MODEL="${CLAUDE_PLANNER_MODEL:-sonnet}"
CLAUDE_IMPLEMENT_MAX_USD="${CLAUDE_IMPLEMENT_MAX_USD:-5.00}"
CLAUDE_REVIEW_MAX_USD="${CLAUDE_REVIEW_MAX_USD:-0.75}"
CLAUDE_PLANNER_MAX_USD="${CLAUDE_PLANNER_MAX_USD:-0.50}"
CLAUDE_TRIAGE_MAX_USD="${CLAUDE_TRIAGE_MAX_USD:-0.50}"
LF_TRACE_SCRIPT="${APP_DIR}/scripts/langfuse_trace.py"
LF_TRACE_PYTHON="${LF_TRACE_PYTHON:-/home/agent/.venvs/agent-observability/bin/python}"
RUN_METADATA_DIR="/home/agent/agent-run-metadata"
LF_RUN_FILE=""
SELF_UPDATE_INTERVAL_SECONDS="${SELF_UPDATE_INTERVAL_SECONDS:-300}"
SELF_UPDATE_STAMP="/tmp/agent-coordinator-self-update.last"
SELF_UPDATE_LOCK="/tmp/agent-coordinator-self-update.lock"
RECONCILE_INTERVAL_SECONDS="${RECONCILE_INTERVAL_SECONDS:-1800}"
RECONCILE_STAMP="/tmp/agent-coordinator-reconcile.last"
RUNNING_COORDINATOR_SCRIPT="${RUNNING_COORDINATOR_SCRIPT:-/home/agent/agent-coordinator.sh}"
BUILD_CACHE_MIN_FREE_MB="${BUILD_CACHE_MIN_FREE_MB:-2048}"

# env_fingerprint: one hash over every secrets file the agent must never
# touch: .env files in the app checkout (except committed *.example files)
# and the coordinator's own .env.agents. Compared before and after each agent
# attempt; any change fails the run.
env_fingerprint() {
  {
    find "$APP_DIR" -maxdepth 3 -path "$APP_DIR/node_modules" -prune -o \
      -type f -name '.env*' ! -name '*.example' -print 2>/dev/null | sort
    find "$APP_DIR" -maxdepth 3 -path "$APP_DIR/node_modules" -prune -o \
      -type f -name '.env*' ! -name '*.example' -print0 2>/dev/null | sort -z | xargs -0 -r sha256sum
    sha256sum /home/agent/.env.agents 2>/dev/null
  } | sha256sum | cut -d' ' -f1
}

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

self_update_from_main() {
  local NOW LAST
  NOW=$(date +%s)
  LAST=$(cat "$SELF_UPDATE_STAMP" 2>/dev/null || echo 0)
  if [ $((NOW - LAST)) -lt "$SELF_UPDATE_INTERVAL_SECONDS" ]; then
    return 0
  fi
  echo "$NOW" > "$SELF_UPDATE_STAMP" 2>/dev/null || true

  (
    flock -n 9 || exit 0
    cd "$APP_DIR" || exit 0

    local BRANCH
    BRANCH=$(git branch --show-current 2>/dev/null || echo "")
    if [ "$BRANCH" != "main" ]; then
      log "Self-update: on ${BRANCH:-unknown}, skipping until coordinator is idle on main"
      exit 0
    fi

    if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
      log "Self-update: tracked local changes present, skipping pull"
      exit 0
    fi

    if git fetch --quiet origin main >> "$LOG_FILE" 2>&1; then
      local LOCAL_SHA REMOTE_SHA BASE_SHA
      LOCAL_SHA=$(git rev-parse HEAD 2>/dev/null || echo "")
      REMOTE_SHA=$(git rev-parse origin/main 2>/dev/null || echo "")
      if [ -n "$LOCAL_SHA" ] && [ "$LOCAL_SHA" != "$REMOTE_SHA" ]; then
        BASE_SHA=$(git merge-base HEAD origin/main 2>/dev/null || echo "")
        if [ "$BASE_SHA" != "$LOCAL_SHA" ]; then
          log "Self-update: local main diverged from origin/main, skipping pull"
        else
          log "Self-update: fast-forwarding main from ${LOCAL_SHA:0:7} to ${REMOTE_SHA:0:7}"
          git pull --ff-only --quiet origin main >> "$LOG_FILE" 2>&1 || log "Self-update: fast-forward pull failed"
        fi
      fi
    else
      log "Self-update: fetch failed"
    fi

    # The pull above only advances the checked-out repo at $APP_DIR; nothing
    # yet installs its agent-coordinator.sh over the copy PM2 actually runs
    # at /home/agent/agent-coordinator.sh. Run this comparison on every
    # check, not only right after a successful pull, so a running copy that
    # has already drifted from the repo gets corrected even when main itself
    # hasn't moved this cycle.
    install_running_coordinator_script
    [ $? -eq 42 ] && exit 42
    exit 0
  ) 9>"$SELF_UPDATE_LOCK"

  local UPDATE_RC=$?
  [ "$UPDATE_RC" -eq 42 ] && return 42
  return 0
}

# install_running_coordinator_script: compare $APP_DIR/agent-coordinator.sh
# (the repo's copy, possibly just fast-forwarded to origin/main) against
# /home/agent/agent-coordinator.sh (the copy PM2 actually runs). If their
# contents differ, stage the repo's copy in a temp file in the same
# directory, gate it with `bash -n`, and `mv` the temp file over the running
# path — never write into the running file in place, since a running bash
# process reads its script incrementally off disk and an in-place write
# would corrupt that read, whereas `mv` swaps the inode underneath it
# atomically. Logs the old and new blob hashes either way, so the log shows
# which coordinator version is live. Returns 42 if it installed a new script
# and kicked off a PM2 restart, 0 otherwise (including when a candidate
# fails `bash -n`, in which case the running script is left untouched).
install_running_coordinator_script() {
  local REPO_SCRIPT="$APP_DIR/agent-coordinator.sh"
  local RUNNING_SCRIPT="$RUNNING_COORDINATOR_SCRIPT"

  [ -f "$REPO_SCRIPT" ] || return 0
  cmp -s "$REPO_SCRIPT" "$RUNNING_SCRIPT" 2>/dev/null && return 0

  local OLD_HASH NEW_HASH
  if [ -f "$RUNNING_SCRIPT" ]; then
    OLD_HASH=$(git hash-object "$RUNNING_SCRIPT" 2>/dev/null || echo "unknown")
  else
    OLD_HASH="none"
  fi
  NEW_HASH=$(git hash-object "$REPO_SCRIPT" 2>/dev/null || echo "unknown")

  local TMP_SCRIPT
  TMP_SCRIPT=$(mktemp "${RUNNING_SCRIPT}.XXXXXX") || return 0
  cp "$REPO_SCRIPT" "$TMP_SCRIPT"

  if ! bash -n "$TMP_SCRIPT" 2>>"$LOG_FILE"; then
    log "Self-update: repo's agent-coordinator.sh (blob ${NEW_HASH}) failed 'bash -n' — keeping running copy (blob ${OLD_HASH}), NOT restarting"
    rm -f "$TMP_SCRIPT"
    return 0
  fi

  if ! mv "$TMP_SCRIPT" "$RUNNING_SCRIPT"; then
    log "Self-update: mv of staged agent-coordinator.sh (blob ${NEW_HASH}) onto the running copy failed — keeping running copy (blob ${OLD_HASH}), NOT restarting"
    rm -f "$TMP_SCRIPT"
    return 0
  fi

  # Observed 2026-09-18 13:40 and 13:50 UTC: the running copy's blob hash
  # changed (the mv above ran and PM2 was already serving the new script)
  # but this "installed" line never landed in the log. The moment mv lands,
  # /home/agent/agent-coordinator.sh already has the new content, and
  # anything reacting to that — our own `pm2 restart` below included — can
  # tear this process down before it finishes writing. `log()` pipes through
  # `echo | tee`, which forks two more processes and does not write until
  # both are scheduled and run; that scheduling delay is exactly the kind of
  # gap a restart racing this line can win. Write it directly with the
  # current shell process instead — a plain builtin `echo` with simple
  # redirection needs no fork — and force it to disk with `sync` before
  # anything else runs, so the write is done before a restart can pre-empt
  # it.
  local INSTALL_MSG="[$(date '+%Y-%m-%d %H:%M:%S')] Self-update: installed agent-coordinator.sh (blob ${OLD_HASH} -> ${NEW_HASH}) over the running copy, restarting coordinator under PM2"
  echo "$INSTALL_MSG"
  echo "$INSTALL_MSG" >> "$LOG_FILE"
  sync
  (sleep 1; pm2 restart agent-coordinator --update-env >> "$LOG_FILE" 2>&1) &
  return 42
}

maybe_self_update_or_exit() {
  self_update_from_main
  local UPDATE_RC=$?
  if [ "$UPDATE_RC" -eq 42 ]; then
    exit 0
  fi
}

# --- Langfuse instrumentation -------------------------------------------------
# Observability only. These helpers must never change what the coordinator does,
# so they touch no shared state, always return 0, and send diagnostics to
# $LOG_FILE rather than stdout (review_change's stdout is its return value).
# If Langfuse is unconfigured, unreachable, or the script is missing, a run
# proceeds exactly as it did before this was added.

lf_now_ns() {
  python3 -c 'import time; print(time.time_ns())' 2>/dev/null || echo ""
}

# lf_record NAME START_NS END_NS OK CLAUDE_JSON ATTEMPT [STATUS]
#   OK:           1, 0, or "" when the notion of pass/fail does not apply
#   CLAUDE_JSON:  a claude --output-format json file, or "" for a non-LLM phase
#   STATUS:       optional small enum, e.g. passed, failed, skipped-test-failed
# Appends one JSON line per phase to this run's buffer — one line per model when
# a single claude call billed more than one, so per-model spend stays exact.
# Only names, numbers and timings are written here. No prompts, no diffs, no
# agent output: what is not extracted below cannot leave the VPS.
lf_record() {
  [ -n "$LF_RUN_FILE" ] || return 0
  LF_NAME="$1" LF_START="$2" LF_END="$3" LF_OK="$4" LF_JSON="$5" LF_ATTEMPT="$6" \
  LF_STATUS="$7" \
  python3 << 'PYEOF' >> "$LF_RUN_FILE" 2>> "$LOG_FILE"
import json, os

def num(key):
    v = os.environ.get(key, "")
    return int(v) if v.isdigit() else None

base = {"name": os.environ["LF_NAME"]}
for field, key in (("start_ns", "LF_START"), ("end_ns", "LF_END"),
                   ("attempt", "LF_ATTEMPT")):
    value = num(key)
    if value is not None:
        base[field] = value
if os.environ.get("LF_OK") in ("0", "1"):
    base["ok"] = os.environ["LF_OK"] == "1"
if os.environ.get("LF_STATUS"):
    base["status"] = os.environ["LF_STATUS"]

rows = []
path = os.environ.get("LF_JSON") or ""
if path and os.path.exists(path):
    try:
        d = json.load(open(path))
    except Exception:
        d = {}
    # Newer claude CLIs report per-model usage; older ones only report totals.
    for model, u in (d.get("modelUsage") or {}).items():
        row = dict(base, model=model,
                   input_tokens=u.get("inputTokens"),
                   output_tokens=u.get("outputTokens"),
                   cache_read_tokens=u.get("cacheReadInputTokens"),
                   cache_creation_tokens=u.get("cacheCreationInputTokens"),
                   cost_usd=u.get("costUSD"))
        rows.append(row)
    if not rows and d:
        u = d.get("usage") or {}
        rows.append(dict(base, model=d.get("model") or "unknown",
                         input_tokens=u.get("input_tokens"),
                         output_tokens=u.get("output_tokens"),
                         cache_read_tokens=u.get("cache_read_input_tokens"),
                         cache_creation_tokens=u.get("cache_creation_input_tokens"),
                         cost_usd=d.get("total_cost_usd")))

for row in (rows or [base]):
    print(json.dumps({k: v for k, v in row.items() if v is not None}))
PYEOF
  return 0
}

# lf_emit ISSUE TITLE BRANCH OUTCOME ATTEMPTS LABEL START_NS END_NS TEST BUILD REVIEWER PR [TRACE_NAME]
# Assembles this run's buffered phases into one payload and hands it to the only
# script that talks to Langfuse. Hard-timed and swallowed: a hung or dead
# Langfuse costs the loop at most 30 seconds and nothing else. The same
# sanitized payload is also written under RUN_METADATA_DIR for baseline analysis.
# TRACE_NAME defaults to "agent-run" (real issue runs); the periodic reconcile
# sweep passes "agent-reconcile" so it never dilutes agent-run charts (issue #262).
lf_emit() {
  local RUN_FILE="$LF_RUN_FILE"
  LF_RUN_FILE=""
  [ -n "$RUN_FILE" ] || return 0
  if [ ! -f "$LF_TRACE_SCRIPT" ]; then
    log "Langfuse: ${LF_TRACE_SCRIPT} not found, skipping trace for #${1}"
    rm -f "$RUN_FILE"
    return 0
  fi
  if [ ! -x "$LF_TRACE_PYTHON" ]; then
    LF_TRACE_PYTHON="python3"
  fi

  LF_ISSUE="$1" LF_TITLE="$2" LF_BRANCH="$3" LF_OUTCOME="$4" LF_ATTEMPTS="$5" \
  LF_LABEL="$6" LF_TSTART="$7" LF_TEND="$8" LF_SPANS="$RUN_FILE" \
  LF_TEST_RESULT="$9" LF_BUILD_RESULT="${10}" LF_REVIEWER_RESULT="${11}" \
  LF_PR_OUTCOME="${12}" LF_TRACE_NAME="${13:-agent-run}" LF_METADATA_DIR="$RUN_METADATA_DIR" \
  GITHUB_REPO="$GITHUB_REPO" \
  python3 << 'PYEOF' 2>> "$LOG_FILE" | timeout 30 "$LF_TRACE_PYTHON" "$LF_TRACE_SCRIPT" 2>> "$LOG_FILE"
import json, os

spans = []
try:
    with open(os.environ["LF_SPANS"]) as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                spans.append(json.loads(line))
            except Exception:
                pass
except Exception:
    pass

def num(key):
    v = os.environ.get(key, "")
    return int(v) if v.isdigit() else None

trace = {
    "issue_number": num("LF_ISSUE"),
    "issue_title": os.environ.get("LF_TITLE") or None,
    "branch": os.environ.get("LF_BRANCH") or None,
    "repo": os.environ.get("GITHUB_REPO") or None,
    "outcome": os.environ.get("LF_OUTCOME") or None,
    "attempts": num("LF_ATTEMPTS"),
    "github_label": os.environ.get("LF_LABEL") or None,
    "test_result": os.environ.get("LF_TEST_RESULT") or None,
    "build_result": os.environ.get("LF_BUILD_RESULT") or None,
    "reviewer_result": os.environ.get("LF_REVIEWER_RESULT") or None,
    "pr_outcome": os.environ.get("LF_PR_OUTCOME") or None,
    "trace_name": os.environ.get("LF_TRACE_NAME") or None,
    "start_ns": num("LF_TSTART"),
    "end_ns": num("LF_TEND"),
}
payload = {"trace": {k: v for k, v in trace.items() if v is not None},
           "spans": spans}

metadata_dir = os.environ.get("LF_METADATA_DIR") or ""
if metadata_dir:
    try:
        os.makedirs(metadata_dir, exist_ok=True)
        issue = payload["trace"].get("issue_number") or "unknown"
        started = payload["trace"].get("start_ns") or "unknown"
        path = os.path.join(metadata_dir, f"issue-{issue}-{started}.json")
        tmp = path + ".tmp"
        payload["trace"]["metadata_file"] = path
        with open(tmp, "w") as fh:
            json.dump(payload, fh, indent=2, sort_keys=True)
            fh.write("\n")
        os.replace(tmp, path)
    except Exception:
        pass

print(json.dumps(payload))
PYEOF
  rm -f "$RUN_FILE"
  return 0
}

# lf_discard: drop this run's buffered phases without submitting a trace.
# Used for the provider-halt path, where the model was never called — issue
# #318: those no-op runs were still emitting a $0 "implement" observation,
# diluting every cost/latency average on the agent-run dashboard 6:1. The
# halt streak counter (record_provider_halt) and alert issue (#263/#301)
# already record these events, so nothing is lost by not tracing them.
lf_discard() {
  local RUN_FILE="$LF_RUN_FILE"
  LF_RUN_FILE=""
  [ -n "$RUN_FILE" ] && rm -f "$RUN_FILE"
  return 0
}

telegram() {
  local MSG=$(echo "$1" | tr '\n' ' ')
  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d chat_id="${TELEGRAM_CHAT_ID}" \
    -d "text=${MSG}" > /dev/null
}

gh_api() {
  # gh_api METHOD PATH [DATA]
  local METHOD="$1" PATH_="$2" DATA="$3"
  if [ -n "$DATA" ]; then
    curl -sL -X "$METHOD" \
      -H "Authorization: token ${GITHUB_TOKEN}" \
      -H "Accept: application/vnd.github.v3+json" \
      "https://api.github.com/repos/${GITHUB_REPO}${PATH_}" \
      -d "$DATA"
  else
    curl -sL -X "$METHOD" \
      -H "Authorization: token ${GITHUB_TOKEN}" \
      -H "Accept: application/vnd.github.v3+json" \
      "https://api.github.com/repos/${GITHUB_REPO}${PATH_}"
  fi
}

json_escape() {
  python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))"
}

github_label() {
  gh_api POST "/issues/$1/labels" "{\"labels\":[\"$2\"]}" > /dev/null
}

github_remove_label() {
  gh_api DELETE "/issues/$1/labels/$2" > /dev/null
}

blocking_issue_number() {
  # blocking_issue_number ISSUE_BODY -> echoes the first still-open "Blocked by
  # #N" dependency found in the body (AGENTS.md: "An issue whose body contains
  # a line `Blocked by #N` is skipped while issue #N is still open"), or
  # nothing if there is no such line or every referenced issue is closed.
  # Supports multiple "Blocked by #N" lines; checked in order, first open wins.
  local BODY="$1" NUM STATE
  for NUM in $(printf '%s\n' "$BODY" | grep -oE '^Blocked by #[0-9]+\r?$' | grep -oE '[0-9]+'); do
    STATE=$(gh_api GET "/issues/$NUM" | python3 -c "
import json,sys
try:
    print(json.load(sys.stdin).get('state','') or '')
except Exception:
    pass
")
    if [ "$STATE" = "open" ]; then
      echo "$NUM"
      return 0
    fi
  done
  return 1
}

malformed_blocked_by() {
  # malformed_blocked_by ISSUE_BODY -> succeeds (no output) if the body
  # mentions "blocked by" case-insensitively but no line matches the strict
  # "Blocked by #N" form blocking_issue_number requires (issue #359). This is
  # a near-miss check, not a state check: it fires purely on shape, so a
  # well-formed "Blocked by #N" line never trips it even if issue #N is
  # already closed. Do not try to parse the loose form into a number here —
  # the point is to stop and tell a human, not guess the intended blocker.
  local BODY="$1"
  printf '%s\n' "$BODY" | grep -qiE '[Bb]locked [Bb]y' || return 1
  printf '%s\n' "$BODY" | grep -qE '^Blocked by #[0-9]+\r?$' && return 1
  return 0
}

github_comment() {
  local BODY
  BODY=$(printf '%s' "$2" | json_escape)
  gh_api POST "/issues/$1/comments" "{\"body\":${BODY}}" > /dev/null
}

github_create_issue() {
  # github_create_issue TITLE [BODY] -> echoes issue number
  local TITLE_JSON BODY_JSON RESPONSE
  TITLE_JSON=$(printf '%s' "$1" | json_escape)
  BODY_JSON=$(printf '%s' "${2:-}" | json_escape)
  RESPONSE=$(gh_api POST "/issues" "{\"title\":${TITLE_JSON},\"body\":${BODY_JSON},\"labels\":[\"${TRIGGER_LABEL}\"]}")
  echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('number',''))" 2>/dev/null
}

# --- Provider-queue-stall alerting -------------------------------------------
# Observed 2026-09-16/17: the queue retried a provider-unavailable issue every
# 10 minutes for ~22 hours (133 no-op runs) with no alert anywhere reachable
# overnight. The blocked-provider label (#168) exists but nobody watches
# labels, and Telegram is being removed (#166), so the only channel left is a
# GitHub issue. After 3 CONSECUTIVE provider-unavailable halts (no successful
# claude call in between), open or comment on one issue titled "Agent queue
# stalled", labeled needs-you. When a run next succeeds, comment "resumed at
# <time>" and close it. State survives coordinator restarts in a small JSON
# file and is reset the moment any claude call succeeds (RC 0) — direct proof
# the provider is reachable again.
STALL_STATE_FILE="${STALL_STATE_FILE:-/tmp/agent-coordinator-stall-state.json}"
STALL_THRESHOLD=3
STALL_ISSUE_TITLE="Agent queue stalled"

stall_state_field() {
  # stall_state_field FIELD -> value from $STALL_STATE_FILE, or "" if absent/missing
  python3 -c "
import json
try:
    d = json.load(open('$STALL_STATE_FILE'))
except Exception:
    d = {}
print(d.get('$1', '') or '')
" 2>/dev/null
}

stall_state_write() {
  # stall_state_write COUNT FIRST_TIME REASON ALERT_ISSUE
  SS_COUNT="$1" SS_FIRST="$2" SS_REASON="$3" SS_ISSUE="$4" python3 << 'PYEOF' > "$STALL_STATE_FILE" 2>/dev/null
import json, os
print(json.dumps({
    "count": int(os.environ.get("SS_COUNT") or 0),
    "first_time": os.environ.get("SS_FIRST") or "",
    "reason": os.environ.get("SS_REASON") or "",
    "alert_issue": os.environ.get("SS_ISSUE") or "",
}))
PYEOF
}

github_create_needs_you_issue() {
  # github_create_needs_you_issue TITLE BODY -> echoes issue number, labeled
  # needs-you directly (never agent-ok: this is an alert, not queue work).
  local TITLE_JSON BODY_JSON RESPONSE
  TITLE_JSON=$(printf '%s' "$1" | json_escape)
  BODY_JSON=$(printf '%s' "$2" | json_escape)
  RESPONSE=$(gh_api POST "/issues" "{\"title\":${TITLE_JSON},\"body\":${BODY_JSON},\"labels\":[\"needs-you\"]}")
  echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('number','') or '')" 2>/dev/null
}

# record_provider_halt REASON: call once per provider-unavailable run_agent
# attempt. Increments the consecutive-halt count; at exactly the 3rd it opens
# the alert issue, and on every one after that (while the streak continues)
# it comments on that same issue instead of opening a duplicate.
record_provider_halt() {
  local REASON="$1" COUNT FIRST_TIME ALERT_ISSUE NOW
  COUNT=$(stall_state_field "count")
  [ -z "$COUNT" ] && COUNT=0
  FIRST_TIME=$(stall_state_field "first_time")
  ALERT_ISSUE=$(stall_state_field "alert_issue")
  NOW=$(date '+%Y-%m-%d %H:%M:%S %Z')
  COUNT=$((COUNT + 1))
  [ -z "$FIRST_TIME" ] && FIRST_TIME="$NOW"

  if [ "$COUNT" -ge "$STALL_THRESHOLD" ]; then
    if [ -n "$ALERT_ISSUE" ]; then
      github_comment "$ALERT_ISSUE" "Still stalled: ${COUNT} consecutive provider-unavailable halts so far. Latest reason:

${REASON}"
      log "Provider halt streak: ${COUNT} consecutive, commented on existing alert issue #${ALERT_ISSUE}"
    else
      local BODY="The agent queue has been halted by provider-unavailable errors ${COUNT} times in a row, with no successful run in between.

First stall: ${FIRST_TIME}
Reason: ${REASON}

The coordinator keeps retrying automatically every 10 minutes. This issue will be commented on and closed once a run succeeds."
      ALERT_ISSUE=$(github_create_needs_you_issue "$STALL_ISSUE_TITLE" "$BODY")
      if [ -n "$ALERT_ISSUE" ]; then
        log "Provider halt streak reached ${COUNT}, opened alert issue #${ALERT_ISSUE} (needs-you)"
      else
        log "Provider halt streak reached ${COUNT}, but failed to open the alert issue"
      fi
    fi
  else
    log "Provider halt streak: ${COUNT}/${STALL_THRESHOLD} consecutive provider-unavailable halts"
  fi

  stall_state_write "$COUNT" "$FIRST_TIME" "$REASON" "$ALERT_ISSUE"
}

# resolve_provider_halt: call whenever a claude call succeeds (RC 0), direct
# proof the provider is reachable again. Resets any in-progress streak; if
# that streak had opened an alert issue, comments "resumed at <time>" and
# closes it.
resolve_provider_halt() {
  local COUNT ALERT_ISSUE NOW
  COUNT=$(stall_state_field "count")
  [ -z "$COUNT" ] && COUNT=0
  [ "$COUNT" -eq 0 ] && return 0

  ALERT_ISSUE=$(stall_state_field "alert_issue")
  if [ -n "$ALERT_ISSUE" ]; then
    NOW=$(date '+%Y-%m-%d %H:%M:%S %Z')
    github_comment "$ALERT_ISSUE" "resumed at ${NOW}"
    gh_api PATCH "/issues/${ALERT_ISSUE}" "{\"state\":\"closed\"}" > /dev/null
    log "Provider halt streak resolved: closed alert issue #${ALERT_ISSUE} (resumed at ${NOW})"
  fi
  rm -f "$STALL_STATE_FILE"
}

github_open_pr() {
  # github_open_pr BRANCH TITLE BODY -> echoes html_url (empty on failure)
  local TITLE_JSON BODY_JSON RESPONSE
  TITLE_JSON=$(printf '%s' "$2" | json_escape)
  BODY_JSON=$(printf '%s' "$3" | json_escape)
  RESPONSE=$(gh_api POST "/pulls" "{\"title\":${TITLE_JSON},\"head\":\"$1\",\"base\":\"main\",\"body\":${BODY_JSON}}")
  echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('html_url',''))" 2>/dev/null
}

github_get_pr_node_id() {
  # github_get_pr_node_id PR_NUMBER -> echoes GraphQL node_id (empty on failure)
  gh_api GET "/pulls/$1" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('node_id','') or '')" 2>/dev/null
}

github_enable_automerge() {
  # github_enable_automerge PR_NODE_ID -> 0 on success, 1 on failure
  # No gh CLI on this box, so we hit the GraphQL endpoint directly with the
  # same GITHUB_TOKEN used by gh_api (REST has no auto-merge toggle).
  local NODE_ID="$1" QUERY_DATA RESPONSE
  QUERY_DATA=$(python3 -c "
import json, sys
query = 'mutation(\$id: ID!) { enablePullRequestAutoMerge(input: {pullRequestId: \$id, mergeMethod: SQUASH}) { pullRequest { autoMergeRequest { enabledAt } } } }'
print(json.dumps({'query': query, 'variables': {'id': sys.argv[1]}}))
" "$NODE_ID")
  RESPONSE=$(curl -sL -X POST \
    -H "Authorization: bearer ${GITHUB_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.github.com/graphql" \
    -d "$QUERY_DATA")
  echo "$RESPONSE" | python3 -c "
import json,sys
try:
    d = json.load(sys.stdin)
    ok = bool(d.get('data',{}).get('enablePullRequestAutoMerge',{}).get('pullRequest',{}).get('autoMergeRequest',{}).get('enabledAt'))
    sys.exit(0 if ok else 1)
except Exception:
    sys.exit(1)
"
}

# reconcile_open_prs: the pipeline is entirely event-driven (issue labeled,
# branch pushed, PR opened, check completed) and event-driven systems drop
# events — e.g. a GitHub Actions outage that leaves a PR with no "test" check
# run at all, which branch protection then blocks on forever even though
# nothing is wrong with the code. This periodic sweep compares intended state
# (should be progressing toward merge) to actual state and corrects it,
# instead of waiting for an event that already failed to fire.
#
# Only touches PRs whose head branch matches the "task-<issue>-" prefix this
# coordinator generates in run_agent — never a PR opened by a human or by
# another tool. Never merges, never pushes to main: update-branch only
# re-triggers CI and fast-forwards the PR branch onto main (which can let an
# auto-merge-enabled PR merge once CI passes — that is the intended
# self-healing behavior, not a side effect to guard against).
reconcile_open_prs() {
  local RUN_START T0 T1
  RUN_START=$(lf_now_ns)
  LF_RUN_FILE="/tmp/lf-run-reconcile.jsonl"
  : > "$LF_RUN_FILE" 2>/dev/null || LF_RUN_FILE=""

  local QUALIFYING
  QUALIFYING=$(gh_api GET "/pulls?state=open&per_page=100" | python3 -c "
import json, re, sys
try:
    prs = json.load(sys.stdin)
except Exception:
    prs = []
for pr in prs:
    ref = (pr.get('head') or {}).get('ref') or ''
    if re.match(r'^task-[0-9]+-', ref):
        print(f\"{pr.get('number')}\t{ref}\")
" 2>>"$LOG_FILE")

  T0=$(lf_now_ns)
  local NUM REF
  while IFS=$'\t' read -r NUM REF; do
    [ -z "$NUM" ] && continue
    local ISSUE_NUM
    ISSUE_NUM=$(echo "$REF" | python3 -c "
import re, sys
m = re.match(r'^task-([0-9]+)-', sys.stdin.read())
print(m.group(1) if m else '')
" 2>>"$LOG_FILE")
    [ -z "$ISSUE_NUM" ] && continue

    local PR_DETAIL MERGEABLE MERGEABLE_STATE SHA
    PR_DETAIL=$(gh_api GET "/pulls/${NUM}")
    MERGEABLE=$(echo "$PR_DETAIL" | python3 -c "
import json, sys
try:
    v = json.load(sys.stdin).get('mergeable')
except Exception:
    v = None
print('true' if v is True else ('false' if v is False else 'unknown'))
" 2>>"$LOG_FILE")
    MERGEABLE_STATE=$(echo "$PR_DETAIL" | python3 -c "
import json, sys
try:
    print(json.load(sys.stdin).get('mergeable_state') or '')
except Exception:
    print('')
" 2>>"$LOG_FILE")
    SHA=$(echo "$PR_DETAIL" | python3 -c "
import json, sys
try:
    print((json.load(sys.stdin).get('head') or {}).get('sha') or '')
except Exception:
    print('')
" 2>>"$LOG_FILE")

    # Real merge conflict (GraphQL's mergeable enum would report CONFLICTING
    # here; REST's equivalent is mergeable_state=dirty with mergeable=false).
    # Cannot be auto-resolved — escalate instead of touching the branch.
    if [ "$MERGEABLE_STATE" = "dirty" ] && [ "$MERGEABLE" = "false" ]; then
      log "Reconcile: PR #${NUM} (${REF}) has a real merge conflict, escalating issue #${ISSUE_NUM}"
      github_label "$ISSUE_NUM" "needs-you"
      github_comment "$ISSUE_NUM" "Reconciliation swept PR #${NUM} (branch \`${REF}\`) and found a real merge conflict with main that cannot be auto-resolved. Please resolve manually."
      continue
    fi

    local HAS_TEST_CHECK="0"
    if [ -n "$SHA" ]; then
      HAS_TEST_CHECK=$(gh_api GET "/commits/${SHA}/check-runs" | python3 -c "
import json, sys
try:
    runs = (json.load(sys.stdin).get('check_runs')) or []
    print('1' if any(r.get('name') == 'test' for r in runs) else '0')
except Exception:
    print('0')
" 2>>"$LOG_FILE")
    fi

    if [ "$HAS_TEST_CHECK" != "1" ] || [ "$MERGEABLE_STATE" = "behind" ]; then
      log "Reconcile: re-triggering CI for PR #${NUM} (${REF}) via update-branch (test_check_present=${HAS_TEST_CHECK} mergeable_state=${MERGEABLE_STATE})"
      gh_api PUT "/pulls/${NUM}/update-branch" > /dev/null
    fi
  done <<< "$QUALIFYING"
  T1=$(lf_now_ns)
  lf_record "reconcile" "$T0" "$T1" "1" "" "" "swept"

  lf_emit "" "reconcile-open-prs" "" "swept" "" "" "$RUN_START" "$(lf_now_ns)" "" "" "" "" "agent-reconcile"
  return 0
}

maybe_reconcile_open_prs() {
  local NOW LAST
  NOW=$(date +%s)
  LAST=$(cat "$RECONCILE_STAMP" 2>/dev/null || echo 0)
  if [ $((NOW - LAST)) -lt "$RECONCILE_INTERVAL_SECONDS" ]; then
    return 0
  fi
  echo "$NOW" > "$RECONCILE_STAMP" 2>/dev/null || true
  reconcile_open_prs || log "Reconcile: pass errored, continuing"
}

# Run one claude agent call with timeout, capturing the JSON result.
# Reads the prompt from $PROMPT.
# run_claude OUT_FILE [RESUME_ID] [TOOLS] [MODEL] [MAX_BUDGET_USD]
# Returns: 0 on success, 124 on timeout, 1 on any other error.
run_claude() {
  local OUT_FILE="$1"
  local RESUME_ID="$2"
  local TOOLS="${3:-Bash,Read,Write,Edit,Glob,Grep}"
  local MODEL="${4:-}"
  local MAX_BUDGET_USD="${5:-}"
  local RESUME_ARGS=()
  local MODEL_ARGS=()
  local BUDGET_ARGS=()
  if [ -n "$RESUME_ID" ]; then
    RESUME_ARGS=(--resume "$RESUME_ID")
  fi
  if [ -n "$MODEL" ]; then
    MODEL_ARGS=(--model "$MODEL")
  fi
  if [ -n "$MAX_BUDGET_USD" ]; then
    BUDGET_ARGS=(--max-budget-usd "$MAX_BUDGET_USD")
  fi
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Claude call: model=${MODEL:-default} max_budget_usd=${MAX_BUDGET_USD:-none} tools=${TOOLS}" >> "$LOG_FILE"
  ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" timeout "$CLAUDE_TIMEOUT" claude \
    -p "$PROMPT" \
    --output-format json \
    --allowedTools "$TOOLS" \
    "${MODEL_ARGS[@]}" \
    "${BUDGET_ARGS[@]}" \
    "${RESUME_ARGS[@]}" \
    < /dev/null \
    > "$OUT_FILE" 2>> "$LOG_FILE"
  local RC=$?
  if [ $RC -eq 124 ]; then
    return 124
  fi
  python3 -c "
import json,sys
try:
    d = json.load(open('$OUT_FILE'))
    sys.exit(0 if not d.get('is_error') else 1)
except Exception:
    sys.exit(1)
" && return 0 || return 1
}

claude_json_field() {
  # claude_json_field FILE FIELD
  python3 -c "
import json,sys
try:
    d = json.load(open('$1'))
    print(d.get('$2','') or '')
except Exception:
    pass
"
}

claude_provider_unavailable() {
  # claude_provider_unavailable FILE
  # Returns 0 when the claude JSON result represents provider/billing/rate-limit
  # unavailability rather than agent implementation failure.
  python3 - "$1" << 'PYEOF'
import json
import re
import sys

try:
    data = json.load(open(sys.argv[1]))
except Exception:
    sys.exit(1)

text = " ".join(str(data.get(k, "")) for k in ("result", "terminal_reason", "error", "message"))
providerish = re.search(
    r"credit balance|usage limit|rate limit|overloaded|temporarily unavailable|api_error",
    text,
    re.I,
)
status = data.get("api_error_status")
is_api_error = data.get("is_error") is True and (status is not None or data.get("terminal_reason") == "api_error")
sys.exit(0 if is_api_error and providerish else 1)
PYEOF
}

claude_budget_exhausted() {
  # claude_budget_exhausted FILE
  # Returns 0 when the claude JSON result represents the coordinator's own
  # per-call --max-budget-usd cap firing. That is a controlled stop, not a
  # provider outage and not proof the implementation was bad.
  python3 - "$1" << 'PYEOF'
import json
import re
import sys

try:
    data = json.load(open(sys.argv[1]))
except Exception:
    sys.exit(1)

text = " ".join(str(data.get(k, "")) for k in ("result", "terminal_reason", "error", "message"))
budgetish = re.search(
    r"--max-budget-usd|max(?:imum)? budget|budget[^.]{0,80}(exceed|exhaust|limit|cap)|spend limit|cost cap",
    text,
    re.I,
)
sys.exit(0 if data.get("is_error") is True and budgetish else 1)
PYEOF
}

# triage_verdict_line: reads triage text on stdin, echoes the single
# well-formed "TRIAGE: <CLASS> - <reason>" line it contains (the last one, if
# more than one slipped in), or nothing if no line matches one of the four
# allowed classes. Used to gate run_triage's github_comment: a missing or
# malformed verdict must post nothing (issue #214), so absence of output here
# is the signal, not an error.
triage_verdict_line() {
  python3 -c "
import re
import sys

text = sys.stdin.read()
matches = re.findall(
    r'^TRIAGE: (?:TOO-BIG|RESUMABLE|NEEDS-DECISION|INFRA) - .+\$', text, re.M
)
print(matches[-1] if matches else '')
"
}

# Coordinator-owned verification: the ONLY success signal.
# Keeps Next's webpack cache (.next/cache, ~325MB) between builds: a warm
# build takes ~74s on this VPS versus ~160s cold. Everything else in .next is
# wiped so no stale output survives. If free disk ever drops below
# BUILD_CACHE_MIN_FREE_MB the cache is dropped too, as it was when this VPS
# had <600MB free.
verify_app() {
  local OUT="$1" RC=0
  local T0 T1
  TEST_RESULT="not-run"
  BUILD_RESULT="not-run"
  if [ -d "$APP_DIR/.next" ]; then
    find "$APP_DIR/.next" -mindepth 1 -maxdepth 1 ! -name cache -exec rm -rf {} +
  fi
  local FREE_MB
  FREE_MB=$(df -Pm "$APP_DIR" | awk 'NR==2 {print $4}')
  if [ -n "$FREE_MB" ] && [ "$FREE_MB" -lt "$BUILD_CACHE_MIN_FREE_MB" ]; then
    rm -rf "$APP_DIR/.next/cache"
  fi
  T0=$(lf_now_ns)
  (cd "$APP_DIR" && npm test) > "$OUT" 2>&1 || RC=1
  T1=$(lf_now_ns)
  TEST_RESULT="$([ $RC -eq 0 ] && echo passed || echo failed)"
  lf_record "test" "$T0" "$T1" "$([ $RC -eq 0 ] && echo 1 || echo 0)" "" "" "$TEST_RESULT"
  if [ $RC -eq 0 ]; then
    T0=$(lf_now_ns)
    (cd "$APP_DIR" && npm run build) >> "$OUT" 2>&1 || RC=1
    T1=$(lf_now_ns)
    BUILD_RESULT="$([ $RC -eq 0 ] && echo passed || echo failed)"
    lf_record "build" "$T0" "$T1" "$([ $RC -eq 0 ] && echo 1 || echo 0)" "" "" "$BUILD_RESULT"
  else
    BUILD_RESULT="skipped-test-failed"
    lf_record "build" "" "" "0" "" "" "$BUILD_RESULT"
  fi
  return $RC
}

# Independent reviewer with fresh context: given only the issue and the diff,
# does this change actually resolve the issue? Echoes the review text.
# Returns 0=approve, 1=reject, 2=reviewer unavailable (do not block on infra).
review_change() {
  local ISSUE_NUMBER="$1" ISSUE_TITLE="$2" ISSUE_BODY="$3"
  local REVIEW_OUT="/tmp/review-issue-${ISSUE_NUMBER}.json"
  local DIFF
  DIFF=$(cd "$APP_DIR" && git diff origin/main...HEAD | head -c 60000)

  local PROMPT="You are an independent code reviewer for the AdmitDay Next.js app. You have fresh context: judge only what is in front of you.

The issue this change claims to resolve:
Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}

${ISSUE_BODY}

The complete diff against main:
\`\`\`diff
${DIFF}
\`\`\`

Questions to answer:
1. Does this diff actually resolve the issue?
2. What did it break or put at risk? Look for scope creep (changes the issue did not ask for), modifications to data/schools.json (forbidden), deleted or weakened tests, and unrelated refactors.
   Also reject if the diff adds a new external service, hosted database, or paid API (including one called directly with fetch) that the issue does not name, or adds complexity the issue did not ask for, such as new configuration options or fallback paths.
3. Does this diff touch the database/connection layer, migrations, seeding, how a secret or session is handled, or the deploy/infra config? CI has no live database, so an APPROVE here cannot confirm the change actually works at runtime — that is exactly how a runtime bug shipped before.

You may read files in /home/agent/app for context. Be strict about scope: if the diff contains significant changes beyond what the issue asked for, reject it.

End your response with exactly one line:
VERDICT: APPROVE
or
VERDICT: REJECT - <one-line reason>

Then, regardless of the verdict above, add exactly one more line — RISK: LIVE-VERIFY-NEEDED — ONLY if the diff does at least one of these:
- changes the database/connection layer, schema, migrations, or seeding
- changes how a secret, credential, or session is stored, transmitted, logged, or validated
- changes deploy/infra config: vercel.json, next.config.js, a CI workflow, or this coordinator

Do NOT add it merely because the diff reads a new environment variable through process.env, or documents one in a .env*.example file. Reading a configuration value is not handling a secret, and escalating on it sends routine changes to a human for no reason.

The line, when it applies, is exactly:
RISK: LIVE-VERIFY-NEEDED"

  # No log() calls in this function: its stdout is the review text.
  local T0 T1
  T0=$(lf_now_ns)
  run_claude "$REVIEW_OUT" "" "Read,Glob,Grep" "$CLAUDE_REVIEW_MODEL" "$CLAUDE_REVIEW_MAX_USD"
  local RC=$?
  T1=$(lf_now_ns)
  local REVIEW_TEXT
  REVIEW_TEXT=$(claude_json_field "$REVIEW_OUT" "result")
  local REVIEW_STATUS="unavailable"
  local REVIEW_OK=0
  if [ $RC -eq 0 ] && [ -n "$REVIEW_TEXT" ]; then
    if echo "$REVIEW_TEXT" | grep -q "VERDICT: APPROVE"; then
      REVIEW_STATUS="approved"
      REVIEW_OK=1
    else
      REVIEW_STATUS="rejected"
    fi
  fi
  lf_record "review" "$T0" "$T1" "$REVIEW_OK" "$REVIEW_OUT" "" "$REVIEW_STATUS"
  rm -f "$REVIEW_OUT"
  echo "$REVIEW_TEXT"
  if [ $RC -ne 0 ] || [ -z "$REVIEW_TEXT" ]; then
    REVIEWER_RESULT="unavailable"
    return 2
  fi
  if echo "$REVIEW_TEXT" | grep -q "VERDICT: APPROVE"; then
    REVIEWER_RESULT="approved"
    return 0
  fi
  REVIEWER_RESULT="rejected"
  return 1
}

# Planner: break a Telegram /goal into <=5 small issues labeled agent-ok.
# The planner claude call is READ-ONLY; the coordinator creates the issues.
plan_goal() {
  local GOAL="$1"
  local PLAN_OUT="/tmp/plan-goal.json"

  local PROMPT="You are a planning agent for the AdmitDay Next.js app at /home/agent/app. You have READ-ONLY access: explore the codebase with Read/Glob/Grep to ground your plan in reality.

Owner's goal: ${GOAL}

Break this goal into 1-5 SMALL, INDEPENDENT, individually testable GitHub issues. Each issue must be completable by one agent in one sitting, verifiable by 'npm test && npm run build', and must not depend on another issue in this batch being done first. Reference real file paths you verified exist. Never propose modifying data/schools.json.

Output ONLY a JSON object, no markdown fences, in exactly this shape:
{\"issues\": [{\"title\": \"...\", \"body\": \"...\"}]}
Each body: what to change, where (file paths), and acceptance criteria."

  run_claude "$PLAN_OUT" "" "Read,Glob,Grep" "$CLAUDE_PLANNER_MODEL" "$CLAUDE_PLANNER_MAX_USD"
  local RC=$?
  if [ $RC -ne 0 ]; then
    telegram "Planner failed for goal: ${GOAL}"
    log "Planner failed for goal: ${GOAL}"
    rm -f "$PLAN_OUT"
    return 1
  fi

  local CREATED
  CREATED=$(GITHUB_TOKEN="$GITHUB_TOKEN" GITHUB_REPO="$GITHUB_REPO" TRIGGER_LABEL="$TRIGGER_LABEL" python3 - "$PLAN_OUT" << 'PYEOF'
import json, sys, os, re, urllib.request

try:
    d = json.load(open(sys.argv[1]))
    text = d.get('result', '') or ''
except Exception:
    sys.exit(1)

m = re.search(r'\{.*\}', text, re.S)
if not m:
    sys.exit(1)
try:
    plan = json.loads(m.group(0))
except Exception:
    sys.exit(1)

created = []
for it in plan.get('issues', [])[:5]:
    title = (it.get('title') or '').strip()
    if not title:
        continue
    body = it.get('body') or ''
    req = urllib.request.Request(
        f"https://api.github.com/repos/{os.environ['GITHUB_REPO']}/issues",
        data=json.dumps({'title': title, 'body': body,
                         'labels': [os.environ['TRIGGER_LABEL']]}).encode(),
        headers={'Authorization': f"token {os.environ['GITHUB_TOKEN']}",
                 'Accept': 'application/vnd.github.v3+json'},
        method='POST')
    try:
        with urllib.request.urlopen(req) as r:
            num = json.load(r).get('number')
            created.append(f"#{num} {title}")
    except Exception:
        created.append(f"FAILED to create: {title}")
print('\n'.join(created))
PYEOF
)
  rm -f "$PLAN_OUT"
  if [ -n "$CREATED" ]; then
    telegram "Planner created issues for goal '${GOAL}': ${CREATED}"
    log "Planner created issues: ${CREATED}"
  else
    telegram "Planner produced no parseable issues for goal: ${GOAL}"
    log "Planner produced no parseable issues for goal: ${GOAL}"
  fi
}

handle_telegram_commands() {
  local OFFSET=0
  if [ -f "$OFFSET_FILE" ]; then
    OFFSET=$(cat "$OFFSET_FILE")
  fi

  local UPDATES
  UPDATES=$(curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${OFFSET}&timeout=0")

  while IFS=$'\t' read -r UPDATE_ID TEXT; do
    if [ -z "$UPDATE_ID" ]; then continue; fi
    echo $((UPDATE_ID + 1)) > "$OFFSET_FILE"

    if [[ "$TEXT" == /issue\ * ]]; then
      local TITLE="${TEXT#/issue }"
      local ISSUE_NUMBER
      ISSUE_NUMBER=$(github_create_issue "$TITLE")
      if [ -n "$ISSUE_NUMBER" ]; then
        telegram "Created issue #${ISSUE_NUMBER}: ${TITLE}"
        log "Created issue #${ISSUE_NUMBER} via Telegram: ${TITLE}"
      else
        telegram "Failed to create issue for: ${TITLE}"
        log "Failed to create issue via Telegram: ${TITLE}"
      fi
    elif [[ "$TEXT" == /goal\ * ]]; then
      local GOAL="${TEXT#/goal }"
      log "Planning goal via Telegram: ${GOAL}"
      telegram "Planning goal (read-only exploration, max 5 issues): ${GOAL}"
      plan_goal "$GOAL"
    fi
  done < <(echo "$UPDATES" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for u in data.get('result', []):
    uid = u.get('update_id', 0)
    text = u.get('message', {}).get('text', '').replace('\t', ' ').replace('\n', ' ')
    print(f'{uid}\t{text}')
")
}

# preserve_branch_before_abandoning REASON
# Called from run_agent (relies on its ISSUE_NUMBER/BRANCH/COMMIT_TITLE/
# LOG_FILE locals via bash's dynamic scoping) right before a run gives up on
# an issue. If the working tree is dirty, commits it to the current task
# branch and sets DIRTY_TREE_NOTE for the caller's github_comment; either way
# leaves the branch in place instead of deleting it.
#
# Observed 2026-09-17 (#162, issue #207): a run that died mid-edit on the
# budget cap left its edits sitting uncommitted, `git checkout main` carried
# them across since nothing conflicted, and the entry guard on the NEXT issue
# (`git reset --hard && git clean -fd`, see "Scrub the working tree" above)
# would have wiped them if a human had not happened to look first. Nothing
# can build on a discarded working tree; a human or a retry can build on a
# commit, so this both makes the commit and stops deleting the one place it
# lives.
preserve_branch_before_abandoning() {
  local REASON="$1"
  DIRTY_TREE_NOTE=""
  if [ -n "$(git status --porcelain)" ]; then
    log "Issue #${ISSUE_NUMBER}: dirty tree while abandoning (${REASON}) — committing partial work to ${BRANCH} instead of discarding it"
    git status --porcelain >> "$LOG_FILE" 2>&1
    if git add -A && git commit -m "${COMMIT_TITLE} (partial — ${REASON})" >> "$LOG_FILE" 2>&1; then
      DIRTY_TREE_NOTE="

Uncommitted work from this run was committed to \`${BRANCH}\` (branch left in place, not deleted) so it isn't lost."
    fi
  fi
}

# run_triage REASON OUTPUT_TAIL ATTEMPTS_USED
# Diagnoses WHY a run just got labeled agent-stuck and posts one issue
# comment, once, when the coordinator applies that label (issue #214). Relies
# on run_agent's ISSUE_NUMBER/ISSUE_TITLE/ISSUE_BODY/BRANCH locals via bash's
# dynamic scoping, like preserve_branch_before_abandoning above.
#
# Advisory only: this function never calls github_label and never queues
# work. It is read-only (Read,Glob,Grep — no Bash, no Write/Edit) and capped
# by its own CLAUDE_TRIAGE_MAX_USD budget, separate from implementation and
# review. On any error — claude fails, times out, or returns text without one
# of the four well-formed "TRIAGE: <CLASS> - ..." lines — it posts nothing
# and only logs, so a triage failure can never change what the issue's label
# already says or stop the coordinator loop. Always returns 0.
run_triage() {
  local REASON="$1" OUTPUT_TAIL="$2" ATTEMPTS_USED="$3"
  local TRIAGE_OUT="/tmp/triage-issue-${ISSUE_NUMBER}.json"

  local BRANCH_STATUS="no — the task branch has no commits ahead of main"
  if [ -n "$(git log origin/main.."$BRANCH" --oneline 2>/dev/null)" ]; then
    BRANCH_STATUS="yes — branch \`${BRANCH}\` has commits ahead of main"
  fi

  local PROMPT="You are triaging one GitHub issue in the AdmitDay Next.js app that just got stuck and was labeled agent-stuck. You have READ-ONLY access to /home/agent/app: use Read/Glob/Grep to check the issue against AGENTS.md (especially the \"Cost And Issue Sizing\" section) and against the product rules already encoded in the repo (guardrails, tests, design docs). Diagnose only — do not propose or make any code change.

Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}

${ISSUE_BODY}

Why this run got stuck:
${REASON}

Attempts used: ${ATTEMPTS_USED}
Does the task branch have commits: ${BRANCH_STATUS}

Failure output tail (may be empty):
${OUTPUT_TAIL}

Diagnose the ROOT CAUSE, not just the symptom, and pick exactly one class:
- TOO-BIG: the issue bundles more than one concern per AGENTS.md's sizing rules and should be split. Say which parts.
- RESUMABLE: real, correct work already exists on the task branch and a retry should start from it instead of from scratch. Name the branch.
- NEEDS-DECISION: the issue contradicts the PRD/product rules, or leaves a product decision (a threshold, a scale, a rule) undefined, so no implementation could pass review without a human answering one question first. State that one question, answerable in a sentence.
- INFRA: something outside the issue itself broke (provider outage, a broken test unrelated to the change, a broken tool), not a sizing or spec problem.

End your comment with exactly one line, using the class you diagnosed:
TRIAGE: TOO-BIG - <which parts to split into>
TRIAGE: RESUMABLE - <branch with the partial work>
TRIAGE: NEEDS-DECISION - <the one product question, answerable in a sentence>
TRIAGE: INFRA - <what broke outside the issue itself>"

  local T0 T1
  T0=$(lf_now_ns)
  run_claude "$TRIAGE_OUT" "" "Read,Glob,Grep" "sonnet" "${CLAUDE_TRIAGE_MAX_USD}"
  local RC=$?
  T1=$(lf_now_ns)

  local TRIAGE_TEXT VERDICT_LINE TRIAGE_OK=0 TRIAGE_STATUS
  TRIAGE_TEXT=$(claude_json_field "$TRIAGE_OUT" "result")
  if [ $RC -eq 124 ]; then
    TRIAGE_STATUS="timeout"
    log "Issue #${ISSUE_NUMBER}: triage timed out, posting nothing"
  elif [ $RC -ne 0 ] || [ -z "$TRIAGE_TEXT" ]; then
    TRIAGE_STATUS="failed"
    log "Issue #${ISSUE_NUMBER}: triage claude call failed, posting nothing"
  else
    VERDICT_LINE=$(triage_verdict_line <<< "$TRIAGE_TEXT")
    if [ -z "$VERDICT_LINE" ]; then
      TRIAGE_STATUS="unparseable"
      log "Issue #${ISSUE_NUMBER}: triage produced no parseable TRIAGE: line, posting nothing"
    else
      TRIAGE_OK=1
      TRIAGE_STATUS="${VERDICT_LINE#TRIAGE: }"
      TRIAGE_STATUS="${TRIAGE_STATUS%% - *}"
      github_comment "$ISSUE_NUMBER" "$TRIAGE_TEXT"
      log "Issue #${ISSUE_NUMBER}: triage posted (${TRIAGE_STATUS})"
    fi
  fi

  lf_record "triage" "$T0" "$T1" "$TRIAGE_OK" "$TRIAGE_OUT" "$ATTEMPTS_USED" "$TRIAGE_STATUS"
  rm -f "$TRIAGE_OUT"
  return 0
}

# workflow_files_changed: 0 (true) when the current branch's diff against
# origin/main touches any path under .github/workflows/, 1 (false) otherwise.
# The agent's GitHub token has the `workflow` scope so it can add or edit CI
# workflow files; the repo is public and secrets live in Actions, so a
# workflow change that self-merges is the one path where a mistake could
# print a key into a public log (issue #306). Checked from run_agent after
# the agent's commit, before auto-merge is ever considered.
workflow_files_changed() {
  git diff --name-only origin/main...HEAD | grep -q '^\.github/workflows/'
}

run_agent() {
  local ISSUE_NUMBER=$1
  local RUN_START
  RUN_START=$(lf_now_ns)

  # Fetch full issue (title + body with newlines preserved) and its comments
  local ISSUE_FILE="/tmp/issue-${ISSUE_NUMBER}.json"
  gh_api GET "/issues/${ISSUE_NUMBER}" > "$ISSUE_FILE"
  local ISSUE_TITLE ISSUE_BODY ISSUE_COMMENTS
  ISSUE_TITLE=$(python3 -c "import json; print(json.load(open('$ISSUE_FILE')).get('title',''))")
  ISSUE_BODY=$(python3 -c "import json; print(json.load(open('$ISSUE_FILE')).get('body') or '(no body)')")
  rm -f "$ISSUE_FILE"

  if [ -z "$ISSUE_TITLE" ]; then
    log "Could not fetch issue #${ISSUE_NUMBER}, skipping"
    return
  fi

  # Dependency gate: skip this loop, untouched, while a "Blocked by #N" issue
  # is still open. Checked before the trigger label is ever touched, so a
  # blocked issue stays exactly as it was (still "agent-ok") and becomes
  # eligible again on a later poll once its blocker closes.
  local BLOCKER
  BLOCKER=$(blocking_issue_number "$ISSUE_BODY")
  if [ -n "$BLOCKER" ]; then
    log "Issue #${ISSUE_NUMBER}: skipping this loop, blocked by open issue #${BLOCKER}"
    return
  fi

  # Near-miss check: a body that says "blocked by" but not in the exact
  # shape the gate above requires would otherwise run with no dependency
  # held at all, silently (issue #359). Flag it for a human instead of
  # guessing the intended blocker.
  if malformed_blocked_by "$ISSUE_BODY"; then
    log "Issue #${ISSUE_NUMBER}: body mentions a blocker but no line matches 'Blocked by #N' exactly — the dependency gate will NOT hold. Fix the issue body."
    github_label "$ISSUE_NUMBER" "needs-you"
    return
  fi

  ISSUE_COMMENTS=$(gh_api GET "/issues/${ISSUE_NUMBER}/comments" | python3 -c "
import json,sys
try:
    cs = json.load(sys.stdin)
    out = '\n\n'.join(f\"[{c['user']['login']}]: {c['body']}\" for c in cs)
    print(out if out else '(no comments)')
except Exception:
    print('(no comments)')
")

  local SAFE_TITLE=$(echo "$ISSUE_TITLE" | tr ' ' '-' | tr '[:upper:]' '[:lower:]' | tr -dc 'a-z0-9-' | cut -c1-30)
  local BRANCH="task-${ISSUE_NUMBER}-${SAFE_TITLE}"
  local COMMIT_TITLE="fix: issue #${ISSUE_NUMBER} - ${ISSUE_TITLE}"
  local CLAUDE_OUT="/tmp/claude-issue-${ISSUE_NUMBER}.json"
  local VERIFY_OUT="/tmp/verify-issue-${ISSUE_NUMBER}.log"

  # Open this run's phase buffer. Everything lf_record writes from here until
  # lf_emit belongs to this issue's trace.
  LF_RUN_FILE="/tmp/lf-run-${ISSUE_NUMBER}.jsonl"
  : > "$LF_RUN_FILE" 2>/dev/null || LF_RUN_FILE=""

  log "Starting issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}"
  telegram "Starting issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}"

  # Remove trigger label immediately so a crash mid-run never causes an infinite loop
  github_remove_label "$ISSUE_NUMBER" "$TRIGGER_LABEL"
  github_label "$ISSUE_NUMBER" "in-progress"

  cd "$APP_DIR" || { log "FATAL: cannot cd to $APP_DIR"; LF_RUN_FILE=""; return; }

  # Scrub the working tree before touching branches.
  #
  # A run that failed, errored, or exhausted its budget can leave edits behind.
  # `git checkout main` carries modified tracked files across a branch switch
  # when they do not conflict, `git checkout -b` carries them again onto the new
  # task branch, and the `git add -A` fallback further down then commits the
  # PREVIOUS issue's half-finished work into THIS issue's pull request.
  #
  # Observed 2026-09-17: #162 exhausted its \$2 budget mid-edit, and its three
  # modified product files plus an untracked test file followed the coordinator
  # onto #166's branch, where #166 — a change that should touch only this script
  # — was about to commit all of them.
  #
  # Cleaning on entry rather than on exit is deliberate: there are five ways out
  # of a run (success, test failure, review rejection, claude error, provider
  # halt) and a guard on the single entry path cannot be bypassed by a new one.
  # The tree between issues is scratch space and holds nothing worth keeping.
  # `git clean -fd` leaves ignored files alone, so data/schools.json, .env.local,
  # node_modules, and .next survive.
  if [ -n "$(git status --porcelain)" ]; then
    log "Issue #${ISSUE_NUMBER}: working tree dirty on entry — discarding leftovers from a previous run:"
    git status --porcelain >> "$LOG_FILE" 2>&1
    git reset --hard >> "$LOG_FILE" 2>&1
    git clean -fd >> "$LOG_FILE" 2>&1
  fi

  git checkout main >> "$LOG_FILE" 2>&1 && git pull origin main >> "$LOG_FILE" 2>&1
  git branch -D "$BRANCH" 2>/dev/null
  git checkout -b "$BRANCH" >> "$LOG_FILE" 2>&1
  rm -f "$CLAUDE_OUT" "$VERIFY_OUT"

  local BRIEF="You are fixing a GitHub issue in the AdmitDay Next.js app.

Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}

${ISSUE_BODY}

Issue comments:
${ISSUE_COMMENTS}

Instructions:
- Work in /home/agent/app on branch ${BRANCH} (already checked out). Read /home/agent/app/AGENTS.md first and follow its house rules.
- Fix the issue. Stay strictly within its scope — an independent reviewer will reject scope creep. Add tests for your change in __tests__/ (add, don't overwrite existing tests).
- While working, run only the tests for what you changed ('npx jest __tests__/<file>') and 'npx tsc --noEmit'. Run the full 'npm test' once before committing. Do NOT run 'npm run build': the coordinator runs the full test suite and the build after you finish and will send you any failure.
- Solve the issue with the infrastructure the app already has (listed in AGENTS.md). Do not add a new external service, hosted database, or paid API unless the issue names it.
- Commit your work: cd /home/agent/app && git add -A && git commit -m \"${COMMIT_TITLE}\"
- Never modify data/schools.json.
- Never push, never merge, never switch branches.
- End with a short summary of what you changed and why (it becomes the pull request description)."

  local ATTEMPT=1
  local ATTEMPTS_USED=0
  local SUCCESS=0
  local FAIL_REASON=""
  local REVIEW_TEXT=""
  local PROMPT="$BRIEF"
  local OUTCOME="failed"
  local GH_LABEL=""
  local TEST_RESULT="not-run"
  local BUILD_RESULT="not-run"
  local REVIEWER_RESULT="not-run"
  local PR_OUTCOME="not-run"
  local DIRTY_TREE_NOTE=""

  while [ $ATTEMPT -le 2 ]; do
    log "Issue #${ISSUE_NUMBER}: agent attempt ${ATTEMPT}"
    ATTEMPTS_USED=$ATTEMPT
    local T0 T1
    T0=$(lf_now_ns)
    # WebFetch/WebSearch are included so an issue that integrates a third-party
    # SDK can read that SDK's documentation. Without them the agent can still
    # reach the network through Bash, but the only way to learn an unfamiliar API
    # is to npm install it and read the .d.ts files — which is what exhausted the
    # budget on #194 (Langfuse SDK) in six minutes on attempt 1. Reading a
    # quickstart page is orders of magnitude cheaper than inferring an API from
    # type definitions.
    local ENV_FP_BEFORE
    ENV_FP_BEFORE=$(env_fingerprint)
    # Never --resume: a resumed session re-sends the ENTIRE prior transcript —
    # including attempt 1's exploration — as input context on every turn of
    # attempt 2, so a 5-minute read-the-codebase phase gets billed again on
    # every retry turn instead of once. AGENTS.md already asks agents to do
    # this themselves ("write a compact task brief and start a fresh
    # implementation session"); attempt 2 gets that same fresh start, with
    # PROMPT below carrying forward just the issue, the failure reason, and
    # the files already touched (issue #207).
    run_claude "$CLAUDE_OUT" "" \
      "Bash,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch" "$CLAUDE_IMPLEMENT_MODEL" "$CLAUDE_IMPLEMENT_MAX_USD"
    local RC=$?
    if [ "$(env_fingerprint)" != "$ENV_FP_BEFORE" ]; then
      log "Issue #${ISSUE_NUMBER}: SECRETS FILE CHANGED during attempt ${ATTEMPT}: an .env file was created, edited, or deleted. Failing the run."
      github_comment "$ISSUE_NUMBER" "The coordinator stopped this run: during attempt ${ATTEMPT} the agent created, edited, or deleted a secrets (.env) file. Agents must never touch secrets. If the build needs a placeholder value, it belongs in a committed file where the PR diff shows it. Check the VPS before re-queuing."
      github_label "$ISSUE_NUMBER" "agent-stuck"
      github_remove_label "$ISSUE_NUMBER" "in-progress"
      OUTCOME="failed"; GH_LABEL="agent-stuck"; PR_OUTCOME="not-attempted"
      cd "$APP_DIR"
      git checkout main >> "$LOG_FILE" 2>&1
      lf_emit "$ISSUE_NUMBER" "$ISSUE_TITLE" "$BRANCH" "$OUTCOME" "$ATTEMPTS_USED" \
        "$GH_LABEL" "$RUN_START" "$(lf_now_ns)" "$TEST_RESULT" "$BUILD_RESULT" \
        "$REVIEWER_RESULT" "$PR_OUTCOME"
      rm -f "$CLAUDE_OUT" "$VERIFY_OUT"
      return 0
    fi
    T1=$(lf_now_ns)
    lf_record "implement" "$T0" "$T1" "$([ $RC -eq 0 ] && echo 1 || echo 0)" \
      "$CLAUDE_OUT" "$ATTEMPT"
    if [ $RC -eq 124 ]; then
      log "Issue #${ISSUE_NUMBER}: claude timed out on attempt ${ATTEMPT}"
      telegram "Timeout: agent hit the 30min limit on issue #${ISSUE_NUMBER} (attempt ${ATTEMPT})"
    elif [ $RC -ne 0 ]; then
      log "Issue #${ISSUE_NUMBER}: claude errored on attempt ${ATTEMPT}"
    fi
    if [ $RC -eq 0 ]; then
      github_remove_label "$ISSUE_NUMBER" "blocked-provider"
    fi
    [ $RC -eq 0 ] && resolve_provider_halt

    if [ $RC -ne 0 ] && claude_provider_unavailable "$CLAUDE_OUT"; then
      OUTCOME="provider-unavailable"
      log "Issue #${ISSUE_NUMBER}: provider unavailable (billing, rate limit, or API outage). Work was never attempted; restoring the issue to the queue."
      local STALL_REASON
      STALL_REASON=$(claude_json_field "$CLAUDE_OUT" "result")
      [ -z "$STALL_REASON" ] && STALL_REASON="(no error text captured on issue #${ISSUE_NUMBER})"
      record_provider_halt "$STALL_REASON"
      github_label "$ISSUE_NUMBER" "$TRIGGER_LABEL"
      github_label "$ISSUE_NUMBER" "blocked-provider"
      github_remove_label "$ISSUE_NUMBER" "in-progress"
      cd "$APP_DIR"
      git checkout main >> "$LOG_FILE" 2>&1
      git branch -D "$BRANCH" 2>/dev/null
      lf_discard
      rm -f "$CLAUDE_OUT" "$VERIFY_OUT"
      return 75
    fi

    if [ $RC -ne 0 ] && claude_budget_exhausted "$CLAUDE_OUT"; then
      OUTCOME="budget-exhausted"; GH_LABEL="agent-stuck"; PR_OUTCOME="not-attempted"
      log "Issue #${ISSUE_NUMBER}: Claude hit the coordinator max budget (${CLAUDE_IMPLEMENT_MAX_USD} USD) on attempt ${ATTEMPT}; labeling agent-stuck instead of retrying."
      cd "$APP_DIR"
      preserve_branch_before_abandoning "budget exhausted on attempt ${ATTEMPT}"
      github_comment "$ISSUE_NUMBER" "Agent stopped because the coordinator's Claude per-call budget cap was reached on attempt ${ATTEMPT}.

This is a controlled cost stop, not a verified implementation failure. The issue is labeled agent-stuck: no pull request was opened, so there is nothing to review. The usual fix is to split or re-specify the issue so it fits inside one capped run (see \"Cost And Issue Sizing\" in AGENTS.md), or raise the cap for this issue.${DIRTY_TREE_NOTE}"
      github_label "$ISSUE_NUMBER" "agent-stuck"
      run_triage "Claude hit the coordinator's per-call budget cap (\$${CLAUDE_IMPLEMENT_MAX_USD}) on attempt ${ATTEMPT} of 2. This is a controlled cost stop, not a verified implementation failure." \
        "$(claude_json_field "$CLAUDE_OUT" "result" | tail -c 4000)" "$ATTEMPTS_USED"
      github_remove_label "$ISSUE_NUMBER" "in-progress"
      git checkout main >> "$LOG_FILE" 2>&1
      lf_emit "$ISSUE_NUMBER" "$ISSUE_TITLE" "$BRANCH" "$OUTCOME" "$ATTEMPTS_USED" \
        "$GH_LABEL" "$RUN_START" "$(lf_now_ns)" "$TEST_RESULT" "$BUILD_RESULT" \
        "$REVIEWER_RESULT" "$PR_OUTCOME"
      rm -f "$CLAUDE_OUT" "$VERIFY_OUT"
      return 0
    fi

    FAIL_REASON=""
    # Objective verification by the coordinator — the only success signal.
    if [ $RC -eq 0 ] && verify_app "$VERIFY_OUT"; then
      cd "$APP_DIR"
      # Fallback: commit anything the agent left uncommitted.
      # Logged before staging, because `git add -A` is indiscriminate: if this
      # ever stages a file the issue had no business touching, the log is the
      # only place that will show it.
      if [ -n "$(git status --porcelain)" ]; then
        log "Issue #${ISSUE_NUMBER}: agent left work uncommitted, staging:"
        git status --porcelain >> "$LOG_FILE" 2>&1
        git add -A && git commit -m "$COMMIT_TITLE" >> "$LOG_FILE" 2>&1
      fi
      if [ -n "$(git log origin/main..HEAD --oneline)" ]; then
        # Independent reviewer pass (fresh context, issue + diff only)
        log "Issue #${ISSUE_NUMBER}: verification green, running reviewer"
        REVIEW_TEXT=$(review_change "$ISSUE_NUMBER" "$ISSUE_TITLE" "$ISSUE_BODY")
        local REVIEW_RC=$?
        if [ $REVIEW_RC -eq 1 ]; then
          FAIL_REASON="An independent reviewer examined your diff against the issue and REJECTED it:

${REVIEW_TEXT}

Address the reviewer's objections. Diagnose what is wrong before changing anything else."
          log "Issue #${ISSUE_NUMBER}: reviewer rejected attempt ${ATTEMPT}: $(echo "$REVIEW_TEXT" | grep -m1 'VERDICT: REJECT' | cut -c1-300)"
        else
          [ $REVIEW_RC -eq 2 ] && log "Issue #${ISSUE_NUMBER}: reviewer unavailable, proceeding without review"
          SUCCESS=1
          break
        fi
      else
        FAIL_REASON="Verification passed but no changes were committed on the branch. You must actually implement and commit the fix with: git add -A && git commit -m \"${COMMIT_TITLE}\""
        log "Issue #${ISSUE_NUMBER}: verification passed but no changes were committed"
      fi
    else
      local FAIL_TAIL
      FAIL_TAIL=$(tail -150 "$VERIFY_OUT" 2>/dev/null)
      [ -z "$FAIL_TAIL" ] && FAIL_TAIL="(the claude run itself failed or timed out before verification; check your previous work for incomplete edits)"
      FAIL_REASON="The coordinator ran 'npm test && npm run build' after your changes and it did not pass.

Failing output (tail):
${FAIL_TAIL}

Diagnose why this failed before changing anything else. Then fix it, run the tests for the files you changed and \`npx tsc --noEmit\`, then commit with message \"${COMMIT_TITLE}\". The coordinator reruns the full test suite and the build."
    fi

    if [ $ATTEMPT -lt 2 ]; then
      # Compact brief for the retry, NOT a resumed conversation (see the
      # run_claude call above): list only the files actually touched so far
      # (committed on this branch, or still sitting dirty in the tree) so the
      # fresh session can inspect them with git instead of re-exploring from
      # nothing.
      local RETRY_TOUCHED
      RETRY_TOUCHED=$(
        { git diff --name-only origin/main...HEAD -- 2>/dev/null
          git status --porcelain 2>/dev/null | awk '{print $2}'
        } | sort -u | grep -v '^$'
      )
      [ -z "$RETRY_TOUCHED" ] && RETRY_TOUCHED="(no files changed yet)"
      PROMPT="You are fixing a GitHub issue in the AdmitDay Next.js app. A previous attempt on this same issue just failed. This is a FRESH session with no memory of that attempt's exploration, so this brief is self-contained — read it instead of assuming shared context.

Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}

${ISSUE_BODY}

What went wrong on the previous attempt:
${FAIL_REASON}

Files already changed on branch ${BRANCH} (inspect with git diff/git log before re-exploring from scratch):
${RETRY_TOUCHED}

Instructions:
- Work in /home/agent/app on branch ${BRANCH} (already checked out). Read /home/agent/app/AGENTS.md first and follow its house rules.
- Fix the issue. Stay strictly within its scope — an independent reviewer will reject scope creep. Add tests for your change in __tests__/ (add, don't overwrite existing tests).
- While working, run only the tests for what you changed ('npx jest __tests__/<file>') and 'npx tsc --noEmit'. Run the full 'npm test' once before committing. Do NOT run 'npm run build': the coordinator runs the full test suite and the build after you finish and will send you any failure.
- Solve the issue with the infrastructure the app already has (listed in AGENTS.md). Do not add a new external service, hosted database, or paid API unless the issue names it.
- Commit your work: cd /home/agent/app && git add -A && git commit -m \"${COMMIT_TITLE}\"
- Never modify data/schools.json.
- Never push, never merge, never switch branches.
- End with a short summary of what you changed and why (it becomes the pull request description)."
      log "Issue #${ISSUE_NUMBER}: attempt ${ATTEMPT} failed, retrying in a fresh session with a compact brief"
    fi
    ATTEMPT=$((ATTEMPT + 1))
  done

  if [ $SUCCESS -eq 1 ]; then
    local SUMMARY
    SUMMARY=$(claude_json_field "$CLAUDE_OUT" "result")
    [ -z "$SUMMARY" ] && SUMMARY="(agent produced no summary)"

    local WORKFLOW_CHANGED=0
    workflow_files_changed && WORKFLOW_CHANGED=1

    local T0 T1
    T0=$(lf_now_ns)
    git push origin "$BRANCH" >> "$LOG_FILE" 2>&1
    local PR_BODY="${SUMMARY}

Closes #${ISSUE_NUMBER}"
    if [ "$WORKFLOW_CHANGED" -eq 1 ]; then
      PR_BODY="${PR_BODY}

This PR changes CI workflow files under \`.github/workflows/\`. It needs a human to review and merge — auto-merge was not enabled."
    fi
    local PR_URL
    PR_URL=$(github_open_pr "$BRANCH" "$COMMIT_TITLE" "$PR_BODY")
    T1=$(lf_now_ns)
    PR_OUTCOME="$([ -n "$PR_URL" ] && echo opened || echo creation-failed)"
    lf_record "pr" "$T0" "$T1" "$([ -n "$PR_URL" ] && echo 1 || echo 0)" "" "" "$PR_OUTCOME"

    if [ -n "$PR_URL" ]; then
      local PR_NUMBER="${PR_URL##*/}"
      if echo "$REVIEW_TEXT" | grep -q "RISK: LIVE-VERIFY-NEEDED" || [ "$REVIEW_RC" -eq 2 ] || [ "$WORKFLOW_CHANGED" -eq 1 ]; then
        # Escalate instead of auto-merging when any of: the reviewer flagged
        # the diff as unverifiable in CI (no live database), the reviewer
        # itself was unavailable, or the diff touches .github/workflows/ (the
        # agent's token has the `workflow` scope and the repo is public with
        # secrets living in Actions, so a self-merged CI change is the one
        # path where a mistake could print a key into a public log).
        local ESCALATION_REASON
        if [ "$REVIEW_RC" -eq 2 ]; then
          ESCALATION_REASON="was unavailable, so this diff was never independently reviewed"
        elif [ "$WORKFLOW_CHANGED" -eq 1 ]; then
          ESCALATION_REASON="changes CI workflow files under .github/workflows/"
          echo "$REVIEW_TEXT" | grep -q "RISK: LIVE-VERIFY-NEEDED" && REVIEWER_RESULT="approved-live-verify-needed"
        else
          ESCALATION_REASON="flagged it as touching the database/connection layer, migrations, seeding, environment/secrets, or deploy/infra config (RISK: LIVE-VERIFY-NEEDED)"
          REVIEWER_RESULT="approved-live-verify-needed"
        fi
        github_comment "$ISSUE_NUMBER" "Agent opened a pull request for this issue: ${PR_URL}

Tests and build verified green by the coordinator. The independent reviewer ${ESCALATION_REASON}. Auto-merge was NOT enabled — please verify before merging."
        github_label "$ISSUE_NUMBER" "needs-you"
        github_label "$PR_NUMBER" "needs-you"
        github_remove_label "$ISSUE_NUMBER" "in-progress"
        OUTCOME="needs-review"; GH_LABEL="needs-you"; PR_OUTCOME="opened-escalated"
        log "Issue #${ISSUE_NUMBER}: PR opened at ${PR_URL}, escalated (${ESCALATION_REASON}), auto-merge NOT enabled"
        telegram "PR ready for issue #${ISSUE_NUMBER} but ESCALATED for human review: ${ISSUE_TITLE} — ${PR_URL}"
      else
        local PR_NODE_ID
        PR_NODE_ID=$(github_get_pr_node_id "$PR_NUMBER")
        if [ -n "$PR_NODE_ID" ] && github_enable_automerge "$PR_NODE_ID"; then
          PR_OUTCOME="opened-auto-merge-enabled"
          log "Issue #${ISSUE_NUMBER}: auto-merge enabled on PR ${PR_URL}"
          github_comment "$ISSUE_NUMBER" "Agent opened a pull request for this issue: ${PR_URL}

Tests and build verified green by the coordinator, and an independent reviewer approved the diff. Auto-merge has been enabled — GitHub will merge it once the required checks pass."
        else
          PR_OUTCOME="opened-auto-merge-failed"
          log "Issue #${ISSUE_NUMBER}: failed to enable auto-merge on PR ${PR_URL}"
          github_comment "$ISSUE_NUMBER" "Agent opened a pull request for this issue: ${PR_URL}

Tests and build verified green by the coordinator, and an independent reviewer approved the diff. Auto-merge could not be enabled automatically — please review and merge."
        fi
        github_label "$ISSUE_NUMBER" "pr-open"
        github_remove_label "$ISSUE_NUMBER" "in-progress"
        OUTCOME="success"; GH_LABEL="pr-open"
        log "Issue #${ISSUE_NUMBER}: PR opened at ${PR_URL}"
        telegram "PR ready for issue #${ISSUE_NUMBER}: ${ISSUE_TITLE} — ${PR_URL}"
      fi
    else
      OUTCOME="needs-review"; GH_LABEL="agent-stuck"
      PR_OUTCOME="creation-failed"
      github_label "$ISSUE_NUMBER" "agent-stuck"
      run_triage "Branch ${BRANCH} was pushed and verification/review passed, but opening the pull request via the GitHub API failed." \
        "" "$ATTEMPTS_USED"
      github_remove_label "$ISSUE_NUMBER" "in-progress"
      log "Issue #${ISSUE_NUMBER}: branch pushed but PR creation failed"
      telegram "Issue #${ISSUE_NUMBER}: branch ${BRANCH} pushed but PR creation FAILED — needs manual attention"
    fi
    git checkout main >> "$LOG_FILE" 2>&1
  else
    cd "$APP_DIR"
    preserve_branch_before_abandoning "failed after 2 attempts"
    local FAIL_OUTPUT
    FAIL_OUTPUT=$(tail -100 "$VERIFY_OUT" 2>/dev/null)
    [ -z "$FAIL_OUTPUT" ] && FAIL_OUTPUT="(no verification output — the claude run failed or timed out)"
    [ -n "$REVIEW_TEXT" ] && FAIL_OUTPUT="${FAIL_OUTPUT}

Reviewer feedback on the final attempt:
${REVIEW_TEXT}"
    github_comment "$ISSUE_NUMBER" "Agent could not resolve this issue after 2 attempts.

<details><summary>Failure output (tail)</summary>

\`\`\`
${FAIL_OUTPUT}
\`\`\`

</details>${DIRTY_TREE_NOTE}"
    # The agent failed and opened no PR, so there is nothing for a human to
    # review — agent-stuck, not needs-you. The trace records both facts rather
    # than collapsing them into one.
    OUTCOME="failed"; GH_LABEL="agent-stuck"
    PR_OUTCOME="not-attempted"
    github_label "$ISSUE_NUMBER" "agent-stuck"
    run_triage "$FAIL_REASON" "$FAIL_OUTPUT" "$ATTEMPTS_USED"
    github_remove_label "$ISSUE_NUMBER" "in-progress"
    git checkout main >> "$LOG_FILE" 2>&1
    log "Issue #${ISSUE_NUMBER}: failed after 2 attempts, labeled agent-stuck"
    telegram "Failed after 2 attempts: issue #${ISSUE_NUMBER}: ${ISSUE_TITLE} — labeled agent-stuck"
  fi

  # One trace per issue, written after the run has fully finished either way.
  lf_emit "$ISSUE_NUMBER" "$ISSUE_TITLE" "$BRANCH" "$OUTCOME" "$ATTEMPTS_USED" \
    "$GH_LABEL" "$RUN_START" "$(lf_now_ns)" "$TEST_RESULT" "$BUILD_RESULT" \
    "$REVIEWER_RESULT" "$PR_OUTCOME"

  rm -f "$CLAUDE_OUT" "$VERIFY_OUT"
}

log "Coordinator started"
maybe_self_update_or_exit

# Write a notify helper the inner agent can call to send Telegram updates
cat > /home/agent/notify.sh << 'NOTIFY'
#!/bin/bash
source /home/agent/.env.agents
MSG=$(echo "$1" | tr '\n' ' ')
curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d chat_id="${TELEGRAM_CHAT_ID}" \
  -d "text=${MSG}" > /dev/null
NOTIFY
chmod +x /home/agent/notify.sh

telegram "Coordinator started, watching for ${TRIGGER_LABEL} issues (PR flow — never pushes to main). Commands: /issue <title>, /goal <goal>"

while true; do
  maybe_self_update_or_exit
  maybe_reconcile_open_prs
  handle_telegram_commands

  ISSUE_NUMBERS=$(curl -sL \
    -H "Authorization: token ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github.v3+json" \
    "https://api.github.com/repos/${GITHUB_REPO}/issues?labels=${TRIGGER_LABEL}&state=open" \
    | python3 -c "
import json, sys
try:
    issues = json.load(sys.stdin)
    numbers = [i['number'] for i in issues if 'pull_request' not in i]
    for n in sorted(numbers):
        print(n)
except Exception:
    pass
")

  BILLING_HALT=0
  for NUMBER in $ISSUE_NUMBERS; do
    run_agent "$NUMBER"
    RUN_AGENT_RC=$?
    if [ "$RUN_AGENT_RC" -eq 75 ]; then
      BILLING_HALT=1
      log "Provider halt: leaving the rest of the queue untouched. Re-checking later."
      break
    fi
  done

  if [ "$BILLING_HALT" -eq 1 ]; then
    log "Provider halt: sleeping 10 minutes before retrying."
    sleep 600
  else
    sleep 60
  fi
done
