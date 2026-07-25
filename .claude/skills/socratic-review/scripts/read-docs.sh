#!/usr/bin/env bash
set -e

print_doc_summary() {
  local label="$1"
  shift
  local paths=("$@")
  local files=()
  local f p

  for p in "${paths[@]}"; do
    if [ -d "$p" ]; then
      while IFS= read -r f; do
        files+=("$f")
      done < <(find "$p" -type f \( -iname "*.md" -o -iname "*.adoc" -o -iname "*.rst" \) 2>/dev/null | sort)
    elif [ -f "$p" ]; then
      files+=("$p")
    fi
  done

  if [ ${#files[@]} -eq 0 ]; then
    echo "${label}: None"
    return
  fi

  echo "=== ${label}_SUMMARY ==="
  echo "Found ${#files[@]} file(s)"
  local count=0 title
  for f in "${files[@]}"; do
    count=$((count + 1))
    if [ "$count" -gt 20 ]; then
      echo "... (and $(( ${#files[@]} - 20 )) more, truncated)"
      break
    fi
    title=$(grep -m1 -E "^#" "$f" 2>/dev/null | sed -E 's/^#+[[:space:]]*//')
    echo "- ${f}${title:+: ${title}}"
  done
}

README_FILE=""
for f in README.md README.ja.md Readme.md; do
  if [ -f "$f" ]; then
    README_FILE="$f"
    break
  fi
done

if [ -n "$README_FILE" ]; then
  echo "=== README_SUMMARY (${README_FILE}) ==="
  grep -E "^#|^##|^###|概要|Overview|Architecture|設計" "$README_FILE" | head -n 30
  echo ""
  echo "--- Head Content ---"
  head -n 50 "$README_FILE"
else
  echo "README: None"
fi

echo ""
print_doc_summary "ADR" docs/adr docs/adrs doc/adr adr adrs docs/decisions decisions ADR.md

echo ""
print_doc_summary "SPEC" docs/spec docs/specs spec specs SPEC.md Spec.md docs/SPEC.md DESIGN.md docs/design docs/DESIGN.md
