#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
NODE_EXECUTABLE="$("$BASH" "$SCRIPT_DIR/ensure-wiki-runtime.sh")"
PATH="$(dirname "$NODE_EXECUTABLE")${PATH:+:$PATH}"
export PATH
exec "$NODE_EXECUTABLE" "$ROOT/00-system/wiki-app/server.mjs" "$@"
