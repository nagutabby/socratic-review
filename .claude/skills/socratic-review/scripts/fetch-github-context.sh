#!/usr/bin/env bash
set -e

ISSUE_REF="${1:-}"

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

echo ""
echo "=== ISSUE_SUMMARY ==="

# 引数でIssue URL/番号が指定されていない場合、PR本文のクローズキーワードから自動検出する
if [ -z "$ISSUE_REF" ] && [ -n "$PR_JSON" ]; then
  ISSUE_REF=$(echo "$PR_JSON" | jq -r '.body // ""' \
    | grep -ioE '(close[sd]?|fix(e[sd])?|resolve[sd]?)[[:space:]]+(https://github\.com/[^ )]+/issues/[0-9]+|#[0-9]+)' \
    | grep -oE '(https://github\.com/[^ )]+/issues/[0-9]+|#[0-9]+)' \
    | head -n 1 || true)
fi

if [ -z "$ISSUE_REF" ]; then
  echo "ISSUE: NOT_FOUND"
  exit 0
fi

ISSUE_REF="${ISSUE_REF#\#}"

if ! ISSUE_JSON=$(gh issue view "$ISSUE_REF" --json number,title,body,url 2>/dev/null); then
  echo "ISSUE: NOT_FOUND"
  exit 0
fi

echo "$ISSUE_JSON" | jq -r '"Issue #\(.number): \(.title)", "URL: \(.url)", "", .body'
