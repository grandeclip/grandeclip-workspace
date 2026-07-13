#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SRC="$REPO_ROOT/.claude"
DEST="${CLAUDE_GLOBAL_DIR:-$HOME/.claude}"
MANIFEST="$DEST/.grandeclip-managed.json"

linked=0; skipped=0; conflicts=0
conflict_list=""
managed_now=""   # 이번 실행에서 관리하는 "cat/name" 목록(개행 구분)

mkdir -p "$DEST/skills" "$DEST/agents" "$DEST/commands"

# 기존 매니페스트 로드(따옴표로 감싼 "cat/name" 추출)
managed_prev=""
if [ -f "$MANIFEST" ]; then
  managed_prev="$(grep -o '"[^"]*"' "$MANIFEST" | tr -d '"' || true)"
fi

was_managed() { printf '%s\n' "$managed_prev" | grep -qxF "$1"; }

# "우리 것" 판별: 매니페스트에 있거나, repo .claude 안을 가리키는 심볼릭 링크
is_ours() {  # $1=key(cat/name)  $2=destpath
  was_managed "$1" && return 0
  if [ -L "$2" ]; then
    local t; t="$(readlink "$2")"
    case "$t" in "$SRC"/*) return 0;; esac
  fi
  return 1
}

process_category() {  # $1 = skills|agents|commands
  local cat="$1"
  [ -d "$SRC/$cat" ] || return 0
  local path name key dest
  for path in "$SRC/$cat"/*; do
    [ -e "$path" ] || continue
    name="$(basename "$path")"
    key="$cat/$name"
    dest="$DEST/$cat/$name"
    if is_ours "$key" "$dest"; then
      ln -sfn "$path" "$dest"
      managed_now="$managed_now$key"$'\n'
      skipped=$((skipped+1))
    elif [ -e "$dest" ]; then
      conflicts=$((conflicts+1))
      conflict_list="$conflict_list  - $key (이미 다른 내용이 있어 건너뜀)"$'\n'
    else
      ln -sfn "$path" "$dest"
      managed_now="$managed_now$key"$'\n'
      linked=$((linked+1))
    fi
  done
}

process_category skills
process_category agents
process_category commands

# 매니페스트 저장(JSON 배열)
{
  echo "["
  printf '%s' "$managed_now" | sed '/^$/d' | sort -u | \
    awk 'NR>1{printf ",\n"} {printf "  \"%s\"", $0} END{if(NR>0)printf "\n"}'
  echo "]"
} > "$MANIFEST"

echo "전역 적용 요약: 링크 $linked · 유지 $skipped · 충돌 $conflicts"
if [ "$conflicts" -gt 0 ]; then
  echo "충돌(덮지 않음):"
  printf '%s' "$conflict_list"
fi
