---
name: visualloop
description: Reusable agent skill for registering visual artifacts, listening for human annotations, and updating revisions in VisualLoop.
category: "07 - Exploration & Tooling"
tags:
  - agent-skill
  - feedback-loop
  - visual-feedback
  - visualloop
---

# VisualLoop Agent Integration Skill

## Overview
VisualLoop is a local-first visual feedback companion for AI coding agents. When you create or modify an SVG, HTML, or UI artifact:
1. Register your active session with VisualLoop core server at `http://127.0.0.1:4178/v1/sessions`.
2. Publish your previewable artifact at `http://127.0.0.1:4178/v1/artifacts`.
3. VisualLoop automatically launches a floating overlay on the user's screen.
4. The user inspects, expands, marks up annotations (circles, rectangles, arrows, notes), and submits structured feedback.
5. Consume the feedback JSON and apply corrections to generate the next revision.

## Endpoints

### 1. Register Session
`POST http://127.0.0.1:4178/v1/sessions`
```json
{
  "adapterId": "gemini-cli",
  "agentName": "Gemini CLI",
  "workspaceRoot": "/path/to/project"
}
```

### 2. Publish Artifact
`POST http://127.0.0.1:4178/v1/artifacts`
```json
{
  "sessionId": "session_id",
  "artifactId": "art_solar_system",
  "revision": 1,
  "kind": "svg",
  "entrypoint": "examples/solar-system.svg"
}
```

### 3. Consume Feedback
Listen to WebSocket event `feedback.submitted` or poll `GET http://127.0.0.1:4178/v1/feedback/latest?sessionId=...`
The payload contains normalized coordinates `[0, 1]` relative to the artifact canvas, specific user instructions, and marked-up screenshot references.
