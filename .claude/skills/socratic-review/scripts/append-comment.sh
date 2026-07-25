#!/usr/bin/env bash
set -e

FILE_PATH="${1:?Usage: $0 <file_path> <line_number> <expert> <question> <answer> <status>}"
LINE_NUMBER="${2:?Usage: $0 <file_path> <line_number> <expert> <question> <answer> <status>}"
EXPERT_NAME="${3:-General}"
QUESTION="${4:-}"
ANSWER="${5:-}"
STATUS="${6:-resolved}" # resolved | skipped

if [ ! -f "$FILE_PATH" ]; then
  echo "ERROR: ファイルが存在しません: ${FILE_PATH}"
  exit 1
fi

if ! [[ "$LINE_NUMBER" =~ ^[0-9]+$ ]] || [ "$LINE_NUMBER" -lt 1 ]; then
  echo "ERROR: 行番号は1以上の数値で指定してください: ${LINE_NUMBER}"
  exit 1
fi

TOTAL_LINES=$(wc -l < "$FILE_PATH" | tr -d ' ')
if [ "$LINE_NUMBER" -gt "$((TOTAL_LINES + 1))" ]; then
  echo "ERROR: 行番号がファイルの範囲を超えています: ${LINE_NUMBER} (総行数: ${TOTAL_LINES})"
  exit 1
fi

EXT="${FILE_PATH##*.}"

# 拡張子ごとのコメント構文を決定
OPEN=""
CLOSE=""
PREFIX="//"
case "$EXT" in
  py|rb|sh|bash|zsh|yaml|yml|toml|pl|r|R|Dockerfile) PREFIX="#" ;;
  js|jsx|ts|tsx|mjs|cjs|go|java|c|cc|cpp|h|hpp|cs|swift|kt|kts|rs|scala|dart|groovy|php) PREFIX="//" ;;
  css|scss|less) OPEN="/*"; CLOSE="*/" ;;
  html|htm|xml|vue|svelte) OPEN="<!--"; CLOSE="-->" ;;
  sql|lua) PREFIX="--" ;;
  *) PREFIX="//" ;;
esac

# 挿入先行のインデントに合わせる（末尾追記の場合は無インデント）
if [ "$LINE_NUMBER" -le "$TOTAL_LINES" ]; then
  INDENT=$(sed -n "${LINE_NUMBER}p" "$FILE_PATH" | sed -E 's/^([ \t]*).*/\1/')
else
  INDENT=""
fi

BODY="[socratic-review] Q(${EXPERT_NAME}, ${STATUS}): ${QUESTION} / A: ${ANSWER}"

if [ -n "$OPEN" ]; then
  COMMENT_LINE="${INDENT}${OPEN} ${BODY} ${CLOSE}"
else
  COMMENT_LINE="${INDENT}${PREFIX} ${BODY}"
fi

TMP_FILE=$(mktemp)
awk -v line="$LINE_NUMBER" -v comment="$COMMENT_LINE" '
  NR == line { print comment }
  { print }
  END { if (line > NR) print comment }
' "$FILE_PATH" > "$TMP_FILE"

mv "$TMP_FILE" "$FILE_PATH"

echo "APPENDED: ${FILE_PATH}:${LINE_NUMBER}"
