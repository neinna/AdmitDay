#!/usr/bin/env bash
# merge-gate.sh: exit 0 when a pull request may merge, 1 when it may not.
# Env: LABELS (comma-separated PR label names), HEAD_REF, PR, REPO.
# Uses gh only for data refresh PRs. Any failure blocks; nothing fails open.
set -uo pipefail

case ",${LABELS:-}," in
  *,needs-you,*) echo "Blocked: the PR has the needs-you label."; exit 1 ;;
esac

case ",${LABELS:-}," in
  *,ai-approved,*) echo "Passed: the PR has the ai-approved label."; exit 0 ;;
esac

if [ "${HEAD_REF:-}" = "data/weekly-refresh" ]; then
  FILES=$(gh pr view "${PR:-}" --repo "${REPO:-}" --json files --jq '.files[].path') || {
    echo "Blocked: could not list the PR's files."; exit 1; }
  if [ -z "$FILES" ]; then
    echo "Blocked: the PR lists no files."; exit 1
  fi
  UNEXPECTED=$(printf '%s\n' "$FILES" | grep -vxF -e schools.json -e data/schema-summary.json -e data/school-embeddings.json)
  if [ -n "$UNEXPECTED" ]; then
    echo "Blocked: the data refresh PR changes other files:"
    printf '%s\n' "$UNEXPECTED"
    exit 1
  fi
  echo "Passed: a data refresh PR that changes only data files."
  exit 0
fi

echo "Blocked: no ai-approved label."
exit 1
