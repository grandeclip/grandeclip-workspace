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

echo "T3-a: CLAUDE.md 없을 때 — 관리 블록과 함께 생성"
H="$(newhome)"; CLAUDE_GLOBAL_DIR="$H" bash "$GLOBALIZE" >/dev/null 2>&1
[ -f "$H/CLAUDE.md" ]; check "$?" "0" "CLAUDE.md 생성됨"
grep -q "GRANDECLIP:START" "$H/CLAUDE.md"; check "$?" "0" "시작 마커 존재"
grep -q "보안 원칙" "$H/CLAUDE.md"; check "$?" "0" "보안 지침 주입됨"
rm -rf "$H"

echo "T3-b: 기존 개인 내용 보존 + 블록 추가"
H="$(newhome)"; printf '# 내 개인 설정\n항상 존댓말.\n' > "$H/CLAUDE.md"
CLAUDE_GLOBAL_DIR="$H" bash "$GLOBALIZE" >/dev/null 2>&1
grep -q "항상 존댓말" "$H/CLAUDE.md"; check "$?" "0" "개인 내용 보존됨"
grep -q "GRANDECLIP:START" "$H/CLAUDE.md"; check "$?" "0" "관리 블록 추가됨"
rm -rf "$H"

echo "T3-c: 재실행 시 블록 중복 없이 교체"
H="$(newhome)"; printf '# 개인\n메모.\n' > "$H/CLAUDE.md"
CLAUDE_GLOBAL_DIR="$H" bash "$GLOBALIZE" >/dev/null 2>&1
CLAUDE_GLOBAL_DIR="$H" bash "$GLOBALIZE" >/dev/null 2>&1
cnt="$(grep -c "GRANDECLIP:START" "$H/CLAUDE.md")"
check "$cnt" "1" "시작 마커가 정확히 1개"
grep -q "메모." "$H/CLAUDE.md"; check "$?" "0" "재실행 후에도 개인 내용 보존"
rm -rf "$H"

echo "T3-d: 마커가 비정상(짝 없는 START) → 자동 갱신 건너뛰고 개인 내용 보존"
H="$(newhome)"; printf '# 개인\n<!-- GRANDECLIP:START -->\n(잘못된 상태)\n중요한 개인 메모\n' > "$H/CLAUDE.md"
out="$(CLAUDE_GLOBAL_DIR="$H" bash "$GLOBALIZE" 2>&1)"
grep -q "중요한 개인 메모" "$H/CLAUDE.md"; check "$?" "0" "비정상 마커 시 개인 내용 보존"
echo "$out" | grep -q "마커가 비정상"; check "$?" "0" "비정상 마커 경고 출력"
rm -rf "$H"

echo "결과: pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
