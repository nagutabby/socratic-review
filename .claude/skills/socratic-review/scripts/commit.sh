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

# `git add -A` は作業ツリー上の全ファイルを無差別にステージするため、
# レビューと無関係にたまたま置かれていた機密情報ファイル（.env、秘密鍵等）まで
# 誤ってcommitしてしまう懸念がある。ステージ前に変更・未追跡ファイルのパスを
# 機密ファイルによくあるパターンと照合し、該当する場合はcommitを中断する。
SUSPICIOUS_PATTERN='\.(env(\..+)?|pem|key|pfx|p12|pgpass)$|(^|/)id_(rsa|dsa|ecdsa|ed25519)$|(^|/)(credentials|secrets?)\.(json|ya?ml)$|(^|/)\.npmrc$|service[-_]?account.*\.json$'

CHANGED_PATHS=$(git status --porcelain | sed -E 's/^.{3}//' | sed -E 's/.* -> //')
SUSPICIOUS_FILES=$(echo "$CHANGED_PATHS" | grep -iE "$SUSPICIOUS_PATTERN" || true)

if [ -n "$SUSPICIOUS_FILES" ]; then
  echo "ERROR: 機密情報を含む可能性のあるファイルが検出されたためcommitを中断しました:"
  echo "$SUSPICIOUS_FILES"
  exit 1
fi

git add -A

if git diff --cached --quiet; then
  echo "NO_CHANGES: commit対象の変更がありません"
  exit 0
fi

git commit -m "$COMMIT_MESSAGE" >/dev/null

echo "COMMITTED: ${CURRENT_BRANCH} - ${COMMIT_MESSAGE}"
