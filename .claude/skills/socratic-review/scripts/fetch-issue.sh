#!/usr/bin/env bash
set -e

ISSUE_REF="${1:?Usage: $0 <Issue URLまたはIssue番号>}"
ISSUE_REF="${ISSUE_REF#\#}"

echo "=== ISSUE_SUMMARY ==="
if ! ISSUE_JSON=$(gh issue view "$ISSUE_REF" --json number,title,body,url 2>/dev/null); then
  echo "ISSUE: NOT_FOUND"
  exit 0
fi

echo "$ISSUE_JSON" | jq -r '"Issue #\(.number): \(.title)", "URL: \(.url)", "", .body'
