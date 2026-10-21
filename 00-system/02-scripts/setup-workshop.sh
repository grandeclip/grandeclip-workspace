#!/usr/bin/env bash
# 수업용 번들 파일 준비. 네트워크, CLI 설치, 사용자 전역 설정을 사용하지 않는다.
set -euo pipefail

usage() {
  printf '%s\n' '사용법: bash 00-system/02-scripts/setup-workshop.sh --tool claude|codex [--check] [--yes]'
}
fail() { printf '오류: %s\n' "$*" >&2; exit 1; }
TOOL=""
CHECK_ONLY=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --tool)
      [ "$#" -ge 2 ] && [ -n "$2" ] || { usage >&2; exit 2; }
      [ -z "$TOOL" ] || { printf '%s\n' '--tool은 한 번만 지정해 주세요.' >&2; exit 2; }
      TOOL="$2"; shift 2 ;;
    --check) CHECK_ONLY=1; shift ;;
    --yes|-y) shift ;;
    --help|-h) usage; exit 0 ;;
    *) printf '알 수 없는 옵션: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
done
case "$TOOL" in claude|codex) ;; *) usage >&2; exit 2 ;; esac
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
SOURCE="$ROOT/.claude/skills/career-os"
REQUIRED=(
  SKILL.md
  skills/company-research/SKILL.md
  skills/job-scout/SKILL.md
  skills/experience-extract/SKILL.md
  skills/application-build/SKILL.md
  agents/research.md
  agents/experience.md
  agents/writing.md
  references/runtime-contract.md
)
printf '현재 도구: %s\n' "$TOOL"
missing=0
for relative in "${REQUIRED[@]}"; do
  if [ ! -f "$SOURCE/$relative" ] || [ ! -r "$SOURCE/$relative" ]; then
    printf '누락 또는 읽기 불가: %s\n' "$SOURCE/$relative" >&2
    missing=1
  fi
done
# 함께 배포하는 skill-creator의 본체·참조·보조 파일도 확인한다.
CREATOR_REQUIRED=(
  SKILL.md
  LICENSE.txt
  agents/analyzer.md
  agents/comparator.md
  agents/grader.md
  assets/eval_review.html
  eval-viewer/generate_review.py
  eval-viewer/viewer.html
  references/schemas.md
  scripts/__init__.py
  scripts/aggregate_benchmark.py
  scripts/generate_report.py
  scripts/improve_description.py
  scripts/package_skill.py
  scripts/quick_validate.py
  scripts/run_eval.py
  scripts/run_loop.py
  scripts/utils.py
)
if [ "$TOOL" = claude ]; then
  for relative in "${CREATOR_REQUIRED[@]}"; do
    if [ ! -f "$ROOT/.claude/skills/skill-creator/$relative" ] || [ ! -r "$ROOT/.claude/skills/skill-creator/$relative" ]; then
      printf '누락 또는 읽기 불가: %s\n' "$ROOT/.claude/skills/skill-creator/$relative" >&2
      missing=1
    fi
  done
fi
[ "$missing" -eq 0 ] || exit 1

# dotglob은 숨김 파일까지 확인한다. 복사 범위를 벗어나는 링크/특수 파일은 받지 않는다.
shopt -s dotglob nullglob
SOURCE_FILES=()
SOURCE_DIRS=("")
scan_bundle() {
  local directory="$1" base="$2" record="$3" entry relative
  [ ! -L "$directory" ] && [ -d "$directory" ] && [ -r "$directory" ] && [ -x "$directory" ] || fail "번들 디렉터리를 읽을 수 없습니다: $directory"
  for entry in "$directory"/*; do
    [ ! -L "$entry" ] || fail "번들에 심볼릭 링크가 있습니다: $entry"
    relative="${entry#"$base"/}"
    if [ -d "$entry" ]; then
      if [ "$record" = 1 ]; then SOURCE_DIRS+=("$relative"); fi
      scan_bundle "$entry" "$base" "$record"
    elif [ -f "$entry" ] && [ -r "$entry" ]; then
      # 실제로 파일을 열어 읽는지 확인한다.
      cat "$entry" >/dev/null || fail "번들 파일을 읽을 수 없습니다: $entry"
      if [ "$record" = 1 ]; then SOURCE_FILES+=("$relative"); fi
    else
      fail "번들 파일을 읽을 수 없습니다: $entry"
    fi
  done
}
scan_bundle "$SOURCE" "$SOURCE" 1
if [ "$TOOL" = claude ]; then
  scan_bundle "$ROOT/.claude/skills/skill-creator" "$ROOT/.claude/skills/skill-creator" 0
  printf '파일 준비 확인: .claude/skills/career-os (필수 9개, 전체 %s개 파일), .claude/skills/skill-creator\n' "${#SOURCE_FILES[@]}"
  printf '%s\n' '다음: 이 워크스페이스의 새 Claude 대화에서 career-os와 skill-creator가 스킬 목록에 보이는지 확인해 주세요.'
  exit 0
fi

AGENTS="$ROOT/.agents"
SKILLS="$AGENTS/skills"
DEST="$SKILLS/career-os"
check_directory() {
  local path="$1"
  [ ! -L "$path" ] || fail "충돌: 심볼릭 링크 경로에는 쓰지 않습니다: $path"
  if [ -e "$path" ] && [ ! -d "$path" ]; then fail "충돌: 디렉터리가 아닙니다: $path"; fi
}
check_directory "$AGENTS"
check_directory "$SKILLS"
check_directory "$DEST"
compare_bundle() {
  local target="$1" relative path
  for relative in "${SOURCE_DIRS[@]}"; do
    path="$target${relative:+/$relative}"
    if [ -L "$path" ] || [ ! -d "$path" ]; then
      printf '충돌 또는 누락: %s\n' "$path" >&2; return 1
    fi
  done
  for relative in "${SOURCE_FILES[@]}"; do
    path="$target/$relative"
    if [ -L "$path" ] || [ ! -f "$path" ] || [ ! -r "$path" ] || ! cmp -s "$SOURCE/$relative" "$path"; then
      printf '충돌 또는 누락: %s\n' "$path" >&2; return 1
    fi
  done
}
ready() {
  printf '파일 준비 확인: .agents/skills/career-os (필수 9개, 전체 %s개 파일)\n' "${#SOURCE_FILES[@]}"
  printf '%s\n' '다음: 이 워크스페이스의 새 Codex 대화에서 career-os와 기본 내장 skill-creator가 스킬 목록에 보이는지 확인해 주세요.'
}
if [ -d "$DEST" ]; then
  compare_bundle "$DEST" || fail '기존 career-os가 번들과 다릅니다. 개인 파일을 보존했습니다.'
  ready
  exit 0
fi
if [ "$CHECK_ONLY" -eq 1 ]; then
  fail "준비 파일 누락: $DEST (--check 없이 같은 명령을 실행해 주세요.)"
fi

STAGE=""
CREATED_AGENTS=0
CREATED_SKILLS=0
cleanup() {
  if [ -n "$STAGE" ] && [ -d "$STAGE" ]; then rm -rf "$STAGE"; fi
  if [ "$CREATED_SKILLS" -eq 1 ]; then rmdir "$SKILLS" 2>/dev/null || true; fi
  if [ "$CREATED_AGENTS" -eq 1 ]; then rmdir "$AGENTS" 2>/dev/null || true; fi
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
STAGE="$(mktemp -d "$ROOT/.workshop-skills.XXXXXX")" || fail '임시 복사 폴더를 만들지 못했습니다.'
cp -R "$SOURCE" "$STAGE/career-os" || fail '번들 복사 실패. 준비가 완료되지 않았습니다.'
compare_bundle "$STAGE/career-os" || fail '복사본 검증 실패. 준비가 완료되지 않았습니다.'
# 검증 이후에만 목적지 폴더를 만든다. 이동 실패 시 빈 폴더와 임시 복사본을 정리한다.
check_directory "$AGENTS"
check_directory "$SKILLS"
check_directory "$DEST"
[ ! -e "$DEST" ] || fail "충돌: 복사 중 대상이 생겼습니다: $DEST"
if [ ! -d "$AGENTS" ]; then mkdir "$AGENTS" || fail "폴더 생성 실패: $AGENTS"; CREATED_AGENTS=1; fi
if [ ! -d "$SKILLS" ]; then mkdir "$SKILLS" || fail "폴더 생성 실패: $SKILLS"; CREATED_SKILLS=1; fi
# 부모 경로로 -n 이동해 검증 이후 생긴 같은 이름의 폴더도 덮거나 중첩하지 않는다.
mv -n "$STAGE/career-os" "$SKILLS/" || fail '파일 이동 실패. 준비가 완료되지 않았습니다.'
[ ! -d "$STAGE/career-os" ] || fail "충돌: 파일 이동 전에 대상이 생겼습니다: $DEST"
ready
