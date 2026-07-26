#!/usr/bin/env bash
set -e

FILE_PATH="${1:?Usage: $0 <file_path> <line_number> <intent>}"
LINE_NUMBER="${2:?Usage: $0 <file_path> <line_number> <intent>}"
INTENT="${3:?Usage: $0 <file_path> <line_number> <intent>}"

if [ ! -f "$FILE_PATH" ]; then
  echo "ERROR: ファイルが存在しません: ${FILE_PATH}"
  exit 1
fi

# 作業ディレクトリ（カレントディレクトリ）配下のファイルのみを書き込み対象として許可する。
# シンボリックリンクや `../` を用いたパストラバーサルで作業ディレクトリ外のファイル
# （例: 設定ファイルや認証情報など）が書き換えられることを防ぐためのcontainmentチェック。
WORKDIR_ROOT=$(pwd -P)
FILE_DIR=$(cd "$(dirname "$FILE_PATH")" 2>/dev/null && pwd -P)
if [ -z "$FILE_DIR" ]; then
  echo "ERROR: ファイルの親ディレクトリを解決できませんでした: ${FILE_PATH}"
  exit 1
fi
RESOLVED_PATH="${FILE_DIR}/$(basename "$FILE_PATH")"

case "$RESOLVED_PATH" in
  "$WORKDIR_ROOT"/*) ;;
  *)
    echo "ERROR: 作業ディレクトリ外のファイルへの書き込みは禁止されています: ${FILE_PATH}"
    exit 1
    ;;
esac

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

BODY="${INTENT}"

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
