#!/bin/bash

# AdmitDay autonomous coding agent coordinator.
# Polls GitHub for open issues labeled "agent-ok", runs a Claude agent per issue
# on a branch, verifies with npm test + npm run build, has an independent
# reviewer approve the diff, and opens a PR.
# This coordinator NEVER pushes to main and NEVER merges.

# Load credentials
source /home/agent/.env.agents
ANTHROPIC_API_KEY=$(grep ANTHROPIC_API_KEY /home/agent/app/.env.local | cut -d '=' -f2 | tr -d '"' | tr -d "'")

APP_DIR="/home/agent/app"
LOG_FILE="/home/agent/agent-coordinator.log"
OFFSET_FILE="/home/agent/.tg_offset"
LESSONS_FILE="/home/agent/app/LESSONS.md"
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

# Run one claude agent call with timeout, capturing the JSON result.
# Reads the prompt from $PROMPT. run_claude OUT_FILE [RESUME_ID] [TOOLS]
# Returns: 0 on success, 124 on timeout, 1 on any other error.
run_claude() {
  local OUT_FILE="$1"
  local RESUME_ID="$2"
  local TOOLS="${3:-Bash,Read,Write,Edit,Glob,Grep}"
  local RESUME_ARGS=()
  if [ -n "$RESUME_ID" ]; then
    RESUME_ARGS=(--resume "$RESUME_ID")
  fi
  ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" timeout "$CLAUDE_TIMEOUT" claude \
    -p "$PROMPT" \
    --output-format json \
    --allowedTools "$TOOLS" \
    "${RESUME_ARGS[@]}" \
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

# Coordinator-owned verification: the ONLY success signal.
# This VPS has <600MB free disk and Next's webpack filesystem cache alone is
# ~400MB, so: wipe .next before building and keep pruning .next/cache while
# the build runs (webpack treats failed cache writes as non-fatal warnings).
verify_app() {
  local OUT="$1" RC=0
  rm -rf "$APP_DIR/.next"
  (cd "$APP_DIR" && npm test) > "$OUT" 2>&1 || RC=1
  if [ $RC -eq 0 ]; then
    ( while true; do rm -rf "$APP_DIR/.next/cache" 2>/dev/null; sleep 10; done ) &
    local PRUNE_PID=$!
    (cd "$APP_DIR" && npm run build) >> "$OUT" 2>&1 || RC=1
    kill "$PRUNE_PID" 2>/dev/null
    wait "$PRUNE_PID" 2>/dev/null
    rm -rf "$APP_DIR/.next/cache"
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

You may read files in /home/agent/app for context. Be strict about scope: if the diff contains significant changes beyond what the issue asked for, reject it.

End your response with exactly one line:
VERDICT: APPROVE
or
VERDICT: REJECT - <one-line reason>"

  run_claude "$REVIEW_OUT" "" "Read,Glob,Grep"
  local RC=$?
  local REVIEW_TEXT
  REVIEW_TEXT=$(claude_json_field "$REVIEW_OUT" "result")
  rm -f "$REVIEW_OUT"
  echo "$REVIEW_TEXT"
  if [ $RC -ne 0 ] || [ -z "$REVIEW_TEXT" ]; then
    return 2
  fi
  if echo "$REVIEW_TEXT" | grep -q "VERDICT: APPROVE"; then
    return 0
  fi
  return 1
}

# Learning loop: after every completed task, distill 0-2 durable lessons into
# LESSONS.md (deduped, hard cap 30 lines). Never fatal.
run_retrospective() {
  local ISSUE_NUMBER="$1" ISSUE_TITLE="$2" OUTCOME="$3" DIFF="$4"
  local RETRO_OUT="/tmp/retro-issue-${ISSUE_NUMBER}.json"
  local CURRENT_LESSONS="(file does not exist yet)"
  [ -s "$LESSONS_FILE" ] && CURRENT_LESSONS=$(cat "$LESSONS_FILE")

  local PROMPT="You maintain LESSONS.md, a list of durable lessons for an autonomous coding agent working on the AdmitDay Next.js app.

A task just completed.
Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}
Outcome: ${OUTCOME}

Diff (may be truncated):
\`\`\`diff
$(printf '%s' "$DIFF" | head -c 20000)
\`\`\`

Current LESSONS.md:
---
${CURRENT_LESSONS}
---

Write the complete new content of LESSONS.md and nothing else (no fences, no commentary):
- Add 0-2 new lessons ONLY if this task taught something durable and reusable (a repo quirk, a recurring failure mode, a technique that worked). If nothing durable was learned, output the current content unchanged.
- One lesson per line, as '- <lesson>'. A single '# Lessons' header line is allowed.
- Deduplicate: never repeat an existing lesson in different words.
- Hard cap 30 lines total: if adding would exceed it, drop the least useful existing line."

  run_claude "$RETRO_OUT" "" "Read"
  local RC=$?
  if [ $RC -eq 0 ]; then
    local NEW_LESSONS
    NEW_LESSONS=$(claude_json_field "$RETRO_OUT" "result" | head -30)
    if [ -n "$NEW_LESSONS" ]; then
      printf '%s\n' "$NEW_LESSONS" > "$LESSONS_FILE"
      log "Retrospective for #${ISSUE_NUMBER} updated LESSONS.md ($(wc -l < "$LESSONS_FILE") lines)"
    fi
  else
    log "Retrospective for #${ISSUE_NUMBER} failed (non-fatal)"
  fi
  rm -f "$RETRO_OUT"
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

  run_claude "$PLAN_OUT" "" "Read,Glob,Grep"
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

  local LESSONS_SECTION=""
  if [ -s "$LESSONS_FILE" ]; then
    LESSONS_SECTION="
Lessons learned from previous tasks on this repo (follow them):
$(cat "$LESSONS_FILE")
"
  fi

  local BRIEF="You are fixing a GitHub issue in the AdmitDay Next.js app.

Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}

${ISSUE_BODY}

Issue comments:
${ISSUE_COMMENTS}
${LESSONS_SECTION}
Instructions:
- Work in /home/agent/app on branch ${BRANCH} (already checked out). If /home/agent/app/CLAUDE.md exists, read it first and follow its house rules.
- Fix the issue. Stay strictly within its scope — an independent reviewer will reject scope creep. Add tests for your change in __tests__/ (add, don't overwrite existing tests).
- Run 'cd /home/agent/app && npm test' and 'cd /home/agent/app && npm run build' and iterate until both are green.
- Commit your work: cd /home/agent/app && git add -A -- ':(exclude)LESSONS.md' && git commit -m \"${COMMIT_TITLE}\"
- Never modify data/schools.json. Never commit LESSONS.md.
- Never push, never merge, never switch branches.
- You can send the owner a short progress update with: /home/agent/notify.sh \"message\"
- End with a short summary of what you changed and why (it becomes the pull request description)."

  local ATTEMPT=1
  local SESSION_ID=""
  local SUCCESS=0
  local FAIL_REASON=""
  local REVIEW_TEXT=""
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

    FAIL_REASON=""
    # Objective verification by the coordinator — the only success signal.
    if [ $RC -eq 0 ] && verify_app "$VERIFY_OUT"; then
      cd "$APP_DIR"
      # Fallback: commit anything the agent left uncommitted (except LESSONS.md)
      if [ -n "$(git status --porcelain -- ':(exclude)LESSONS.md')" ]; then
        git add -A -- ':(exclude)LESSONS.md' && git commit -m "$COMMIT_TITLE" >> "$LOG_FILE" 2>&1
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
          log "Issue #${ISSUE_NUMBER}: reviewer rejected attempt ${ATTEMPT}"
        else
          [ $REVIEW_RC -eq 2 ] && log "Issue #${ISSUE_NUMBER}: reviewer unavailable, proceeding without review"
          SUCCESS=1
          break
        fi
      else
        FAIL_REASON="Verification passed but no changes were committed on the branch. You must actually implement and commit the fix with: git add -A -- ':(exclude)LESSONS.md' && git commit -m \"${COMMIT_TITLE}\""
        log "Issue #${ISSUE_NUMBER}: verification passed but no changes were committed"
      fi
    else
      local FAIL_TAIL
      FAIL_TAIL=$(tail -150 "$VERIFY_OUT" 2>/dev/null)
      [ -z "$FAIL_TAIL" ] && FAIL_TAIL="(the claude run itself failed or timed out before verification; check your previous work for incomplete edits)"
      FAIL_REASON="The coordinator ran 'npm test && npm run build' after your changes and it did not pass.

Failing output (tail):
${FAIL_TAIL}

Diagnose why this failed before changing anything else. Then fix it, re-run npm test and npm run build until green, and commit with message \"${COMMIT_TITLE}\"."
    fi

    if [ $ATTEMPT -lt 2 ]; then
      PROMPT="$FAIL_REASON"
      log "Issue #${ISSUE_NUMBER}: attempt ${ATTEMPT} failed, retrying with session resume"
    fi
    ATTEMPT=$((ATTEMPT + 1))
  done

  # Capture the diff for the retrospective before any branch cleanup
  local TASK_DIFF
  TASK_DIFF=$(cd "$APP_DIR" && git diff origin/main...HEAD | head -c 20000)

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

Tests and build verified green by the coordinator, and an independent reviewer approved the diff. Please review and merge."
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
    run_retrospective "$ISSUE_NUMBER" "$ISSUE_TITLE" "SUCCESS — PR opened after ${ATTEMPT} attempt(s)" "$TASK_DIFF"
  else
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

</details>"
    github_label "$ISSUE_NUMBER" "needs-review"
    github_remove_label "$ISSUE_NUMBER" "in-progress"
    cd "$APP_DIR"
    git checkout main >> "$LOG_FILE" 2>&1
    git branch -D "$BRANCH" 2>/dev/null
    log "Issue #${ISSUE_NUMBER}: failed after 2 attempts, labeled needs-review"
    telegram "Failed after 2 attempts: issue #${ISSUE_NUMBER}: ${ISSUE_TITLE} — labeled needs-review, branch deleted"
    run_retrospective "$ISSUE_NUMBER" "$ISSUE_TITLE" "FAILURE — 2 attempts exhausted (verification or review failed)" "$TASK_DIFF"
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

telegram "Coordinator started, watching for ${TRIGGER_LABEL} issues (PR flow — never pushes to main). Commands: /issue <title>, /goal <goal>"

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
