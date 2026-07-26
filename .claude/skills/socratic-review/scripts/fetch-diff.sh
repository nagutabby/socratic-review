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
# タグは専門家エージェントごとのグループに属し、判定順もグループ単位でまとめている
# (sec-expert): Security (旧APIタグを統合)
# (qa-expert): QA, Logic/General(フォールバック)
# (arch-expert): Arch (旧DBタグを統合)
# (ops-expert): Ops
# (ui-ux-expert): UI/UX
TAGS=()
if echo "$DIFF_FILES" | grep -iE 'auth|security|crypto|token|api/|routes/|controller|grpc|http' >/dev/null; then TAGS+=("Security"); fi
if echo "$DIFF_FILES" | grep -iE 'test/|tests/|spec/|__tests__/|\.test\.|\.spec\.|validat' >/dev/null; then TAGS+=("QA"); fi
if echo "$DIFF_FILES" | grep -iE 'interfaces?/|abstract|factory|container|dependency|di/|core/|domain/|module|db/|schema|migration|prisma|sql' >/dev/null; then TAGS+=("Arch"); fi
if echo "$DIFF_FILES" | grep -iE 'config|\.env|docker|k8s|helm|terraform|\.github/workflows|logg?ing|metrics|monitoring' >/dev/null; then TAGS+=("Ops"); fi
if echo "$DIFF_FILES" | grep -iE 'components/|views/|pages/|ui/|css|scss|tailwind' >/dev/null; then TAGS+=("UI/UX"); fi

if [ ${#TAGS[@]} -eq 0 ]; then
  TAGS+=("Logic/General")
fi

echo "[Tags: $(IFS=, ; echo "${TAGS[*]}")]"
