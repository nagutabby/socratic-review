#!/usr/bin/env bash
set -e

PR_REF="${1:?Usage: $0 <PR URLまたはPR番号>}"
PR_REF="${PR_REF#\#}"

echo "=== PR_SUMMARY ==="
if ! PR_JSON=$(gh pr view "$PR_REF" --json number,title,body,url,files 2>/dev/null); then
  echo "PR: NOT_FOUND"
  exit 0
fi

echo "$PR_JSON" | jq -r '
  "PR #\(.number): \(.title)",
  "URL: \(.url)",
  "Changed Files:",
  (.files | map("- " + .path) | .[])
'
