#!/usr/bin/env bash
set -e

DECISIONS_FILE="DECISIONS.md"
STATE_FILE=".claude/socratic-state.json"

if [ ! -f "$STATE_FILE" ]; then
  echo "ERROR: State file not found."
  exit 1
fi

touch "$DECISIONS_FILE"

DATE_STR=$(date +"%Y-%m-%d")

echo "" >> "$DECISIONS_FILE"
echo "## Architecture Decision - ${DATE_STR}" >> "$DECISIONS_FILE"

jq -r '.qa_list[]? | select(.status=="resolved") | "- **Q (\(.expert)):** \(.question)\n  - **Decision:** \(.answer)"' "$STATE_FILE" >> "$DECISIONS_FILE"

echo "WRITTEN_TO_DECISIONS: ${DECISIONS_FILE}"
