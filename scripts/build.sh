#!/usr/bin/env bash
set -eu
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CREATOR_BIN="${CREATOR_BIN:-/Applications/Cocos/Creator/3.8.6/CocosCreator.app/Contents/MacOS/CocosCreator}"
mkdir -p "$PROJECT_DIR/evidence/runtime"
set +e
"$CREATOR_BIN" --project "$PROJECT_DIR" --build "configPath=$PROJECT_DIR/build-config.json" > "$PROJECT_DIR/evidence/runtime/build.log" 2>&1
RESULT=$?
set -e
# Creator 3.x uses 36 for a successful command-line build.
if [[ "$RESULT" != 0 && "$RESULT" != 36 ]]; then
  tail -80 "$PROJECT_DIR/evidence/runtime/build.log"
  exit "$RESULT"
fi
test -f "$PROJECT_DIR/build/web-desktop/index.html"
python3 "$PROJECT_DIR/scripts/prepare-web.py"
echo "Cocos build complete: $PROJECT_DIR/build/web-desktop"
