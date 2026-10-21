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

# career-os는 총괄 폴더 하나에 실행에 필요한 파일을 함께 둔다.
career_files=(
  "SKILL.md"
  "skills/company-research/SKILL.md"
  "skills/job-scout/SKILL.md"
  "skills/experience-extract/SKILL.md"
  "skills/application-build/SKILL.md"
  "agents/research.md"
  "agents/experience.md"
  "agents/writing.md"
  "references/runtime-contract.md"
)
career_pack_matches() {
  local target="$1" relative_path
  for relative_path in "${career_files[@]}"; do
    [ -r "$target/$relative_path" ] || return 1
    cmp -s "$REPO_ROOT/.claude/skills/career-os/$relative_path" "$target/$relative_path" || return 1
  done
}
career_refs_readable() {
  local target="$1" relative_path source_file reference references
  for relative_path in "${career_files[@]}"; do
    source_file="$target/$relative_path"
    [ -r "$source_file" ] || return 1
    # 실행용 링크만 검사한다. 공통 계약의 경로 표기 예시는 각 독자의 위치 설명이다.
    references="$(
      grep -oE '\]\([A-Za-z0-9_./-]+\.md\)' "$source_file" | sed 's/^](//;s/)$//' || true
      if [ "$relative_path" = "SKILL.md" ]; then
        grep -oE '(skills/|agents/)[A-Za-z0-9_./-]+\.md' "$source_file" || true
      fi
    )"
    while IFS= read -r reference; do
      [ -n "$reference" ] || continue
      [ -r "$(dirname "$source_file")/$reference" ] || return 1
      cat "$(dirname "$source_file")/$reference" >/dev/null || return 1
    done <<< "$references"
  done
}

echo "T2-e: career-os 첫 전역 연결과 내부 참조 읽기"
H="$(newhome)"; CLAUDE_GLOBAL_DIR="$H" bash "$GLOBALIZE" >/dev/null 2>&1
[ -L "$H/skills/career-os" ]; check "$?" "0" "career-os 링크 생성됨"
career_pack_matches "$H/skills/career-os"; check "$?" "0" "career-os 필수 파일 9개 읽기와 원본 일치"
career_refs_readable "$H/skills/career-os"; check "$?" "0" "career-os 내부 상대 참조 읽기"
grep -q '"skills/career-os"' "$H/.grandeclip-managed.json"; check "$?" "0" "career-os 관리 항목 기록됨"
CLAUDE_GLOBAL_DIR="$H" bash "$GLOBALIZE" >/dev/null 2>&1; rc=$?
check "$rc" "0" "career-os 재실행 종료코드 0"
[ -L "$H/skills/career-os" ]; check "$?" "0" "재실행 후 career-os 링크 유효"
career_pack_matches "$H/skills/career-os"; check "$?" "0" "재실행 후 career-os 묶음 보존"
rm -rf "$H"

echo "T2-f: career-os 동명 개인 폴더가 있는 새 설치"
H="$(newhome)"; mkdir -p "$H/skills/career-os"
printf 'USER CAREER SKILL\n' > "$H/skills/career-os/SKILL.md"
out="$(CLAUDE_GLOBAL_DIR="$H" bash "$GLOBALIZE" 2>&1)"
[ ! -L "$H/skills/career-os" ]; check "$?" "0" "career-os 개인 폴더를 링크로 교체하지 않음"
grep -q 'USER CAREER SKILL' "$H/skills/career-os/SKILL.md"; check "$?" "0" "career-os 개인 파일 보존"
echo "$out" | grep -q 'skills/career-os (이미 다른 내용이 있어 건너뜀)'; check "$?" "0" "career-os 충돌 이름 보고"
grep -q '"skills/career-os"' "$H/.grandeclip-managed.json"; check "$?" "1" "개인 career-os를 관리 항목으로 기록하지 않음"
rm -rf "$H"

echo "T2-g: career-os 관리 링크를 개인 폴더로 바꾼 뒤 재실행"
H="$(newhome)"; CLAUDE_GLOBAL_DIR="$H" bash "$GLOBALIZE" >/dev/null 2>&1
rm -f "$H/skills/career-os"
mkdir -p "$H/skills/career-os"
printf 'MY REPLACED CAREER SKILL\n' > "$H/skills/career-os/SKILL.md"
out="$(CLAUDE_GLOBAL_DIR="$H" bash "$GLOBALIZE" 2>&1)"
[ ! -L "$H/skills/career-os" ]; check "$?" "0" "교체한 career-os 개인 폴더 유지"
grep -q 'MY REPLACED CAREER SKILL' "$H/skills/career-os/SKILL.md"; check "$?" "0" "교체한 career-os 개인 파일 보존"
echo "$out" | grep -q 'skills/career-os (이미 다른 내용이 있어 건너뜀)'; check "$?" "0" "교체 후 career-os 충돌 이름 보고"
grep -q '"skills/career-os"' "$H/.grandeclip-managed.json"; check "$?" "1" "교체한 career-os를 관리 항목에서 제외"
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
