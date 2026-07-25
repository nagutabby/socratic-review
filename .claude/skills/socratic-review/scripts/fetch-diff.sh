#!/usr/bin/env bash
set -e

BASE_BRANCH="${1:-main}"
FOCUS_TARGET="${2:-}"

echo "=== DIFF_SUMMARY ==="
if [ -n "$FOCUS_TARGET" ]; then
  echo "Focus Target: ${FOCUS_TARGET}"
  DIFF_FILES=$(git diff "${BASE_BRANCH}...HEAD" -S"$FOCUS_TARGET" --name-only 2>/dev/null || git diff HEAD -S"$FOCUS_TARGET" --name-only)
else
  DIFF_FILES=$(git diff "${BASE_BRANCH}...HEAD" --name-only 2>/dev/null || git diff HEAD --name-only)
fi

echo "Changed Files:"
echo "$DIFF_FILES" | head -n 30

echo ""
echo "=== CATEGORY_TAGS ==="
TAGS=()
if echo "$DIFF_FILES" | grep -iE 'db/|schema|migration|prisma|sql' >/dev/null; then TAGS+=("DB"); fi
if echo "$DIFF_FILES" | grep -iE 'api/|routes/|controller|grpc|http' >/dev/null; then TAGS+=("API"); fi
if echo "$DIFF_FILES" | grep -iE 'auth|security|crypto|token' >/dev/null; then TAGS+=("Security"); fi
if echo "$DIFF_FILES" | grep -iE 'components/|views/|pages/|ui/|css|scss|tailwind' >/dev/null; then TAGS+=("UI/UX"); fi

if [ ${#TAGS[@]} -eq 0 ]; then
  TAGS+=("Logic/General")
fi

echo "[Tags: $(IFS=, ; echo "${TAGS[*]}")]"
