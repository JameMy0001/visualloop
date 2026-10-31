#!/bin/bash
set -e

TIMEOUT=${1:-120}
SERVER_URL="http://127.0.0.1:4178"
AUTH_TOKEN=$(cat ~/.visualloop/auth_token 2>/dev/null || echo "")

TARGET_SESSION="$2"
if [ -z "$TARGET_SESSION" ]; then
  STATE_RESP=$(curl -s -H "Authorization: Bearer ${AUTH_TOKEN}" "${SERVER_URL}/v1/state" 2>/dev/null || echo "{}")
  TARGET_SESSION=$(echo "$STATE_RESP" | python3 -c "import sys, json; print(json.load(sys.stdin).get('activeSessionId') or '')" 2>/dev/null || echo "")
fi

# Query initial feedbackId if present to detect incoming new submissions
INITIAL_ID=""
if [ -n "$TARGET_SESSION" ]; then
  LATEST_RAW=$(curl -s -H "Authorization: Bearer ${AUTH_TOKEN}" "${SERVER_URL}/v1/feedback/latest?sessionId=${TARGET_SESSION}" 2>/dev/null || echo "{}")
  INITIAL_ID=$(echo "$LATEST_RAW" | python3 -c "import sys, json; print(json.load(sys.stdin).get('feedbackId') or '')" 2>/dev/null || echo "")
fi

START_TIME=$(date +%s)

while true; do
  NOW=$(date +%s)
  ELAPSED=$((NOW - START_TIME))
  if [ $ELAPSED -ge $TIMEOUT ]; then
    echo "{\"status\":\"timeout\",\"message\":\"No feedback received within ${TIMEOUT} seconds.\"}"
    exit 0
  fi

  # Resolve session if it wasn't available at start
  if [ -z "$TARGET_SESSION" ]; then
    STATE_RESP=$(curl -s -H "Authorization: Bearer ${AUTH_TOKEN}" "${SERVER_URL}/v1/state" 2>/dev/null || echo "{}")
    TARGET_SESSION=$(echo "$STATE_RESP" | python3 -c "import sys, json; print(json.load(sys.stdin).get('activeSessionId') or '')" 2>/dev/null || echo "")
  fi

  if [ -n "$TARGET_SESSION" ]; then
    LATEST_RESP=$(curl -s -H "Authorization: Bearer ${AUTH_TOKEN}" "${SERVER_URL}/v1/feedback/latest?sessionId=${TARGET_SESSION}" 2>/dev/null || echo "{}")
    CURRENT_ID=$(echo "$LATEST_RESP" | python3 -c "import sys, json; print(json.load(sys.stdin).get('feedbackId') or '')" 2>/dev/null || echo "")

    if [ -n "$CURRENT_ID" ] && [ "$CURRENT_ID" != "$INITIAL_ID" ]; then
      echo "$LATEST_RESP" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    cleaned = {k: v for k, v in data.items() if not k.endswith('DataUrl')}
    print(json.dumps({'status': 'feedback_received', 'feedback': cleaned}, indent=2))
except Exception as e:
    print(json.dumps({'status': 'feedback_received', 'raw': str(e)}))
"
      exit 0
    fi
  fi

  sleep 1
done
