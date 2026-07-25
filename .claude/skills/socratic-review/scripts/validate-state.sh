#!/usr/bin/env bash
set -e

STATE_FILE=".claude/socratic-state.json"
ACTION="${1:-validate}" # validate | init | append

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq コマンドが必要です。'brew install jq' 等でインストールしてください。"
  exit 1
fi

mkdir -p .claude

case "$ACTION" in
  init)
    cat <<EOF > "$STATE_FILE"
{
  "version": "1.0",
  "issue_url": "${2:-none}",
  "status": "in_progress",
  "qa_list": []
}
EOF
    echo "INITIALIZED: ${STATE_FILE}"
    ;;

  validate)
    if [ ! -f "$STATE_FILE" ]; then
      echo "NOT_FOUND"
      exit 0
    fi
    if jq empty "$STATE_FILE" >/dev/null 2>&1; then
      echo "VALID"
    else
      echo "INVALID_JSON"
      exit 1
    fi
    ;;

  append)
    EXPERT_NAME="${2:-General}"
    QUESTION="${3:-}"
    ANSWER="${4:-}"
    STATUS="${5:-resolved}" # resolved | skipped

    if [ ! -f "$STATE_FILE" ] || ! jq empty "$STATE_FILE" >/dev/null 2>&1; then
      echo "ERROR: STATEファイルが存在しないか不正です。"
      exit 1
    fi

    UPDATED_JSON=$(jq --arg expert "$EXPERT_NAME" \
                      --arg q "$QUESTION" \
                      --arg a "$ANSWER" \
                      --arg s "$STATUS" \
                      '.qa_list += [{expert: $expert, question: $q, answer: $a, status: $s}]' "$STATE_FILE")
    echo "$UPDATED_JSON" > "$STATE_FILE"
    echo "APPENDED"
    ;;

  *)
    echo "Usage: $0 {validate|init <issue_url>|append <expert> <question> <answer> <status>}"
    exit 1
    ;;
esac
