#!/usr/bin/env bash
set -e

KIND="${1:?Usage: echo '<json>' | $0 <expert|spec-explorer> [expected_icon] [expected_name]}"
EXPECTED_ICON="${2:-}"
EXPECTED_NAME="${3:-}"

fail() {
  echo "ERROR: $1"
  exit 1
}

if ! command -v jq >/dev/null 2>&1; then
  fail "jq コマンドが見つかりません"
fi

JSON_INPUT="$(cat)"

if [ -z "$JSON_INPUT" ]; then
  fail "標準入力からJSONが渡されていません（例: echo '<json>' | $0 ${KIND}）"
fi

if ! echo "$JSON_INPUT" | jq -e . >/dev/null 2>&1; then
  fail "不正なJSON形式です"
fi

if [ "$(echo "$JSON_INPUT" | jq -r 'type')" != "object" ]; then
  fail "トップレベルはJSONオブジェクトである必要があります"
fi

case "$KIND" in
  expert)
    STATUS=$(echo "$JSON_INPUT" | jq -r '.status // empty')
    case "$STATUS" in
      no_finding)
        ;;
      finding)
        for field in expert_icon expert_name priority file_path line_number concern open_question closed_question; do
          FIELD_VALUE=$(echo "$JSON_INPUT" | jq -r --arg f "$field" '.[$f] // empty')
          [ -n "$FIELD_VALUE" ] || fail "必須フィールド '${field}' が空、または存在しません"
        done

        PRIORITY=$(echo "$JSON_INPUT" | jq -r '.priority')
        case "$PRIORITY" in
          高|中|低) ;;
          *) fail "priority は 高・中・低 のいずれかである必要があります（実際: ${PRIORITY}）" ;;
        esac

        LINE_NUMBER=$(echo "$JSON_INPUT" | jq -r '.line_number')
        if ! [[ "$LINE_NUMBER" =~ ^[0-9]+$ ]] || [ "$LINE_NUMBER" -lt 1 ]; then
          fail "line_number は1以上の整数である必要があります（実際: ${LINE_NUMBER}）"
        fi

        OPEN_QUESTION=$(echo "$JSON_INPUT" | jq -r '.open_question')
        case "$OPEN_QUESTION" in
          *'?'|*'？') ;;
          *) fail "open_question は疑問形（？）で終わる必要があります" ;;
        esac

        CLOSED_QUESTION=$(echo "$JSON_INPUT" | jq -r '.closed_question')
        case "$CLOSED_QUESTION" in
          *'?'|*'？') ;;
          *) fail "closed_question は疑問形（？）で終わる必要があります" ;;
        esac

        EXPERT_ICON=$(echo "$JSON_INPUT" | jq -r '.expert_icon')
        if [ -n "$EXPECTED_ICON" ] && [ "$EXPERT_ICON" != "$EXPECTED_ICON" ]; then
          fail "expert_icon が自身の担当アイコン '${EXPECTED_ICON}' と一致しません（実際: ${EXPERT_ICON}）"
        fi

        EXPERT_NAME=$(echo "$JSON_INPUT" | jq -r '.expert_name')
        if [ -n "$EXPECTED_NAME" ] && [ "$EXPERT_NAME" != "$EXPECTED_NAME" ]; then
          fail "expert_name が自身の担当名 '${EXPECTED_NAME}' と一致しません（実際: ${EXPERT_NAME}）"
        fi
        ;;
      *)
        fail "status は finding または no_finding のいずれかである必要があります（実際: ${STATUS}）"
        ;;
    esac
    ;;

  spec-explorer)
    TAGS_TYPE=$(echo "$JSON_INPUT" | jq -r '.tags | type')
    [ "$TAGS_TYPE" = "array" ] || fail "tags は配列である必要があります"

    TAGS_LEN=$(echo "$JSON_INPUT" | jq -r '.tags | length')
    [ "$TAGS_LEN" -gt 0 ] || fail "tags は最低1件必要です"

    while IFS= read -r tag; do
      case "$tag" in
        Security|QA|Arch|Ops|UI/UX|Logic/General) ;;
        *) fail "不正なタグが含まれています: ${tag}" ;;
      esac
    done < <(echo "$JSON_INPUT" | jq -r '.tags[]')

    HAS_LOGIC_GENERAL=$(echo "$JSON_INPUT" | jq -r '(.tags | index("Logic/General")) // "null"')
    if [ "$HAS_LOGIC_GENERAL" != "null" ] && [ "$TAGS_LEN" -gt 1 ]; then
      fail "Logic/General は他タグと併用できません"
    fi

    FILES_TYPE=$(echo "$JSON_INPUT" | jq -r '.files | type')
    [ "$FILES_TYPE" = "array" ] || fail "files は配列である必要があります"

    FILES_LEN=$(echo "$JSON_INPUT" | jq -r '.files | length')
    [ "$FILES_LEN" -gt 0 ] || fail "files は最低1件必要です"

    FILES_INVALID=$(echo "$JSON_INPUT" | jq -r '[.files[] | select((.file_path // "" | length == 0) or (.summary // "" | length == 0))] | length')
    [ "$FILES_INVALID" -eq 0 ] || fail "files の各要素に file_path と summary が必要です"
    ;;

  *)
    fail "kind は expert または spec-explorer のいずれかである必要があります（実際: ${KIND}）"
    ;;
esac

echo "VALID: ${KIND}"
