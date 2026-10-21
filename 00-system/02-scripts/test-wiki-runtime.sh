#!/bin/bash
set -eu
SOURCE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
TEST_DIR=$(mktemp -d /private/tmp/wiki-runtime-test.XXXXXX)
trap 'rm -rf "$TEST_DIR"' EXIT HUP INT TERM
REAL_BASH=$(command -v bash)
REAL_MKDIR=$(command -v mkdir)
REAL_CAT=$(command -v cat)
REAL_CHMOD=$(command -v chmod)
REAL_TAR=$(command -v tar)
PASS=0
FAIL=0
new_fixture() {
  CASE_DIR="$TEST_DIR/$1"
  ROOT="$CASE_DIR/work space"
  MOCK="$CASE_DIR/bin"
  "$REAL_MKDIR" -p "$ROOT/00-system/02-scripts" "$MOCK"
  cp "$SOURCE_DIR/ensure-wiki-runtime.sh" "$SOURCE_DIR/node-runtime-manifest.txt" "$ROOT/00-system/02-scripts/"
  for cmd in dirname pwd awk sed tr mkdir mktemp rm rmdir mv chmod cat; do
    path=$(command -v "$cmd" || true)
    [ -z "$path" ] || ln -s "$path" "$MOCK/$cmd"
  done
  cat > "$MOCK/uname" <<'EOF'
#!/bin/sh
case "$1" in -s) echo "${MOCK_OS:-Darwin}" ;; -m) echo "${MOCK_ARCH:-arm64}" ;; esac
EOF
  cat > "$MOCK/curl" <<'EOF'
#!/bin/sh
printf '%s\n' "$*" >> "$CALLS"
[ "${MOCK_CURL_FAIL:-0}" = 0 ] || exit 7
out=
while [ "$#" -gt 0 ]; do
  case "$1" in --output|-o) shift; out=$1 ;; esac
  shift
done
printf 'mock archive' > "$out"
EOF
  cat > "$MOCK/shasum" <<'EOF'
#!/bin/sh
if [ "${MOCK_BAD_HASH:-0}" = 1 ]; then
  printf '%064d  archive\n' 0
else
  echo '89c682593d76cd44233fa53b1563264e7de9cbb189cad169135c5b4fadfbc0a7  archive'
fi
EOF
  cat > "$MOCK/tar" <<'EOF'
#!/bin/sh
if [ "$1" = '-tzf' ]; then
  printf 'node-v24.22.1-darwin-arm64/\nnode-v24.22.1-darwin-arm64/bin/node\n'
  exit
fi
while [ "$#" -gt 0 ]; do
  case "$1" in -C) shift; dest=$1 ;; esac
  shift
done
mkdir -p "$dest/node-v24.22.1-darwin-arm64/bin"
cat > "$dest/node-v24.22.1-darwin-arm64/bin/node" <<'NODE'
#!/bin/sh
echo "${MOCK_INSTALLED_VERSION:-v24.22.1}"
NODE
chmod +x "$dest/node-v24.22.1-darwin-arm64/bin/node"
EOF
  chmod +x "$MOCK/uname" "$MOCK/curl" "$MOCK/shasum" "$MOCK/tar"
  CALLS="$CASE_DIR/downloads"
  export CALLS
  unset MOCK_OS MOCK_ARCH MOCK_CURL_FAIL MOCK_BAD_HASH MOCK_INSTALLED_VERSION MOCK_TAR_FAIL MOCK_BAD_ENTRY
}
node_fixture() {
  printf '#!/bin/sh\necho "%s"\n' "$1" > "$MOCK/node"
  chmod +x "$MOCK/node"
}
run_bootstrap() {
  OUT="$CASE_DIR/stdout"
  ERR="$CASE_DIR/stderr"
  STATUS=0
  PATH="$MOCK" "$REAL_BASH" "$ROOT/00-system/02-scripts/ensure-wiki-runtime.sh" "$@" > "$OUT" 2> "$ERR" || STATUS=$?
}
ok() { PASS=$((PASS + 1)); printf 'PASS %s\n' "$1"; }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL %s\n' "$1"; cat "$ERR"; }
assert() { name=$1; shift; if "$@"; then ok "$name"; else bad "$name"; fi; }
equals() { [ "$1" = "$2" ]; }

new_fixture modern
node_fixture v26.1.0
run_bootstrap
assert 'PATH Node >=22 is reused without downloads or writes' test "$STATUS" = 0
assert 'stdout contains one absolute executable path' equals "$(cat "$OUT")" "$MOCK/node"
assert 'modern runtime does not create cache' test ! -e "$ROOT/.workshop-runtime"

new_fixture old
node_fixture v20.20.0
run_bootstrap
assert 'old PATH Node triggers portable install in a spaced path' test "$STATUS" = 0
assert 'installed executable is absolute and workspace-local' equals "$(cat "$OUT")" "$ROOT/.workshop-runtime/node-v24.22.1-darwin-arm64/bin/node"
assert 'download uses official HTTPS URL' test -s "$CALLS"
assert 'download enforces HTTPS and TLS verification' "$REAL_BASH" -c 'text=$(cat "$1"); [[ "$text" == *"--proto =https"* && "$text" == *"--proto-redir =https"* && "$text" == *"--tlsv1.2"* && "$text" != *"--insecure"* && "$text" == *"https://nodejs.org/dist/v24.22.1/"* ]]' _ "$CALLS"
before=$(cat "$CALLS")
run_bootstrap
assert 'cached portable runtime is reused without another download' equals "$(cat "$CALLS")" "$before"

new_fixture absent
run_bootstrap
assert 'Node is not required to bootstrap' test "$STATUS" = 0

new_fixture check_only
run_bootstrap --check
assert 'check-only unavailable runtime exits nonzero' test "$STATUS" != 0
assert 'check-only does not create runtime directory' test ! -e "$ROOT/.workshop-runtime"
assert 'check-only does not download' test ! -e "$CALLS"

new_fixture bad_hash
export MOCK_BAD_HASH=1
run_bootstrap
assert 'checksum mismatch fails' test "$STATUS" != 0
assert 'checksum mismatch preserves no target install' test ! -e "$ROOT/.workshop-runtime/node-v24.22.1-darwin-arm64"
assert 'checksum mismatch cleans only temporary installation directory' "$REAL_BASH" -c 'shopt -s nullglob; files=("$1"/.node-install.*); [ "${#files[@]}" = 0 ]' _ "$ROOT/.workshop-runtime"

new_fixture offline
export MOCK_CURL_FAIL=1
run_bootstrap
assert 'download failure exits nonzero' test "$STATUS" != 0
assert 'download failure does not publish runtime' test ! -e "$ROOT/.workshop-runtime/node-v24.22.1-darwin-arm64"

new_fixture unsupported
export MOCK_ARCH=s390x
run_bootstrap
assert 'unsupported architecture fails before download' test "$STATUS" != 0
assert 'unsupported architecture does not download' test ! -e "$CALLS"

new_fixture collision
mkdir -p "$ROOT/.workshop-runtime/node-v24.22.1-darwin-arm64"
printf 'keep' > "$ROOT/.workshop-runtime/node-v24.22.1-darwin-arm64/existing"
run_bootstrap
assert 'damaged existing runtime is preserved and reported' test "$STATUS" != 0
assert 'existing runtime collision keeps original file' equals "$(cat "$ROOT/.workshop-runtime/node-v24.22.1-darwin-arm64/existing")" keep
assert 'existing runtime collision does not download' test ! -e "$CALLS"

new_fixture cache_symlink
mkdir "$CASE_DIR/outside"
ln -s "$CASE_DIR/outside" "$ROOT/.workshop-runtime"
run_bootstrap
assert 'symlink runtime root is rejected' test "$STATUS" != 0
assert 'symlink runtime root does not write outside workspace' test ! -e "$CASE_DIR/outside/node-v24.22.1-darwin-arm64"

new_fixture target_symlink
mkdir -p "$ROOT/.workshop-runtime" "$CASE_DIR/outside"
ln -s "$CASE_DIR/outside" "$ROOT/.workshop-runtime/node-v24.22.1-darwin-arm64"
run_bootstrap
assert 'symlink target is rejected' test "$STATUS" != 0

new_fixture root_symlink
ln -s "$ROOT" "$CASE_DIR/work-link"
ROOT="$CASE_DIR/work-link"
run_bootstrap
assert 'symlink workspace root is rejected' test "$STATUS" != 0

new_fixture wrong_version
export MOCK_INSTALLED_VERSION=v20.0.0
run_bootstrap
assert 'extracted Node version is checked before publishing' test "$STATUS" != 0
assert 'wrong-version archive does not publish runtime' test ! -e "$ROOT/.workshop-runtime/node-v24.22.1-darwin-arm64"

new_fixture cached_check
run_bootstrap
before=$(cat "$CALLS")
run_bootstrap --check
assert 'check-only accepts a valid cached runtime' test "$STATUS" = 0
assert 'cached check-only does not download' equals "$(cat "$CALLS")" "$before"

new_fixture cache_file
printf 'keep' > "$ROOT/.workshop-runtime"
run_bootstrap
assert 'runtime cache file is rejected without overwrite' test "$STATUS" != 0
assert 'runtime cache file keeps original contents' equals "$(cat "$ROOT/.workshop-runtime")" keep

new_fixture binary_symlink
mkdir -p "$ROOT/.workshop-runtime/node-v24.22.1-darwin-arm64/bin"
printf '#!/bin/sh\nprintf executed > "%s"\necho v24.22.1\n' "$CASE_DIR/unsafe-execution" > "$CASE_DIR/external-node"
chmod +x "$CASE_DIR/external-node"
ln -s "$CASE_DIR/external-node" "$ROOT/.workshop-runtime/node-v24.22.1-darwin-arm64/bin/node"
run_bootstrap
assert 'cached executable symlink is rejected before execution' test "$STATUS" != 0
assert 'cached executable symlink target was not executed' test ! -e "$CASE_DIR/unsafe-execution"

new_fixture unsupported_os
export MOCK_OS=FreeBSD
run_bootstrap
assert 'unsupported OS is rejected before writes or downloads' test "$STATUS" != 0
assert 'unsupported OS does not create cache' test ! -e "$ROOT/.workshop-runtime"

new_fixture corrupt_check
mkdir -p "$ROOT/.workshop-runtime/node-v24.22.1-darwin-arm64"
printf keep > "$ROOT/.workshop-runtime/node-v24.22.1-darwin-arm64/existing"
run_bootstrap --check
assert 'check-only does not repair or replace a corrupt cache' test "$STATUS" != 0
assert 'check-only corrupt cache preserves original file' equals "$(cat "$ROOT/.workshop-runtime/node-v24.22.1-darwin-arm64/existing")" keep
assert 'check-only corrupt cache does not download' test ! -e "$CALLS"

new_fixture manifest_version
sed 's/version v24.22.1/version v24.0.0/' "$ROOT/00-system/02-scripts/node-runtime-manifest.txt" > "$CASE_DIR/wrong-manifest"
mv "$CASE_DIR/wrong-manifest" "$ROOT/00-system/02-scripts/node-runtime-manifest.txt"
run_bootstrap
assert 'manifest version mismatch fails before download' test "$STATUS" != 0
assert 'manifest version mismatch does not create cache' test ! -e "$ROOT/.workshop-runtime"

new_fixture preserve_other_cache
mkdir "$ROOT/.workshop-runtime"
printf 'other runtime' > "$ROOT/.workshop-runtime/other-version"
export MOCK_BAD_HASH=1
run_bootstrap
assert 'failed install keeps unrelated cached files' equals "$(cat "$ROOT/.workshop-runtime/other-version")" 'other runtime'

new_fixture unknown_argument
run_bootstrap --install-system
assert 'unknown flags fail without modifying workspace' test "$STATUS" = 2
assert 'unknown flags create no cache' test ! -e "$ROOT/.workshop-runtime"

# PowerShell cannot be executed without pwsh. Keep portable safety requirements explicit.
PS_SCRIPT="$SOURCE_DIR/ensure-wiki-runtime.ps1"
assert 'PowerShell 5.1 reads Korean helper as UTF-8 through BOM' "$REAL_BASH" -c '[[ "$(od -An -N3 -tx1 "$1" | tr -d " \n")" == efbbbf ]]' _ "$PS_SCRIPT"
assert 'PowerShell bootstrap pins HTTPS official host and SHA256' "$REAL_BASH" -c 'text=$(cat "$1"); [[ "$text" == *"https://nodejs.org/dist/"* && "$text" == *"Get-FileHash -LiteralPath"* && "$text" == *"-Algorithm SHA256"* && "$text" == *"-MaximumRedirection 0"* ]]' _ "$PS_SCRIPT"
assert 'PowerShell bootstrap rejects reparse points and uses no-overwrite move' "$REAL_BASH" -c 'text=$(cat "$1"); [[ "$text" == *"[IO.FileAttributes]::ReparsePoint"* && "$text" == *"[IO.Directory]::Move("* && "$text" == *"[IO.FileMode]::CreateNew"* ]]' _ "$PS_SCRIPT"
if command -v pwsh >/dev/null 2>&1; then
  pwsh -NoProfile -NonInteractive -Command '[void][System.Management.Automation.Language.Parser]::ParseFile($args[0], [ref]$null, [ref]$null)' "$PS_SCRIPT"
else
  printf 'SKIP PowerShell runtime and parser (pwsh is not installed)\n'
fi

printf '\n%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" = 0 ]
