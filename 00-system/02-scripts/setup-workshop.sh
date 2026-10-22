#!/usr/bin/env bash
# 번들은 로컬에서 준비하고, 필요한 경우 공식 Node.js를 워크스페이스에 내려받는다.
set -euo pipefail
usage() { printf '%s\n' '사용법: bash 00-system/02-scripts/setup-workshop.sh --tool claude|codex [--check] [--yes]'; }
fail() { printf '오류: %s\n' "$*" >&2; exit 1; }
TOOL=""; CHECK_ONLY=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --tool) [ "$#" -ge 2 ] && [ -n "$2" ] || { usage >&2; exit 2; }; [ -z "$TOOL" ] || { printf '%s\n' '--tool은 한 번만 지정해 주세요.' >&2; exit 2; }; TOOL="$2"; shift 2 ;;
    --check) CHECK_ONLY=1; shift ;;
    --yes|-y) shift ;;
    --help|-h) usage; exit 0 ;;
    *) printf '알 수 없는 옵션: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
done
case "$TOOL" in claude|codex) ;; *) usage >&2; exit 2 ;; esac
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
BUNDLES=(career-os karpathy-llm-wiki)
CAREER_REQUIRED=(SKILL.md skills/company-research/SKILL.md skills/job-scout/SKILL.md skills/experience-extract/SKILL.md skills/application-build/SKILL.md agents/research.md agents/experience.md agents/writing.md references/runtime-contract.md)
WIKI_REQUIRED=(SKILL.md LICENSE references/raw-template.md references/article-template.md references/index-template.md references/archive-template.md references/workshop.md scripts/check_evidence.py)
CREATOR_REQUIRED=(SKILL.md LICENSE.txt agents/analyzer.md agents/comparator.md agents/grader.md assets/eval_review.html eval-viewer/generate_review.py eval-viewer/viewer.html references/schemas.md scripts/__init__.py scripts/aggregate_benchmark.py scripts/generate_report.py scripts/improve_description.py scripts/package_skill.py scripts/quick_validate.py scripts/run_eval.py scripts/run_loop.py scripts/utils.py)
APP_REQUIRED=(server.mjs lib/application.mjs lib/providers.mjs lib/store.mjs lib/import-tools.mjs public/index.html public/app.js public/style.css package.json)
printf '현재 도구: %s\n' "$TOOL"
missing=0
check_required() {
  local base="$1"; shift
  local relative
  for relative in "$@"; do
    if [ ! -f "$base/$relative" ] || [ ! -r "$base/$relative" ]; then printf '누락 또는 읽기 불가: %s\n' "$base/$relative" >&2; missing=1; fi
  done
}
check_required "$ROOT/.claude/skills/career-os" "${CAREER_REQUIRED[@]}"
check_required "$ROOT/.claude/skills/karpathy-llm-wiki" "${WIKI_REQUIRED[@]}"
check_required "$ROOT/00-system/wiki-app" "${APP_REQUIRED[@]}"
check_required "$SCRIPT_DIR" ensure-wiki-runtime.sh ensure-wiki-runtime.ps1 node-runtime-manifest.txt run-wiki.sh run-wiki.ps1
if [ "$TOOL" = claude ]; then check_required "$ROOT/.claude/skills/skill-creator" "${CREATOR_REQUIRED[@]}"; fi
[ "$missing" -eq 0 ] || exit 1
shopt -s dotglob nullglob
SOURCE_FILES=(); SOURCE_DIRS=(""); SOURCE=""
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
      cat "$entry" >/dev/null || fail "번들 파일을 읽을 수 없습니다: $entry"
      if [ "$record" = 1 ]; then SOURCE_FILES+=("$relative"); fi
    else fail "번들 파일을 읽을 수 없습니다: $entry"; fi
  done
}
set_bundle() { SOURCE="$ROOT/.claude/skills/$1"; SOURCE_FILES=(); SOURCE_DIRS=(""); scan_bundle "$SOURCE" "$SOURCE" 1; }
for bundle in "${BUNDLES[@]}"; do set_bundle "$bundle"; done
scan_bundle "$ROOT/00-system/wiki-app" "$ROOT/00-system/wiki-app" 0
runtime_status() {
  local node_path=""
  if [ "$CHECK_ONLY" -eq 1 ]; then
    node_path="$("$BASH" "$SCRIPT_DIR/ensure-wiki-runtime.sh" --check)" || { printf '%s\n' '위키 실행 환경 미준비: --check 없이 초기 설정을 진행해 주세요.' >&2; return 1; }
  else
    node_path="$("$BASH" "$SCRIPT_DIR/ensure-wiki-runtime.sh")" || { printf '%s\n' '스킬 파일은 준비했지만 위키 실행 환경 준비를 마치지 못했습니다.' >&2; return 1; }
  fi
  printf '위키 실행 환경 준비 확인: %s\n' "$node_path"
  printf '%s\n' '위키 열기: bash 00-system/02-scripts/run-wiki.sh' '이미 로그인된 Codex 또는 Claude Code 계정을 재사용합니다. 인증이 없거나 만료됐을 때만 로그인해 주세요.'
}
ready() {
  if [ "$TOOL" = claude ]; then printf '%s\n' '파일 준비 확인: .claude/skills/career-os, .claude/skills/karpathy-llm-wiki, .claude/skills/skill-creator';
  else printf '%s\n' '파일 준비 확인: .agents/skills/career-os, .agents/skills/karpathy-llm-wiki'; fi
  printf '%s\n' '위키 앱 파일 준비 확인: 00-system/wiki-app/'
  printf '다음: 같은 폴더의 새 %s 대화에서 career-os, karpathy-llm-wiki, skill-creator의 실제 인식을 확인해 주세요.\n' "$TOOL"
  runtime_status
}
if [ "$TOOL" = claude ]; then scan_bundle "$ROOT/.claude/skills/skill-creator" "$ROOT/.claude/skills/skill-creator" 0; ready; exit 0; fi
AGENTS="$ROOT/.agents"; SKILLS="$AGENTS/skills"
check_directory() {
  local path="$1"
  [ ! -L "$path" ] || fail "충돌: 심볼릭 링크 경로에는 쓰지 않습니다: $path"
  if [ -e "$path" ] && [ ! -d "$path" ]; then fail "충돌: 디렉터리가 아닙니다: $path"; fi
}
compare_bundle() {
  local target="$1" relative path
  for relative in "${SOURCE_DIRS[@]}"; do
    path="$target${relative:+/$relative}"
    if [ -L "$path" ] || [ ! -d "$path" ]; then printf '충돌 또는 누락: %s\n' "$path" >&2; return 1; fi
  done
  for relative in "${SOURCE_FILES[@]}"; do
    path="$target/$relative"
    if [ -L "$path" ] || [ ! -f "$path" ] || [ ! -r "$path" ] || ! cmp -s "$SOURCE/$relative" "$path"; then printf '충돌 또는 누락: %s\n' "$path" >&2; return 1; fi
  done
}
check_directory "$AGENTS"; check_directory "$SKILLS"
PENDING=()
for bundle in "${BUNDLES[@]}"; do
  set_bundle "$bundle"; DEST="$SKILLS/$bundle"; check_directory "$DEST"
  if [ -d "$DEST" ]; then compare_bundle "$DEST" || fail "기존 $bundle 스킬이 번들과 다릅니다. 개인 파일을 보존했습니다."
  elif [ "$CHECK_ONLY" -eq 1 ]; then fail "준비 파일 누락: $DEST (--check 없이 같은 명령을 실행해 주세요.)"
  else PENDING+=("$bundle"); fi
done
if [ "${#PENDING[@]}" -eq 0 ]; then ready; exit 0; fi
STAGE=""; CREATED_AGENTS=0; CREATED_SKILLS=0; SUCCESS=0; MOVED=()
cleanup() {
  if [ "$SUCCESS" -eq 0 ] && [ "${#MOVED[@]}" -gt 0 ]; then
    for bundle in "${MOVED[@]}"; do
      # 이번 실행이 만든 사본만 되돌린다. 그 사이 개인이 수정한 내용은 보존한다.
      set_bundle "$bundle"
      if compare_bundle "$SKILLS/$bundle" >/dev/null 2>&1; then rm -rf "$SKILLS/$bundle"; fi
    done
  fi
  if [ -n "$STAGE" ] && [ -d "$STAGE" ]; then rm -rf "$STAGE"; fi
  if [ "$CREATED_SKILLS" -eq 1 ]; then rmdir "$SKILLS" 2>/dev/null || true; fi
  if [ "$CREATED_AGENTS" -eq 1 ]; then rmdir "$AGENTS" 2>/dev/null || true; fi
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
STAGE="$(mktemp -d "$ROOT/.workshop-skills.XXXXXX")" || fail '임시 복사 폴더를 만들지 못했습니다.'
for bundle in "${PENDING[@]}"; do
  set_bundle "$bundle"
  cp -R "$SOURCE" "$STAGE/$bundle" || fail '번들 복사 실패. 준비가 완료되지 않았습니다.'
  compare_bundle "$STAGE/$bundle" || fail '복사본 검증 실패. 준비가 완료되지 않았습니다.'
done
check_directory "$AGENTS"; check_directory "$SKILLS"
for bundle in "${PENDING[@]}"; do check_directory "$SKILLS/$bundle"; [ ! -e "$SKILLS/$bundle" ] || fail "충돌: 복사 중 대상이 생겼습니다: $SKILLS/$bundle"; done
if [ ! -d "$AGENTS" ]; then mkdir "$AGENTS" || fail "폴더 생성 실패: $AGENTS"; CREATED_AGENTS=1; fi
if [ ! -d "$SKILLS" ]; then mkdir "$SKILLS" || fail "폴더 생성 실패: $SKILLS"; CREATED_SKILLS=1; fi
for bundle in "${PENDING[@]}"; do
  mv -n "$STAGE/$bundle" "$SKILLS/" || fail '파일 이동 실패. 준비가 완료되지 않았습니다.'
  [ ! -d "$STAGE/$bundle" ] || fail "충돌: 파일 이동 전에 대상이 생겼습니다: $SKILLS/$bundle"
  MOVED+=("$bundle")
done
SUCCESS=1
ready
