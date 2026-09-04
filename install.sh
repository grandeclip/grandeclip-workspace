#!/usr/bin/env bash
# grandeclip 워크스페이스 설치 (macOS · Linux)
#
#   bash install.sh              대화형 (권장)
#   bash install.sh --yes        확인 없이 전부 진행
#   bash install.sh --check      아무것도 설치하지 않고 현재 상태만 진단
#
# 여러 번 실행해도 안전합니다. 이미 설치된 항목은 건너뜁니다.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_LIST="$SCRIPT_DIR/00-system/02-scripts/plugins.txt"
ASSUME_YES=0
CHECK_ONLY=0

for arg in "$@"; do
  case "$arg" in
    --yes|-y)   ASSUME_YES=1 ;;
    --check)    CHECK_ONLY=1 ;;
    --help|-h)  sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "알 수 없는 옵션: $arg (--help 로 사용법 확인)"; exit 2 ;;
  esac
done

# ── 출력 도우미 ──────────────────────────────────────────────
say()  { printf '%s\n' "$*"; }
step() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  ✅ %s\n' "$*"; }
warn() { printf '  ⚠️  %s\n' "$*"; }
bad()  { printf '  ❌ %s\n' "$*"; }

# 사용자에게 묻기. 비대화형(파이프 실행)이면 진행으로 간주한다.
confirm() { # $1 = 질문
  [ "$ASSUME_YES" = "1" ] && return 0
  [ -t 0 ] || return 0
  local reply
  printf '%s [Y/n] ' "$1"
  read -r reply
  case "$reply" in [nN]*) return 1 ;; *) return 0 ;; esac
}

# claude 를 찾는다. 방금 설치한 경우 PATH 에 아직 없을 수 있으므로 기본 위치도 본다.
find_claude() {
  command -v claude >/dev/null 2>&1 && return 0
  if [ -x "$HOME/.local/bin/claude" ]; then
    export PATH="$HOME/.local/bin:$PATH"
    return 0
  fi
  return 1
}

say ""
say "  grandeclip 워크스페이스 설치를 시작합니다."
say "  ─────────────────────────────────────────"

# ── 1단계: 시스템 준비 확인 ──────────────────────────────────
# 스킬 저장소를 내려받으려면 git 이 필요하다. 새 맥에는 git 이 없고,
# git 을 그냥 호출하면 macOS 가 개발자도구 설치 창을 띄운다.
# 그래서 팝업을 유발하지 않는 xcode-select -p 로 먼저 확인한다.
step "1/4  시스템 준비 확인"

need_dev_tools=0
if [ "$(uname)" = "Darwin" ]; then
  xcode-select -p >/dev/null 2>&1 || need_dev_tools=1
else
  command -v git >/dev/null 2>&1 || need_dev_tools=1
fi

if [ "$need_dev_tools" = "1" ]; then
  if [ "$(uname)" = "Darwin" ]; then
    warn "먼저 Apple 개발자도구를 설치해야 합니다."
    say ""
    say "     스킬을 내려받는 데 쓰이는 git 이 아직 없습니다."
    say "     새 맥에서는 정상이며, 한 번만 설치하면 됩니다."
    say ""
    if [ "$CHECK_ONLY" = "1" ]; then
      say "     설치하려면: xcode-select --install"
      exit 1
    fi
    if confirm "  설치 창을 열까요?"; then
      xcode-select --install >/dev/null 2>&1 || true
      say ""
      say "  ─────────────────────────────────────────"
      say "  설치 창이 떴습니다."
      say "  [설치] 를 누르고 끝날 때까지 기다려 주세요. (몇 분 걸립니다)"
      say ""
      say "  끝나면 이 명령을 다시 실행해 주세요:"
      say ""
      say "      bash install.sh"
      say "  ─────────────────────────────────────────"
      say ""
      exit 1
    else
      say ""
      say "  설치를 건너뛰었습니다. 개발자도구 없이는 스킬을 받을 수 없습니다."
      say "  나중에 터미널에서 xcode-select --install 을 실행한 뒤 다시 시도해 주세요."
      exit 1
    fi
  else
    bad "git 이 필요합니다. 패키지 관리자로 먼저 설치해 주세요."
    say "     예: sudo apt install git   또는   sudo dnf install git"
    exit 1
  fi
fi

ok "준비 완료"

# ── 2단계: Claude Code 설치 확인 ─────────────────────────────
step "2/4  Claude Code 확인"

if find_claude; then
  ok "이미 설치되어 있습니다 ($(claude --version 2>/dev/null | head -1))"
elif [ "$CHECK_ONLY" = "1" ]; then
  bad "Claude Code 가 설치되어 있지 않습니다."
  say ""
  say "  설치하려면: bash install.sh"
  exit 1
else
  say "  Claude Code 가 아직 없습니다."
  say "  Anthropic 공식 설치 스크립트를 내려받아 실행합니다:"
  say "    https://claude.ai/install.sh"
  if ! confirm "  설치할까요?"; then
    say ""
    say "  설치를 건너뛰었습니다. Claude Code 없이는 진행할 수 없습니다."
    exit 1
  fi
  say ""
  if ! curl -fsSL https://claude.ai/install.sh | bash; then
    bad "설치에 실패했습니다. 네트워크 연결을 확인한 뒤 다시 실행해 주세요."
    exit 1
  fi
  if find_claude; then
    ok "설치 완료 ($(claude --version 2>/dev/null | head -1))"
  else
    bad "설치는 끝났지만 claude 명령을 찾지 못했습니다."
    say "     새 터미널을 열고 install.sh 를 다시 실행해 주세요."
    exit 1
  fi
fi

# ── 목록 읽기 ────────────────────────────────────────────────
if [ ! -f "$PLUGIN_LIST" ]; then
  bad "설치 목록을 찾을 수 없습니다: $PLUGIN_LIST"
  say "     워크스페이스 폴더가 통째로 복사되었는지 확인해 주세요."
  exit 1
fi

MARKETS=""   # 개행 구분 (bash 3.2 호환 — 배열 대신 문자열 누적)
PLUGINS=""
while IFS= read -r line || [ -n "$line" ]; do
  line="${line%%#*}"                       # 주석 제거
  line="$(printf '%s' "$line" | tr -d '\r' | awk '{$1=$1;print}')"  # CRLF·여백 정리
  [ -z "$line" ] && continue
  kind="${line%% *}"
  value="${line#* }"
  case "$kind" in
    marketplace) MARKETS="$MARKETS$value"$'\n' ;;
    plugin)      PLUGINS="$PLUGINS$value"$'\n' ;;
  esac
done < "$PLUGIN_LIST"

# ── 3단계: 마켓플레이스 + 플러그인 설치 ──────────────────────
if [ "$CHECK_ONLY" = "1" ]; then
  step "3/4  설치 (진단 모드이므로 건너뜀)"
else
  step "3/4  스킬 설치"
  say "  잠시 걸립니다. 네트워크 연결이 필요합니다."
  say ""

  while IFS= read -r repo; do
    [ -z "$repo" ] && continue
    # 이미 등록된 마켓은 오류를 낼 수 있다. 여기서는 무시하고 3단계에서 실제 상태로 판정한다.
    claude plugin marketplace add "$repo" --scope user >/dev/null 2>&1
    say "  · 저장소 등록: $repo"
  done <<< "$MARKETS"

  say ""
  while IFS= read -r id; do
    [ -z "$id" ] && continue
    claude plugin install "$id" --scope user --yes >/dev/null 2>&1
    say "  · 설치 시도: ${id%%@*}"
  done <<< "$PLUGINS"
fi

# ── 4단계: 검증 (명령의 성공 여부가 아니라 실제 상태를 본다) ──
step "4/4  설치 확인"

INSTALLED_JSON="$(claude plugin list --json 2>/dev/null)"
if [ -z "$INSTALLED_JSON" ]; then
  bad "설치 목록을 읽지 못했습니다. Claude Code 가 정상인지 확인해 주세요."
  exit 1
fi

missing=""
found_n=0
miss_n=0
while IFS= read -r id; do
  [ -z "$id" ] && continue
  if printf '%s' "$INSTALLED_JSON" | grep -qF "\"id\": \"$id\""; then
    found_n=$((found_n + 1))
  else
    miss_n=$((miss_n + 1))
    missing="$missing  - $id"$'\n'
  fi
done <<< "$PLUGINS"

say ""
if [ "$miss_n" -eq 0 ]; then
  ok "스킬 $found_n 개가 모두 설치되었습니다."
  say ""
  say "  ─────────────────────────────────────────"
  say "  아직 Claude Code 를 열지 않았다면:"
  say ""
  say "    1. 이 폴더에서 claude 를 실행하세요"
  say "    2. /setup-workspace 를 입력하세요"
  say ""
  say "  claude 명령을 못 찾으면 새 터미널을 열어 주세요."
  say ""
  exit 0
else
  warn "설치됨 $found_n 개 · 누락 $miss_n 개"
  say ""
  say "  설치되지 않은 항목:"
  printf '%s' "$missing"
  say ""
  say "  대부분 네트워크 문제입니다. 아래를 순서대로 시도해 보세요."
  say ""
  say "    1) bash install.sh   를 한 번 더 실행"
  say "    2) 그래도 남으면 아래 내용을 그대로 #gc-ai-라운지 에 올려주세요"
  say ""
  exit 1
fi
