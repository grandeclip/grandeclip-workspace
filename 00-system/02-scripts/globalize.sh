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

# "우리 것" 판별: repo .claude 안을 가리키는 "현재의" 심볼릭 링크일 때만 인정
# (매니페스트에 과거 기록이 있어도, 사용자가 실파일/디렉터리로 교체했다면 더 이상 우리 것이 아님)
is_ours() {  # $1=key(cat/name)  $2=destpath
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
    elif [ -e "$dest" ] || [ -L "$dest" ]; then
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

# 전역 CLAUDE.md 관리 블록 주입
SECURITY_BLOCK="$REPO_ROOT/00-system/03-guides/global-security-block.md"
CLAUDE_MD="$DEST/CLAUDE.md"
START="<!-- GRANDECLIP:START -->"
END="<!-- GRANDECLIP:END -->"
if [ -f "$SECURITY_BLOCK" ]; then
  tmp="$(mktemp)"
  if [ -f "$CLAUDE_MD" ] && grep -qF "$START" "$CLAUDE_MD"; then
    # 마커 사이 내용 교체
    awk -v s="$START" -v e="$END" -v bf="$SECURITY_BLOCK" '
      $0==s { print s; while ((getline line < bf) > 0) print line; close(bf); print e; skip=1; next }
      $0==e { skip=0; next }
      !skip { print }
    ' "$CLAUDE_MD" > "$tmp"
  else
    # 마커 없음 → 개인 내용 뒤에 추가(파일 없으면 새로 생성)
    { [ -f "$CLAUDE_MD" ] && cat "$CLAUDE_MD" && echo; echo "$START"; cat "$SECURITY_BLOCK"; echo "$END"; } > "$tmp"
  fi
  mv "$tmp" "$CLAUDE_MD"
  echo "전역 보안 지침(CLAUDE.md) 갱신 완료"
fi

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
