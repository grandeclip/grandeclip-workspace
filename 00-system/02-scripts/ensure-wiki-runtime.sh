#!/bin/bash
# stdout is a single absolute Node executable path. All notices use stderr.
set -eu
VERSION=v24.22.1
MIN_MAJOR=22
CHECK_ONLY=0
TEMP_DIR=
LOCK_DIR=
case "${1:-}" in
  '') ;;
  --check) CHECK_ONLY=1; shift ;;
  *) printf '사용법: bash ensure-wiki-runtime.sh [--check]\n' >&2; exit 2 ;;
esac
[ "$#" -eq 0 ] || { printf '알 수 없는 인수입니다.\n' >&2; exit 2; }
fail() { printf '위키 Node 준비 실패: %s\n' "$*" >&2; exit 1; }
assert_safe_path() {
  local rest part current
  rest=$1
  case "$rest" in /*) ;; *) fail '절대 경로를 확인할 수 없습니다.' ;; esac
  current=
  rest=${rest#/}
  while [ -n "$rest" ]; do
    case "$rest" in */*) part=${rest%%/*}; rest=${rest#*/} ;; *) part=$rest; rest= ;; esac
    [ -n "$part" ] || continue
    current="$current/$part"
    [ ! -L "$current" ] || fail "심볼릭 링크 경로에는 설치하지 않습니다: $current"
  done
}
node_version() {
  local value
  [ -f "$1" ] && [ -x "$1" ] || return 1
  value=$("$1" --version 2>/dev/null) || return 1
  if [[ "$value" =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    [ "${BASH_REMATCH[1]}" -ge "$MIN_MAJOR" ] || return 1
    printf '%s\n' "$value"
    return 0
  fi
  return 1
}
absolute_executable() {
  local parent name
  parent=$(CDPATH= cd -P -- "$(dirname -- "$1")" && pwd -P) || return 1
  name=${1##*/}
  printf '%s/%s\n' "$parent" "$name"
}
cleanup() {
  # Only paths created by this invocation are removed. Never follow a changed link.
  if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ] && [ ! -L "$TEMP_DIR" ]; then
    rm -rf -- "$TEMP_DIR"
  fi
  if [ -n "$LOCK_DIR" ] && [ -d "$LOCK_DIR" ] && [ ! -L "$LOCK_DIR" ]; then
    rmdir -- "$LOCK_DIR" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

[ ! -L "$0" ] || fail '실행 스크립트가 심볼릭 링크입니다.'
SCRIPT_DIR=$(CDPATH= cd -L -- "$(dirname -- "$0")" && pwd -L) || fail '스크립트 폴더를 찾지 못했습니다.'
ROOT=$(CDPATH= cd -L -- "$SCRIPT_DIR/../.." && pwd -L) || fail '워크스페이스 폴더를 찾지 못했습니다.'
assert_safe_path "$ROOT"
[ -d "$ROOT" ] || fail '워크스페이스 폴더가 없습니다.'

PATH_NODE=$(type -P node 2>/dev/null || true)
if [ -n "$PATH_NODE" ]; then
  PATH_NODE=$(absolute_executable "$PATH_NODE") || PATH_NODE=
  if [ -n "$PATH_NODE" ] && node_version "$PATH_NODE" >/dev/null; then
    printf '%s\n' "$PATH_NODE"
    exit 0
  fi
fi

case "$(uname -s)" in
  Darwin) PLATFORM=darwin ;;
  Linux) PLATFORM=linux ;;
  *) fail '자동 준비는 macOS, Linux와 Windows를 지원합니다. Windows에서는 PowerShell 스크립트를 실행해주세요.' ;;
esac
case "$(uname -m)" in
  arm64|aarch64) ARCH=arm64 ;;
  x86_64|amd64) ARCH=x64 ;;
  *) fail '이 CPU에서는 자동 준비를 지원하지 않습니다. Node.js 22 이상을 직접 설치해주세요.' ;;
esac
BUNDLE="node-$VERSION-$PLATFORM-$ARCH"
ARCHIVE="$BUNDLE.tar.gz"
CACHE="$ROOT/.workshop-runtime"
TARGET="$CACHE/$BUNDLE"
NODE="$TARGET/bin/node"
assert_safe_path "$CACHE"
assert_safe_path "$TARGET"
assert_safe_path "$NODE"
if [ -e "$CACHE" ] && [ ! -d "$CACHE" ]; then fail "동일한 이름의 파일을 보존했습니다: $CACHE"; fi
if [ -e "$TARGET" ]; then
  if [ -d "$TARGET" ] && [ "$(node_version "$NODE" || true)" = "$VERSION" ]; then
    printf '%s\n' "$NODE"
    exit 0
  fi
  fail "기존 런타임을 덮어쓰지 않았습니다. 폴더를 확인해주세요: $TARGET"
fi
if [ "$CHECK_ONLY" -eq 1 ]; then
  fail 'Node.js 22 이상이 아직 준비되지 않았습니다. 초기 설정을 실행하면 워크스페이스 안에 자동으로 준비합니다.'
fi

command -v curl >/dev/null 2>&1 || fail '다운로드에 필요한 curl이 없습니다. Node.js 22 이상을 직접 설치해주세요.'
command -v tar >/dev/null 2>&1 || fail '압축 해제에 필요한 tar가 없습니다.'
if command -v shasum >/dev/null 2>&1; then HASH_TOOL=shasum
elif command -v sha256sum >/dev/null 2>&1; then HASH_TOOL=sha256sum
else fail 'SHA-256 검사 도구(shasum 또는 sha256sum)가 없습니다.'
fi
MANIFEST="$SCRIPT_DIR/node-runtime-manifest.txt"
[ -f "$MANIFEST" ] && [ ! -L "$MANIFEST" ] || fail '고정 버전 체크섬 파일이 없습니다.'
MANIFEST_VERSION=
EXPECTED=
while read -r first second extra; do
  case "$first" in ''|'#'*) continue ;; esac
  if [ "$first" = version ]; then
    [ -z "$MANIFEST_VERSION" ] && [ -z "${extra:-}" ] || fail '체크섬 파일의 버전 형식이 올바르지 않습니다.'
    MANIFEST_VERSION=$second
  elif [ "${second:-}" = "$ARCHIVE" ]; then
    [ -z "$EXPECTED" ] && [ -z "${extra:-}" ] || fail '중복된 체크섬 행이 있습니다.'
    EXPECTED=$first
  fi
done < "$MANIFEST"
[ "$MANIFEST_VERSION" = "$VERSION" ] || fail '런타임 버전과 체크섬 파일의 버전이 다릅니다.'
[[ "$EXPECTED" =~ ^[a-f0-9]{64}$ ]] || fail '이 운영체제의 고정 체크섬이 없습니다.'

assert_safe_path "$CACHE"
if [ ! -d "$CACHE" ]; then mkdir -- "$CACHE" || fail '워크스페이스 런타임 폴더를 만들지 못했습니다.'; fi
assert_safe_path "$CACHE"
LOCK_DIR="$CACHE/.$BUNDLE.lock"
if ! mkdir -- "$LOCK_DIR" 2>/dev/null; then
  LOCK_DIR=
  fail '다른 초기 설정이 실행 중이거나 이전 잠금 폴더가 남아 있습니다. 잠시 후 다시 실행해주세요.'
fi
assert_safe_path "$TARGET"
[ ! -e "$TARGET" ] || fail '다른 초기 설정이 런타임을 준비했습니다. 다시 실행해주세요.'
TEMP_DIR=$(mktemp -d "$CACHE/.node-install.XXXXXX") || fail '임시 폴더를 만들지 못했습니다.'
assert_safe_path "$TEMP_DIR"
printf 'Node.js %s를 워크스페이스에 준비합니다. 첫 실행에는 인터넷 연결이 필요합니다.\n' "$VERSION" >&2
if ! curl --fail --location --silent --show-error --proto '=https' --proto-redir '=https' --tlsv1.2 --connect-timeout 20 --max-time 300 --output "$TEMP_DIR/$ARCHIVE" "https://nodejs.org/dist/$VERSION/$ARCHIVE"; then
  fail 'Node.js를 내려받지 못했습니다. 인터넷 연결을 확인한 뒤 다시 실행해주세요.'
fi
if [ "$HASH_TOOL" = shasum ]; then
  ACTUAL=$(shasum -a 256 "$TEMP_DIR/$ARCHIVE") || fail 'SHA-256 검사에 실패했습니다.'
else
  ACTUAL=$(sha256sum "$TEMP_DIR/$ARCHIVE") || fail 'SHA-256 검사에 실패했습니다.'
fi
ACTUAL=${ACTUAL%% *}
[ "$ACTUAL" = "$EXPECTED" ] || fail '다운로드 파일의 SHA-256이 공식 값과 다릅니다. 설치하지 않았습니다.'
if ! tar -tzf "$TEMP_DIR/$ARCHIVE" > "$TEMP_DIR/entries.txt"; then fail '압축 파일을 읽지 못했습니다.'; fi
while IFS= read -r entry; do
  case "$entry" in "$BUNDLE"|"$BUNDLE/"*) ;; *) fail '압축 파일에 예상하지 않은 경로가 있습니다.' ;; esac
  case "/$entry/" in */../*|*/./*) fail '압축 파일에 안전하지 않은 경로가 있습니다.' ;; esac
done < "$TEMP_DIR/entries.txt"
tar -xzf "$TEMP_DIR/$ARCHIVE" -C "$TEMP_DIR" || fail 'Node.js 압축을 풀지 못했습니다.'
assert_safe_path "$TEMP_DIR/$BUNDLE/bin/node"
[ "$(node_version "$TEMP_DIR/$BUNDLE/bin/node" || true)" = "$VERSION" ] || fail '준비한 Node.js를 실행하지 못했거나 버전이 다릅니다.'
assert_safe_path "$TARGET"
[ ! -e "$TARGET" ] || fail '기존 런타임 폴더를 보존했습니다. 다시 실행해주세요.'
mv -n -- "$TEMP_DIR/$BUNDLE" "$TARGET" || fail '런타임 폴더를 저장하지 못했습니다.'
assert_safe_path "$NODE"
[ "$(node_version "$NODE" || true)" = "$VERSION" ] || fail '저장한 Node.js를 실행하지 못했습니다.'
printf '%s\n' "$NODE"
