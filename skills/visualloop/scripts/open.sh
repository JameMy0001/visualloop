#!/bin/bash
set -e

FILE="$1"
if [ -z "$FILE" ]; then
  echo "Usage: open.sh <path-to-file>"
  exit 1
fi

SERVER_URL="http://127.0.0.1:4178"
AUTH_TOKEN=$(cat ~/.visualloop/auth_token 2>/dev/null || echo "")

# Ensure server is running
if ! curl -s "${SERVER_URL}/v1/health" > /dev/null 2>&1; then
  DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  "$DIR/setup.sh" > /dev/null 2>&1
fi

# Resolve absolute path
if [[ "$FILE" = /* ]]; then
  ABS_PATH="$FILE"
else
  ABS_PATH="$(pwd)/$FILE"
fi

if [ ! -f "$ABS_PATH" ]; then
  echo "{\"error\":\"File not found at ${ABS_PATH}\"}"
  exit 1
fi

# Select asset in VisualLoop Core
RES=$(curl -s -X POST "${SERVER_URL}/v1/workspace/select-asset" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"entrypoint\":\"${ABS_PATH}\"}")

# Determine Desktop App path dynamically
APP_PATH=$(cat "$HOME/.visualloop/app_path" 2>/dev/null || echo "")
if [ -z "$APP_PATH" ] || [ ! -e "$APP_PATH" ]; then
  if [ -d "/Applications/VisualLoop.app" ]; then
    APP_PATH="/Applications/VisualLoop.app"
  elif [ -d "$HOME/Applications/VisualLoop.app" ]; then
    APP_PATH="$HOME/Applications/VisualLoop.app"
  fi
fi

# Bring VisualLoop window to the front
if [ -n "$APP_PATH" ]; then
  open "$APP_PATH"
  osascript -e 'tell application "VisualLoop" to activate' > /dev/null 2>&1 || true
fi

echo "{\"status\":\"opened\",\"file\":\"${ABS_PATH}\",\"app\":\"${APP_PATH}\",\"response\":${RES}}"
