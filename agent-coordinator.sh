#!/bin/bash

# Load credentials
source /root/.env.agents
ANTHROPIC_API_KEY=$(grep ANTHROPIC_API_KEY /root/app/.env.local | cut -d '=' -f2 | tr -d '"' | tr -d "'")

APP_DIR="/root/app"
LOG_FILE="/root/agent-coordinator.log"

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

github_close() {
  curl -s -X PATCH \
    -H "Authorization: token ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github.v3+json" \
    "https://api.github.com/repos/${GITHUB_REPO}/issues/$1" \
    -d '{"state":"closed"}' > /dev/null
}

run_agent() {
  local ISSUE_NUMBER=$1
  local ISSUE_TITLE=$2
  local ISSUE_BODY=$3
  local SAFE_TITLE=$(echo "$ISSUE_TITLE" | tr ' ' '-' | tr '[:upper:]' '[:lower:]' | tr -dc 'a-z0-9-' | cut -c1-30)
  local BRANCH="task-${ISSUE_NUMBER}-${SAFE_TITLE}"

  log "Starting agent for issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}"
  telegram "Starting issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}"
  github_label "$ISSUE_NUMBER" "in-progress"

  cd "$APP_DIR" || exit 1
  git checkout main && git pull origin main
  git checkout -b "$BRANCH"

  local PROMPT="You are working on the hs-navigator Next.js app at /root/app.
Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}
${ISSUE_BODY}
Instructions:
1. Implement the feature or fix described above
2. Write Jest unit tests in __tests__/ for any new logic
3. Run npm test and fix any failures before finishing
4. Do not modify schools.json
5. Do not touch the main branch
6. Stage and commit all changes with: fix: issue #${ISSUE_NUMBER} - ${ISSUE_TITLE}"

  local ATTEMPTS=0
  local SUCCESS=false

  while [ $ATTEMPTS -lt 3 ]; do
    ATTEMPTS=$((ATTEMPTS + 1))
    log "Attempt ${ATTEMPTS} for issue #${ISSUE_NUMBER}"
    ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" claude \
      --print \
      --no-interactive \
      -p "$PROMPT" \
      --allowedTools "Bash,Read,Write,Edit" \
      2>> "$LOG_FILE"
    cd "$APP_DIR" && npm test >> "$LOG_FILE" 2>&1
    if [ $? -eq 0 ]; then
      SUCCESS=true
      break
    fi
    log "Tests failed on attempt ${ATTEMPTS}"
  done

  if [ "$SUCCESS" = true ]; then
    git push origin "$BRANCH"
    git checkout main
    git merge "$BRANCH" --no-ff -m "fix: issue #${ISSUE_NUMBER} - ${ISSUE_TITLE}"
    git push origin main
    pm2 restart hs-navigator >> "$LOG_FILE" 2>&1
    github_label "$ISSUE_NUMBER" "done"
    github_close "$ISSUE_NUMBER"
    log "Issue #${ISSUE_NUMBER} done and deployed"
    telegram "Done: issue #${ISSUE_NUMBER} - ${ISSUE_TITLE}"
  else
    github_label "$ISSUE_NUMBER" "needs-review"
    git checkout main
    git branch -D "$BRANCH" 2>/dev/null
    log "Issue #${ISSUE_NUMBER} stuck after 3 attempts"
    telegram "Stuck on issue #${ISSUE_NUMBER} - needs your review: ${ISSUE_TITLE}"
  fi
}

log "Coordinator started"
telegram "Coordinator started, watching for todo issues"

while true; do
  ISSUES_JSON=$(curl -s \
    -H "Authorization: token ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github.v3+json" \
    "https://api.github.com/repos/${GITHUB_REPO}/issues?labels=todo&state=open")

  # Sequential: no & at end, one agent at a time
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
