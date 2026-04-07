#!/bin/bash

# Load credentials
source /root/.env.agents
ANTHROPIC_API_KEY=$(grep ANTHROPIC_API_KEY /root/app/.env.local | cut -d '=' -f2 | tr -d '"' | tr -d "'")

APP_DIR="/root/app"
LOG_FILE="/root/agent-coordinator.log"
OFFSET_FILE="/tmp/tg_offset"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

telegram() {
  local MSG=$(echo "$1" | tr '\n' ' ')
  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d chat_id="${TELEGRAM_CHAT_ID}" \
    -d "text=${MSG}" > /dev/null
}

github_label() {
  curl -s -X POST \
    -H "Authorization: token ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github.v3+json" \
    "https://api.github.com/repos/${GITHUB_REPO}/issues/$1/labels" \
    -d "{\"labels\":[\"$2\"]}" > /dev/null
}

github_remove_label() {
  curl -s -X DELETE \
    -H "Authorization: token ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github.v3+json" \
    "https://api.github.com/repos/${GITHUB_REPO}/issues/$1/labels/$2" > /dev/null
}

github_close() {
  curl -s -X PATCH \
    -H "Authorization: token ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github.v3+json" \
    "https://api.github.com/repos/${GITHUB_REPO}/issues/$1" \
    -d '{"state":"closed"}' > /dev/null
}

github_create_issue() {
  local TITLE="$1"
  local TITLE_JSON
  TITLE_JSON=$(printf '%s' "$TITLE" | python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))")
  local RESPONSE
  RESPONSE=$(curl -s -X POST \
    -H "Authorization: token ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github.v3+json" \
    "https://api.github.com/repos/${GITHUB_REPO}/issues" \
    -d "{\"title\":${TITLE_JSON},\"labels\":[\"todo\"]}")
  echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('number',''))" 2>/dev/null
}

handle_telegram_commands() {
  local OFFSET=0
  if [ -f "$OFFSET_FILE" ]; then
    OFFSET=$(cat "$OFFSET_FILE")
  fi

  local UPDATES
  UPDATES=$(curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${OFFSET}&timeout=0")

  while IFS='|||' read -r UPDATE_ID TEXT; do
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
    text = u.get('message', {}).get('text', '').replace('|||', ' ')
    print(f'{uid}|||{text}')
")
}

github_comment() {
  local BODY=$(echo "$2" | python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))")
  curl -s -X POST \
    -H "Authorization: token ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github.v3+json" \
    "https://api.github.com/repos/${GITHUB_REPO}/issues/$1/comments" \
    -d "{\"body\":${BODY}}" > /dev/null
}

run_agent() {
  local ISSUE_NUMBER=$1
  local ISSUE_TITLE=$2
  local ISSUE_BODY=$3
  local SAFE_TITLE=$(echo "$ISSUE_TITLE" | tr ' ' '-' | tr '[:upper:]' '[:lower:]' | tr -dc 'a-z0-9-' | cut -c1-30)
  local BRANCH="task-${ISSUE_NUMBER}-${SAFE_TITLE}"
  local SUMMARY_FILE="/tmp/summary-issue-${ISSUE_NUMBER}.md"
  local OUTPUT_FILE="/tmp/output-issue-${ISSUE_NUMBER}.log"

  log "Starting issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}"
  telegram "Starting issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}"

  # Remove todo immediately so a crash mid-run never causes an infinite loop
  github_remove_label "$ISSUE_NUMBER" "todo"
  github_label "$ISSUE_NUMBER" "in-progress"

  cd "$APP_DIR" || exit 1
  git checkout main && git pull origin main
  # Delete branch if it already exists from a previous failed attempt
  git branch -D "$BRANCH" 2>/dev/null
  git checkout -b "$BRANCH"
  rm -f "$SUMMARY_FILE" "$OUTPUT_FILE"

  local PROMPT="You are a senior full-stack engineer working on the hs-navigator Next.js app at /root/app.
Fix GitHub issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}
${ISSUE_BODY}

Send progress updates throughout using: /root/notify.sh \"message\"

Work through these phases IN ORDER. Complete each fully before moving on.

## Phase 1 — DIAGNOSE (no file edits)
1. Extract 2-4 keywords from the issue title and body
2. For each keyword run: grep -r \"<keyword>\" /root/app --include='*.ts' --include='*.tsx' --include='*.js' -l
3. Read every relevant file
4. Trace the full data flow end to end (entry point → processing → render)
5. Identify the exact file, function, and line that needs to change
6. Run: /root/notify.sh \"#${ISSUE_NUMBER} diagnosis done — found: <one line summary of root cause>\"

## Phase 2 — PLAN (no file edits)
State exactly:
- Which file and function to change
- The precise change: old value → new value
- What tests will verify the fix
Then run: /root/notify.sh \"#${ISSUE_NUMBER} plan: <one line summary of what will change>\"

## Phase 3 — IMPLEMENT
Make exactly the changes from your plan. Nothing more. Do not modify schools.json.
Then run: /root/notify.sh \"#${ISSUE_NUMBER} code changes done\"

## Phase 4 — TEST
1. Check /root/app/__tests__/ for existing tests — add to them, do not overwrite
2. Write tests that verify your specific fix
3. Run: cd /root/app && npm test
4. If tests fail: read the error carefully, fix only what is needed, run again
5. Keep going until all tests pass
6. Run: /root/notify.sh \"#${ISSUE_NUMBER} tests passing\"

## Phase 5 — BUILD
1. Run: cd /root/app && npm run build
2. If build fails: read the error carefully, fix only what is needed, run build again
3. Keep going until build passes
4. Run: /root/notify.sh \"#${ISSUE_NUMBER} build passing\"

## Phase 6 — SUMMARIZE
Write ${SUMMARY_FILE} in exactly this format:
## What was fixed
<one paragraph>

## Changes made
<bullet list with exact values, e.g. 'TARGET: 3 → 5'>

## Tests added
<bullet list>

## Result: PASSED

## Phase 7 — COMMIT
Run: cd /root/app && git add -A && git commit -m \"fix: issue #${ISSUE_NUMBER} - ${ISSUE_TITLE}\""

  ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" claude \
    --print \
    -p "$PROMPT" \
    --allowedTools "Bash,Read,Write,Edit" \
    2>&1 | tee "$OUTPUT_FILE" >> "$LOG_FILE"

  # Check for success: summary file exists and contains Result: PASSED
  if [ -f "$SUMMARY_FILE" ] && grep -q "Result: PASSED" "$SUMMARY_FILE"; then
    local SUMMARY=$(cat "$SUMMARY_FILE")
    rm -f "$SUMMARY_FILE"

    git push origin "$BRANCH"
    git checkout main
    git merge "$BRANCH" --no-ff -m "fix: issue #${ISSUE_NUMBER} - ${ISSUE_TITLE}"
    git push origin main
    pm2 restart hs-navigator >> "$LOG_FILE" 2>&1

    github_comment "$ISSUE_NUMBER" "$SUMMARY"
    github_label "$ISSUE_NUMBER" "done"
    github_remove_label "$ISSUE_NUMBER" "in-progress"
    github_close "$ISSUE_NUMBER"
    log "Issue #${ISSUE_NUMBER} done and deployed"
    telegram "Done: issue #${ISSUE_NUMBER} - ${ISSUE_TITLE}"
  else
    # Post partial summary + last 100 lines of agent output for context
    local PARTIAL=""
    if [ -f "$SUMMARY_FILE" ]; then
      PARTIAL=$(cat "$SUMMARY_FILE")
    fi
    local AGENT_OUTPUT=""
    if [ -f "$OUTPUT_FILE" ]; then
      AGENT_OUTPUT=$(tail -100 "$OUTPUT_FILE")
    fi
    rm -f "$SUMMARY_FILE" "$OUTPUT_FILE"
    local COMMENT="Agent could not fully resolve this issue.

${PARTIAL}

---

<details><summary>Agent output (last 100 lines)</summary>

\`\`\`
${AGENT_OUTPUT}
\`\`\`

</details>"
    github_comment "$ISSUE_NUMBER" "$(printf '%b' "$COMMENT")"
    github_label "$ISSUE_NUMBER" "needs-review"
    github_remove_label "$ISSUE_NUMBER" "in-progress"
    github_remove_label "$ISSUE_NUMBER" "todo"
    git checkout main
    git branch -D "$BRANCH" 2>/dev/null
    log "Issue #${ISSUE_NUMBER} needs review"
    local TAIL=$(tail -20 "$OUTPUT_FILE" 2>/dev/null | tr '\n' ' ' | cut -c1-500)
    telegram "Stuck on #${ISSUE_NUMBER}: ${ISSUE_TITLE} | Last output: ${TAIL}"
  fi
}

log "Coordinator started"

# Write a notify helper the agent can call to send Telegram updates
cat > /root/notify.sh << 'NOTIFY'
#!/bin/bash
source /root/.env.agents
MSG=$(echo "$1" | tr '\n' ' ')
curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d chat_id="${TELEGRAM_CHAT_ID}" \
  -d "text=${MSG}" > /dev/null
NOTIFY
chmod +x /root/notify.sh

# Sync any VPS-only test files into the repo so agents always have a baseline
cd "$APP_DIR"
if [[ -n $(git ls-files --others --exclude-standard __tests__/) ]]; then
  log "Syncing untracked test files to repo"
  git add __tests__/
  git commit -m "chore: sync baseline tests to repo"
  git push origin main
fi

telegram "Coordinator started, watching for todo issues"

while true; do
  handle_telegram_commands

  ISSUES_JSON=$(curl -s \
    -H "Authorization: token ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github.v3+json" \
    "https://api.github.com/repos/${GITHUB_REPO}/issues?labels=todo&state=open")

  while IFS='|||' read -r NUMBER TITLE BODY; do
    if [ -n "$NUMBER" ]; then
      run_agent "$NUMBER" "$TITLE" "$BODY"
    fi
  done < <(echo "$ISSUES_JSON" | python3 -c "
import json, sys
issues = json.load(sys.stdin)
for issue in issues:
    t = issue['title'].replace('\n',' ').replace('|||',' ')
    b = (issue.get('body') or '').replace('\n',' ').replace('|||',' ')
    print(f\"{issue['number']}|||{t}|||{b}\")
")

  sleep 60
done
