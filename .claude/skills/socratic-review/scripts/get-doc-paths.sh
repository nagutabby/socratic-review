#!/usr/bin/env bash
set -e

print_doc_paths() {
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

  echo "=== ${label}_PATHS ==="
  echo "Found ${#files[@]} file(s)"
  local count=0 heading heading_count
  for f in "${files[@]}"; do
    count=$((count + 1))
    if [ "$count" -gt 20 ]; then
      echo "... (and $(( ${#files[@]} - 20 )) more, truncated)"
      break
    fi
    echo "- ${f}"
    heading_count=0
    while IFS= read -r heading; do
      [ -z "$heading" ] && continue
      heading_count=$((heading_count + 1))
      if [ "$heading_count" -gt 15 ]; then
        echo "  - ... (more headings truncated)"
        break
      fi
      echo "  - ${heading}"
    done < <(grep -E "^#{1,6}([[:space:]]|$)" "$f" 2>/dev/null | sed -E 's/^#+[[:space:]]*//')
  done
}

find_first_existing() {
  local f
  for f in "$@"; do
    if [ -f "$f" ]; then
      echo "$f"
      return 0
    fi
  done
  return 1
}

README_FILE=$(find_first_existing README.md README.ja.md Readme.md || true)
if [ -n "$README_FILE" ]; then
  print_doc_paths "README" "$README_FILE"
else
  echo "README: None"
fi
echo ""
print_doc_paths "ADR" docs/adr docs/adrs doc/adr adr adrs docs/decisions decisions ADR.md
echo ""
print_doc_paths "SPEC" docs/spec docs/specs spec specs SPEC.md Spec.md docs/SPEC.md DESIGN.md docs/design docs/DESIGN.md
