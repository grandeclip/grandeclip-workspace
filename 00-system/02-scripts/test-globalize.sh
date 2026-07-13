#!/usr/bin/env bash
# globalize.sh 테스트 — 임시 CLAUDE_GLOBAL_DIR 대상, 실제 홈 미변경
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GLOBALIZE="$SCRIPT_DIR/globalize.sh"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
pass=0; fail=0
ok()   { echo "  ok: $1"; pass=$((pass+1)); }
bad()  { echo "  FAIL: $1"; fail=$((fail+1)); }
check(){ if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (기대=$2 실제=$1)"; fi; }

newhome() { mktemp -d "${TMPDIR:-/tmp}/ggtest.XXXXXX"; }

echo "T2-a: 첫 실행 — skills 링크 생성"
H="$(newhome)"; CLAUDE_GLOBAL_DIR="$H" bash "$GLOBALIZE" >/dev/null 2>&1
[ -L "$H/skills/brand-guidelines" ]; check "$?" "0" "brand-guidelines 링크 생성됨"
[ -f "$H/.grandeclip-managed.json" ]; check "$?" "0" "매니페스트 생성됨"
grep -q "skills/brand-guidelines" "$H/.grandeclip-managed.json"; check "$?" "0" "매니페스트에 항목 기록됨"
rm -rf "$H"

echo "T2-b: 재실행 멱등 — 링크 중복/오류 없음"
H="$(newhome)"; CLAUDE_GLOBAL_DIR="$H" bash "$GLOBALIZE" >/dev/null 2>&1
CLAUDE_GLOBAL_DIR="$H" bash "$GLOBALIZE" >/dev/null 2>&1; rc=$?
check "$rc" "0" "재실행 종료코드 0"
[ -L "$H/skills/brand-guidelines" ]; check "$?" "0" "재실행 후에도 링크 유효"
rm -rf "$H"

echo "T2-c: 충돌 — 우리 것이 아닌 동명 항목은 보존"
H="$(newhome)"; mkdir -p "$H/skills/brand-guidelines"
echo "user-own" > "$H/skills/brand-guidelines/marker.txt"
out="$(CLAUDE_GLOBAL_DIR="$H" bash "$GLOBALIZE" 2>&1)"
[ -f "$H/skills/brand-guidelines/marker.txt" ]; check "$?" "0" "사용자 항목 덮이지 않음"
echo "$out" | grep -qi "충돌"; check "$?" "0" "충돌로 보고됨"
rm -rf "$H"

echo "T2-d: 이전에 관리하던 이름을 사용자가 자기 파일로 교체 → 덮지 않고 충돌"
H="$(newhome)"; CLAUDE_GLOBAL_DIR="$H" bash "$GLOBALIZE" >/dev/null 2>&1
rm -f "$H/agents/zettelkasten-linker.md"
printf 'USER OWNED\n' > "$H/agents/zettelkasten-linker.md"
out="$(CLAUDE_GLOBAL_DIR="$H" bash "$GLOBALIZE" 2>&1)"
grep -q "USER OWNED" "$H/agents/zettelkasten-linker.md"; check "$?" "0" "사용자 파일 보존됨"
echo "$out" | grep -qi "충돌"; check "$?" "0" "충돌로 보고됨"
rm -rf "$H"

echo "결과: pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
