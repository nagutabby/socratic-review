#!/usr/bin/env bash
set -e

README_FILE=""
for f in README.md README.ja.md Readme.md; do
  if [ -f "$f" ]; then
    README_FILE="$f"
    break
  fi
done

if [ -z "$README_FILE" ]; then
  echo "README: None"
  exit 0
fi

echo "=== README_SUMMARY (${README_FILE}) ==="
grep -E "^#|^##|^###|概要|Overview|Architecture|設計" "$README_FILE" | head -n 30
echo ""
echo "--- Head Content ---"
head -n 50 "$README_FILE"
