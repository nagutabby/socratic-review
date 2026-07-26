#!/usr/bin/env bash
set -e

print_doc_paths() {
  local label="$1"
  shift
  local files=("$@")
  local f

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

# node_modules と .git を除外しつつプロジェクトルート配下を再帰的に辿るための共通の prune 条件
PRUNE_ARGS=( "(" -path "./node_modules" -o -path "./.git" ")" -prune -o )

# ファイル名（大文字小文字を区別しない）に完全一致するファイルをルートから再帰的に検索する
find_files_by_name() {
  local pattern="$1"
  find . "${PRUNE_ARGS[@]}" -type f -iname "$pattern" -print 2>/dev/null | sed 's|^\./||'
}

# ディレクトリ名（大文字小文字を区別しない）に完全一致するディレクトリ配下の
# md/adoc/rst ファイルをルートから再帰的に検索する
find_files_under_dirs_named() {
  local pattern="$1" dir
  find . "${PRUNE_ARGS[@]}" -type d -iname "$pattern" -print 2>/dev/null | while IFS= read -r dir; do
    find "$dir" -type f \( -iname "*.md" -o -iname "*.adoc" -o -iname "*.rst" \) 2>/dev/null
  done | sed 's|^\./||'
}

mapfile -t readme_files < <(find_files_by_name "README.md" | sort -u)
print_doc_paths "README" "${readme_files[@]}"

echo ""

mapfile -t adr_files < <(
  {
    find_files_under_dirs_named "adr"
    find_files_under_dirs_named "adrs"
    find_files_by_name "adr.md"
    find_files_by_name "adrs.md"
  } | sort -u
)
print_doc_paths "ADR" "${adr_files[@]}"

echo ""

mapfile -t spec_files < <(
  {
    find_files_under_dirs_named "spec"
    find_files_under_dirs_named "specs"
    find_files_by_name "spec.md"
    find_files_by_name "specs.md"
  } | sort -u
)
print_doc_paths "SPEC" "${spec_files[@]}"
