#!/usr/bin/env bash
set -e

FILE_PATH="${1:?Usage: $0 <file_path> [ref]}"
REF="${2:-}"

if [ -n "$REF" ]; then
  gh api "repos/{owner}/{repo}/contents/${FILE_PATH}?ref=${REF}" --jq '.content' | base64 -d
else
  gh api "repos/{owner}/{repo}/contents/${FILE_PATH}" --jq '.content' | base64 -d
fi
