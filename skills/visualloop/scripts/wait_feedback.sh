#!/bin/bash
set -e

TIMEOUT=${1:-120}
SERVER_URL="http://127.0.0.1:4178"
AUTH_TOKEN=$(cat ~/.visualloop/auth_token 2>/dev/null || echo "")

START_TIME=$(date +%s)
PREV_FEEDBACK_COUNT=$(curl -s -H "Authorization: Bearer ${AUTH_TOKEN}" "${SERVER_URL}/v1/store" 2>/dev/null | grep -o '"feedbackId"' | wc -l || echo 0)

while true; do
  NOW=$(date +%s)
  ELAPSED=$((NOW - START_TIME))
  if [ $ELAPSED -ge $TIMEOUT ]; then
    echo "{\"status\":\"timeout\",\"message\":\"No feedback received within ${TIMEOUT} seconds.\"}"
    exit 0
  fi

  CURRENT_COUNT=$(curl -s -H "Authorization: Bearer ${AUTH_TOKEN}" "${SERVER_URL}/v1/store" 2>/dev/null | grep -o '"feedbackId"' | wc -l || echo 0)
  if [ "$CURRENT_COUNT" -gt "$PREV_FEEDBACK_COUNT" ]; then
    # Return latest feedback JSON
    python3 -c "
import json
with open('$HOME/.visualloop/store.json') as f:
    data = json.load(f)
f_list = data.get('feedback', [])
if f_list:
    latest = f_list[-1]
    # Clean out large data urls for terminal readability
    cleaned = {k: v for k, v in latest.items() if not k.endswith('DataUrl')}
    print(json.dumps({'status': 'feedback_received', 'feedback': cleaned}, indent=2))
"
    exit 0
  fi

  sleep 1
done
