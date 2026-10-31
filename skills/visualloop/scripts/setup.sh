#!/bin/bash
set -e

PORT=4178
SERVER_URL="http://127.0.0.1:${PORT}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 1. Dynamically resolve project repository root
if [ -n "$VISUALLOOP_DIR" ] && [ -d "$VISUALLOOP_DIR" ]; then
  PROJECT_ROOT="$VISUALLOOP_DIR"
elif [ -f "${SCRIPT_DIR}/../../pnpm-workspace.yaml" ]; then
  PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
elif [ -f "$HOME/.visualloop/repo_root" ] && [ -d "$(cat "$HOME/.visualloop/repo_root")" ]; then
  PROJECT_ROOT="$(cat "$HOME/.visualloop/repo_root")"
elif [ -f "$(pwd)/pnpm-workspace.yaml" ]; then
  PROJECT_ROOT="$(pwd)"
else
  PROJECT_ROOT="$(pwd)"
fi

mkdir -p "$HOME/.visualloop"
echo "$PROJECT_ROOT" > "$HOME/.visualloop/repo_root"

echo "[VisualLoop] Project root resolved: ${PROJECT_ROOT}"
echo "[VisualLoop] Checking system dependencies..."

# 2. Ensure daemon binary wrapper exists in ~/.local/bin
mkdir -p "$HOME/.local/bin"
cat << WRAPPER > "$HOME/.local/bin/visualloop-server"
#!/bin/bash
exec node "${PROJECT_ROOT}/packages/core-server/dist/cli.js" "\$@"
WRAPPER
chmod +x "$HOME/.local/bin/visualloop-server"

# Ensure core-server build exists
if [ ! -f "${PROJECT_ROOT}/packages/core-server/dist/cli.js" ]; then
  echo "[VisualLoop] Building core-server dist..."
  (cd "${PROJECT_ROOT}" && pnpm --filter @visualloop/core-server build)
fi

# 3. Check if core-server is running on port 4178
if curl -s "${SERVER_URL}/v1/health" > /dev/null 2>&1; then
  echo "[VisualLoop] Core Server is currently running on ${SERVER_URL} [OK]"
else
  echo "[VisualLoop] Starting Core Server in background..."
  nohup "$HOME/.local/bin/visualloop-server" > "$HOME/.visualloop/server.log" 2>&1 &
  sleep 1
  if curl -s "${SERVER_URL}/v1/health" > /dev/null 2>&1; then
    echo "[VisualLoop] Core Server started successfully on ${SERVER_URL} [OK]"
  else
    echo "[VisualLoop] Warning: Core Server did not respond immediately, check ~/.visualloop/server.log"
  fi
fi

# 4. Check or install VisualLoop desktop application
APP_PATH=""
if [ -d "/Applications/VisualLoop.app" ]; then
  APP_PATH="/Applications/VisualLoop.app"
elif [ -d "$HOME/Applications/VisualLoop.app" ]; then
  APP_PATH="$HOME/Applications/VisualLoop.app"
elif [ -d "${PROJECT_ROOT}/apps/desktop/src-tauri/target/release/bundle/macos/visualloop.app" ]; then
  APP_PATH="${PROJECT_ROOT}/apps/desktop/src-tauri/target/release/bundle/macos/visualloop.app"
fi

if [ -n "$APP_PATH" ]; then
  echo "[VisualLoop] Desktop App verified: ${APP_PATH} [OK]"
else
  echo "[VisualLoop] Building VisualLoop desktop app from source..."
  (cd "${PROJECT_ROOT}" && pnpm --filter @visualloop/desktop exec tauri build --bundles app)

  BUILT_APP="${PROJECT_ROOT}/apps/desktop/src-tauri/target/release/bundle/macos/visualloop.app"
  if [ -d "$BUILT_APP" ]; then
    # Try system /Applications, fallback to user ~/Applications, fallback to build dir
    if cp -R "$BUILT_APP" /Applications/VisualLoop.app 2>/dev/null; then
      APP_PATH="/Applications/VisualLoop.app"
      xattr -cr "$APP_PATH" 2>/dev/null || true
    elif mkdir -p "$HOME/Applications" && cp -R "$BUILT_APP" "$HOME/Applications/VisualLoop.app" 2>/dev/null; then
      APP_PATH="$HOME/Applications/VisualLoop.app"
      xattr -cr "$APP_PATH" 2>/dev/null || true
    else
      APP_PATH="$BUILT_APP"
    fi
    echo "[VisualLoop] Installed Desktop App: ${APP_PATH} [OK]"
  fi
fi

if [ -n "$APP_PATH" ]; then
  echo "$APP_PATH" > "$HOME/.visualloop/app_path"
fi

# 5. Auth token verification
AUTH_TOKEN=$(cat "$HOME/.visualloop/auth_token" 2>/dev/null || echo "")
if [ -n "$AUTH_TOKEN" ]; then
  echo "[VisualLoop] Auth Token verified [OK]"
fi

echo "{\"status\":\"ready\",\"serverUrl\":\"${SERVER_URL}\",\"app\":\"${APP_PATH}\",\"projectRoot\":\"${PROJECT_ROOT}\"}"
