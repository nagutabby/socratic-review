#!/usr/bin/env bash
set -e

PROTECTED_BRANCHES="main master develop"

CURRENT_BRANCH=$(git branch --show-current)

if [ -z "$CURRENT_BRANCH" ]; then
  echo "ERROR: 現在のブランチを取得できませんでした（detached HEADの可能性があります）"
  exit 1
fi

for BRANCH in $PROTECTED_BRANCHES; do
  if [ "$CURRENT_BRANCH" = "$BRANCH" ]; then
    echo "ERROR: 保護ブランチ '${CURRENT_BRANCH}' へのpushは禁止されています"
    exit 1
  fi
done

TARGET_BRANCH="${1:-$CURRENT_BRANCH}"

if [ "$TARGET_BRANCH" != "$CURRENT_BRANCH" ]; then
  echo "ERROR: 現在の作業ブランチ '${CURRENT_BRANCH}' 以外へのpushは禁止されています（指定: '${TARGET_BRANCH}'）"
  exit 1
fi

for BRANCH in $PROTECTED_BRANCHES; do
  if [ "$TARGET_BRANCH" = "$BRANCH" ]; then
    echo "ERROR: 保護ブランチ '${TARGET_BRANCH}' へのpushは禁止されています"
    exit 1
  fi
done

REMOTE="${2:-origin}"

git push -u "$REMOTE" "HEAD:${CURRENT_BRANCH}" >/dev/null 2>&1

echo "PUSHED: ${REMOTE}/${CURRENT_BRANCH}"
