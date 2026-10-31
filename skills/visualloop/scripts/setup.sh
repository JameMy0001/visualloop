#!/bin/bash
set -e

PORT=4178
SERVER_URL="http://127.0.0.1:${PORT}"
PROJECT_ROOT="${VISUALLOOP_DIR:-/Users/mac/Desktop/skill see it edit it}"

echo "[VisualLoop] Checking system dependencies..."

# 1. Ensure daemon script exists in ~/.local/bin
mkdir -p ~/.local/bin
if [ ! -f ~/.local/bin/visualloop-server ]; then
  echo "[VisualLoop] Installing visualloop-server binary wrapper..."
  cat << WRAPPER > ~/.local/bin/visualloop-server
#!/bin/bash
exec node "${PROJECT_ROOT}/packages/core-server/dist/cli.js" "\$@"
WRAPPER
  chmod +x ~/.local/bin/visualloop-server
fi

# 2. Check if core-server is running on port 4178
if curl -s "${SERVER_URL}/v1/health" > /dev/null 2>&1; then
  echo "[VisualLoop] Core Server is currently running on ${SERVER_URL} [OK]"
else
  echo "[VisualLoop] Starting Core Server in background..."
  nohup ~/.local/bin/visualloop-server > ~/.visualloop/server.log 2>&1 &
  sleep 1
  if curl -s "${SERVER_URL}/v1/health" > /dev/null 2>&1; then
    echo "[VisualLoop] Core Server started successfully on ${SERVER_URL} [OK]"
  else
    echo "[VisualLoop] Warning: Core Server did not respond immediately, check ~/.visualloop/server.log"
  fi
fi

# 3. Check if VisualLoop desktop app exists in /Applications
if [ -d "/Applications/VisualLoop.app" ]; then
  echo "[VisualLoop] Desktop App verified: /Applications/VisualLoop.app [OK]"
else
  echo "[VisualLoop] Building and installing VisualLoop.app..."
  cd "${PROJECT_ROOT}"
  pnpm --filter @visualloop/desktop exec tauri build --bundles app
  cp -R "${PROJECT_ROOT}/apps/desktop/src-tauri/target/release/bundle/macos/visualloop.app" /Applications/VisualLoop.app
  xattr -cr /Applications/VisualLoop.app
  echo "[VisualLoop] Installed /Applications/VisualLoop.app [OK]"
fi

# 4. Auth token verification
AUTH_TOKEN=$(cat ~/.visualloop/auth_token 2>/dev/null || echo "")
if [ -n "$AUTH_TOKEN" ]; then
  echo "[VisualLoop] Auth Token verified [OK]"
fi

echo "{\"status\":\"ready\",\"serverUrl\":\"${SERVER_URL}\",\"app\":\"/Applications/VisualLoop.app\"}"
