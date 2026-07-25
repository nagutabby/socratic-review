#!/usr/bin/env bash
set -e

echo "=== PR_SUMMARY ==="
PR_JSON=$(gh pr view --json number,title,body,url,files 2>/dev/null || true)
if [ -z "$PR_JSON" ]; then
  echo "PR: None (現在のブランチに紐づくPRが見つかりません)"
else
  echo "$PR_JSON" | jq -r '
    "PR #\(.number): \(.title)",
    "URL: \(.url)",
    "Changed Files:",
    (.files | map("- " + .path) | .[])
  '
fi
