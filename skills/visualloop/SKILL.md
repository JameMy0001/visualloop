---
name: visualloop
description: Auto-launches the VisualLoop desktop app whenever generating or modifying visual artifacts (SVG, HTML UI, diagrams, slides, mockups, images). Allows users to visually circle regions on screen and submit corrections directly back to the AI for surgical code revisions. Use whenever creating or editing visual artifacts or when visual review is requested.
category: "07 - Exploration & Tooling"
tags:
  - visual-feedback
  - agent-skill
  - circling-editor
  - automated-review
---

# VisualLoop Autonomous Agent Skill

VisualLoop provides a live visual bridge between AI coding agents and human developers. Whenever an AI agent generates or modifies an image, SVG graphic, HTML presentation, UI dashboard, or slide deck, VisualLoop automatically pops up on the user's screen with the rendered artifact. The user can circle any specific element, type corrections, and click "Send feedback" for surgical revisions.

---

## 1. Automated Setup & Self-Healing

Any AI agent can initialize and verify VisualLoop in 1 command:

```bash
bash ~/.gemini/config/skills/visualloop/scripts/setup.sh
```

This script automatically:
- Checks if the Core Server is running on `http://127.0.0.1:4178`. If stopped, launches the daemon.
- Ensures `/Applications/VisualLoop.app` is installed.
- Validates local auth tokens (`~/.visualloop/auth_token`) and AI provider keys.
- Returns JSON status: `{"status": "ready", "serverUrl": "http://127.0.0.1:4178", "app": "/Applications/VisualLoop.app"}`.

---

## 2. Autonomous Trigger Protocol (When AI Generates Visuals)

When the user asks you to create or modify an SVG, HTML dashboard, UI presentation, mockup, slide deck, or image:

### Step 1: Write the Artifact to Disk
Save the code (e.g. `slides.html` or `architecture.svg`) in the workspace.

### Step 2: Open Immediately in VisualLoop
Run the companion script:
```bash
bash ~/.gemini/config/skills/visualloop/scripts/open.sh "<path-to-file>"
```
VisualLoop will immediately bring up the file on the user's screen in expanded mode.

### Step 3: Inform the User & Wait for Feedback
Inform the user:
```
I have generated `<filename>` and opened it in VisualLoop on your screen.
You can circle any element you want modified, and click Send Feedback.
```

If you wish to wait for the user's markup within the same turn:
```bash
bash ~/.gemini/config/skills/visualloop/scripts/wait_feedback.sh 120
```
This returns the exact coordinates, target element, and user instructions in structured JSON.

### Step 4: Apply Surgical Revisions
Modify the file according to the annotations, increment the revision, and re-run:
```bash
bash ~/.gemini/config/skills/visualloop/scripts/open.sh "<path-to-file>"
```

---

## 3. Direct HTTP API Endpoints

| Endpoint | Method | Purpose |
|---|:---:|---|
| `/v1/workspace/select-asset` | `POST` | Activates any file in VisualLoop: `{"entrypoint": "<path>"}` |
| `/v1/workspace/assets` | `GET` | Lists all visual assets in current workspace |
| `/v1/feedback/latest` | `GET` | Retrieves the latest feedback submitted by user |
| `/v1/health` | `GET` | Health status and connected clients count |

Authentication Header:
```bash
Authorization: Bearer $(cat ~/.visualloop/auth_token)
```

---

## 4. Multi-Model Provider Configuration

VisualLoop stores provider keys securely in `~/.visualloop/provider_config.json`:
- Google Gemini: `gemini-3.8-flash`, `gemini-3.1-pro-preview`, `gemini-2.5-pro`
- OpenAI: `gpt-4o`, `o3-mini`, `o1`
- Anthropic: `claude-3-7-sonnet`, `claude-3-5-sonnet`
- Local / Open Models: `deepseek-r1`, `qwen2.5-coder` via Ollama / vLLM
