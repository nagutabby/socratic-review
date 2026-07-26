#!/usr/bin/env bash
set -e

COMMIT_MESSAGE="${1:?Usage: $0 <commit_message>}"

PROTECTED_BRANCHES="main master develop"

CURRENT_BRANCH=$(git branch --show-current)

if [ -z "$CURRENT_BRANCH" ]; then
  echo "ERROR: 現在のブランチを取得できませんでした（detached HEADの可能性があります）"
  exit 1
fi

for BRANCH in $PROTECTED_BRANCHES; do
  if [ "$CURRENT_BRANCH" = "$BRANCH" ]; then
    echo "ERROR: 保護ブランチ '${CURRENT_BRANCH}' 上での直接のcommitは禁止されています"
    exit 1
  fi
done

git add -A

if git diff --cached --quiet; then
  echo "NO_CHANGES: commit対象の変更がありません"
  exit 0
fi

git commit -m "$COMMIT_MESSAGE" >/dev/null

echo "COMMITTED: ${CURRENT_BRANCH} - ${COMMIT_MESSAGE}"
