#!/bin/bash

# AdmitDay autonomous coding agent coordinator.
# Polls GitHub for open issues labeled "agent-ok", runs a Claude agent per issue
# on a branch, verifies with npm test + npm run build, and opens a PR.
# This coordinator NEVER pushes to main and NEVER merges.

# Load credentials
source /home/agent/.env.agents
ANTHROPIC_API_KEY=$(grep ANTHROPIC_API_KEY /home/agent/app/.env.local | cut -d '=' -f2 | tr -d '"' | tr -d "'")

APP_DIR="/home/agent/app"
LOG_FILE="/home/agent/agent-coordinator.log"
OFFSET_FILE="/home/agent/.tg_offset"
TRIGGER_LABEL="agent-ok"
CLAUDE_TIMEOUT=1800

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
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

github_open_pr() {
  # github_open_pr BRANCH TITLE BODY -> echoes html_url (empty on failure)
  local TITLE_JSON BODY_JSON RESPONSE
  TITLE_JSON=$(printf '%s' "$2" | json_escape)
  BODY_JSON=$(printf '%s' "$3" | json_escape)
  RESPONSE=$(gh_api POST "/pulls" "{\"title\":${TITLE_JSON},\"head\":\"$1\",\"base\":\"main\",\"body\":${BODY_JSON}}")
  echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('html_url',''))" 2>/dev/null
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

# Run one claude agent call with timeout, capturing session id and result text.
# run_claude OUTPUT_JSON_FILE [RESUME_SESSION_ID] <<< prompt on stdin via $PROMPT env
# Returns: 0 if claude ran and reported success, 1 on error, 124 on timeout.
run_claude() {
  local OUT_FILE="$1"
  local RESUME_ID="$2"
  local RESUME_ARGS=()
  if [ -n "$RESUME_ID" ]; then
    RESUME_ARGS=(--resume "$RESUME_ID")
  fi
  ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" timeout "$CLAUDE_TIMEOUT" claude \
    -p "$PROMPT" \
    --output-format json \
    --allowedTools "Bash,Read,Write,Edit,Glob,Grep" \
    "${RESUME_ARGS[@]}" \
    > "$OUT_FILE" 2>> "$LOG_FILE"
  local RC=$?
  if [ $RC -eq 124 ]; then
    return 124
  fi
  # Treat as success only if the JSON parses and is_error is false
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

# Coordinator-owned verification: the ONLY success signal.
# Prunes the Next.js webpack cache afterwards — this VPS has very little free
# disk and the cache alone is ~400MB.
verify_app() {
  local OUT="$1" RC=0
  (cd "$APP_DIR" && npm test) > "$OUT" 2>&1 || RC=1
  if [ $RC -eq 0 ]; then
    (cd "$APP_DIR" && npm run build) >> "$OUT" 2>&1 || RC=1
  fi
  rm -rf "$APP_DIR/.next/cache"
  return $RC
}

run_agent() {
  local ISSUE_NUMBER=$1

  # Fetch full issue (title + body with newlines preserved) and its comments
  local ISSUE_FILE="/tmp/issue-${ISSUE_NUMBER}.json"
  gh_api GET "/issues/${ISSUE_NUMBER}" > "$ISSUE_FILE"
  local ISSUE_TITLE ISSUE_BODY ISSUE_COMMENTS
  ISSUE_TITLE=$(python3 -c "import json; print(json.load(open('$ISSUE_FILE')).get('title',''))")
  ISSUE_BODY=$(python3 -c "import json; print(json.load(open('$ISSUE_FILE')).get('body') or '(no body)')")
  ISSUE_COMMENTS=$(gh_api GET "/issues/${ISSUE_NUMBER}/comments" | python3 -c "
import json,sys
try:
    cs = json.load(sys.stdin)
    out = '\n\n'.join(f\"[{c['user']['login']}]: {c['body']}\" for c in cs)
    print(out if out else '(no comments)')
except Exception:
    print('(no comments)')
")
  rm -f "$ISSUE_FILE"

  if [ -z "$ISSUE_TITLE" ]; then
    log "Could not fetch issue #${ISSUE_NUMBER}, skipping"
    return
  fi

  local SAFE_TITLE=$(echo "$ISSUE_TITLE" | tr ' ' '-' | tr '[:upper:]' '[:lower:]' | tr -dc 'a-z0-9-' | cut -c1-30)
  local BRANCH="task-${ISSUE_NUMBER}-${SAFE_TITLE}"
  local COMMIT_TITLE="fix: issue #${ISSUE_NUMBER} - ${ISSUE_TITLE}"
  local CLAUDE_OUT="/tmp/claude-issue-${ISSUE_NUMBER}.json"
  local VERIFY_OUT="/tmp/verify-issue-${ISSUE_NUMBER}.log"

  log "Starting issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}"
  telegram "Starting issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}"

  # Remove trigger label immediately so a crash mid-run never causes an infinite loop
  github_remove_label "$ISSUE_NUMBER" "$TRIGGER_LABEL"
  github_label "$ISSUE_NUMBER" "in-progress"

  cd "$APP_DIR" || { log "FATAL: cannot cd to $APP_DIR"; return; }
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
- Work in /home/agent/app on branch ${BRANCH} (already checked out). Read /home/agent/app/CLAUDE.md first.
- Fix the issue. Add tests for your change in __tests__/ (add, don't overwrite existing tests).
- Run 'cd /home/agent/app && npm test' and 'cd /home/agent/app && npm run build' and iterate until both are green.
- Commit your work: cd /home/agent/app && git add -A && git commit -m \"${COMMIT_TITLE}\"
- Never modify data/schools.json.
- Never push, never merge, never switch branches.
- You can send the owner a short progress update with: /home/agent/notify.sh \"message\"
- End with a short summary of what you changed and why (it becomes the pull request description)."

  local ATTEMPT=1
  local SESSION_ID=""
  local SUCCESS=0
  local PROMPT="$BRIEF"

  while [ $ATTEMPT -le 2 ]; do
    log "Issue #${ISSUE_NUMBER}: agent attempt ${ATTEMPT}"
    run_claude "$CLAUDE_OUT" "$([ $ATTEMPT -gt 1 ] && echo "$SESSION_ID")"
    local RC=$?
    if [ $RC -eq 124 ]; then
      log "Issue #${ISSUE_NUMBER}: claude timed out on attempt ${ATTEMPT}"
      telegram "Timeout: agent hit the 30min limit on issue #${ISSUE_NUMBER} (attempt ${ATTEMPT})"
    elif [ $RC -ne 0 ]; then
      log "Issue #${ISSUE_NUMBER}: claude errored on attempt ${ATTEMPT}"
    fi
    [ -z "$SESSION_ID" ] && SESSION_ID=$(claude_json_field "$CLAUDE_OUT" "session_id")

    # Objective verification by the coordinator — the only success signal.
    # Also require that the branch actually differs from main.
    if [ $RC -eq 0 ] && verify_app "$VERIFY_OUT"; then
      cd "$APP_DIR"
      # Fallback: commit anything the agent left uncommitted
      if [ -n "$(git status --porcelain)" ]; then
        git add -A && git commit -m "$COMMIT_TITLE" >> "$LOG_FILE" 2>&1
      fi
      if [ -n "$(git log origin/main..HEAD --oneline)" ]; then
        SUCCESS=1
        break
      fi
      log "Issue #${ISSUE_NUMBER}: verification passed but no changes were committed"
    fi

    if [ $ATTEMPT -lt 2 ]; then
      local FAIL_TAIL
      FAIL_TAIL=$(tail -150 "$VERIFY_OUT" 2>/dev/null)
      [ -z "$FAIL_TAIL" ] && FAIL_TAIL="(the claude run itself failed or timed out before verification; check your previous work for incomplete edits)"
      PROMPT="Verification failed. The coordinator ran 'npm test && npm run build' after your changes and it did not pass, or no changes were committed.

Failing output (tail):
${FAIL_TAIL}

Diagnose why this failed before changing anything else. Then fix it, re-run npm test and npm run build until green, and commit with message \"${COMMIT_TITLE}\"."
      log "Issue #${ISSUE_NUMBER}: attempt ${ATTEMPT} failed verification, retrying with session resume"
    fi
    ATTEMPT=$((ATTEMPT + 1))
  done

  if [ $SUCCESS -eq 1 ]; then
    local SUMMARY
    SUMMARY=$(claude_json_field "$CLAUDE_OUT" "result")
    [ -z "$SUMMARY" ] && SUMMARY="(agent produced no summary)"

    git push origin "$BRANCH" >> "$LOG_FILE" 2>&1
    local PR_BODY="${SUMMARY}

Closes #${ISSUE_NUMBER}"
    local PR_URL
    PR_URL=$(github_open_pr "$BRANCH" "$COMMIT_TITLE" "$PR_BODY")

    if [ -n "$PR_URL" ]; then
      github_comment "$ISSUE_NUMBER" "Agent opened a pull request for this issue: ${PR_URL}

Tests and build verified green by the coordinator. Please review and merge."
      github_label "$ISSUE_NUMBER" "pr-open"
      github_remove_label "$ISSUE_NUMBER" "in-progress"
      log "Issue #${ISSUE_NUMBER}: PR opened at ${PR_URL}"
      telegram "PR ready for issue #${ISSUE_NUMBER}: ${ISSUE_TITLE} — ${PR_URL}"
    else
      github_label "$ISSUE_NUMBER" "needs-review"
      github_remove_label "$ISSUE_NUMBER" "in-progress"
      log "Issue #${ISSUE_NUMBER}: branch pushed but PR creation failed"
      telegram "Issue #${ISSUE_NUMBER}: branch ${BRANCH} pushed but PR creation FAILED — needs manual attention"
    fi
    git checkout main >> "$LOG_FILE" 2>&1
  else
    local FAIL_OUTPUT
    FAIL_OUTPUT=$(tail -100 "$VERIFY_OUT" 2>/dev/null)
    [ -z "$FAIL_OUTPUT" ] && FAIL_OUTPUT="(no verification output — the claude run failed or timed out)"
    github_comment "$ISSUE_NUMBER" "Agent could not resolve this issue after 2 attempts. Coordinator verification (npm test && npm run build) failed.

<details><summary>Failure output (tail)</summary>

\`\`\`
${FAIL_OUTPUT}
\`\`\`

</details>"
    github_label "$ISSUE_NUMBER" "needs-review"
    github_remove_label "$ISSUE_NUMBER" "in-progress"
    cd "$APP_DIR"
    git checkout main >> "$LOG_FILE" 2>&1
    git branch -D "$BRANCH" 2>/dev/null
    log "Issue #${ISSUE_NUMBER}: failed after 2 attempts, labeled needs-review"
    telegram "Failed after 2 attempts: issue #${ISSUE_NUMBER}: ${ISSUE_TITLE} — labeled needs-review, branch deleted"
  fi

  rm -f "$CLAUDE_OUT" "$VERIFY_OUT"
}

log "Coordinator started"

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

telegram "Coordinator started, watching for ${TRIGGER_LABEL} issues (PR flow — never pushes to main)"

while true; do
  handle_telegram_commands

  ISSUE_NUMBERS=$(curl -sL \
    -H "Authorization: token ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github.v3+json" \
    "https://api.github.com/repos/${GITHUB_REPO}/issues?labels=${TRIGGER_LABEL}&state=open" \
    | python3 -c "
import json, sys
try:
    issues = json.load(sys.stdin)
    for i in issues:
        if 'pull_request' not in i:
            print(i['number'])
except Exception:
    pass
")

  for NUMBER in $ISSUE_NUMBERS; do
    run_agent "$NUMBER"
  done

  sleep 60
done
