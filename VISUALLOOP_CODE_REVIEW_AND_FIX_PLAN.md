# VisualLoop — Code Review & Remediation Architecture Plan

**Document Version:** 1.0.0  
**Target Date:** October 30, 2026  
**Audience:** Core Engineering Team, Agent Systems, CI/CD Maintainers  
**Repository:** [JameMy0001/visualloop](https://github.com/JameMy0001/visualloop)  
**Branch:** `main`

---

## 1. Executive Summary & Review Synthesis

An in-depth architectural and source code audit was conducted on the VisualLoop codebase. The project demonstrates strong foundational modularity (pnpm monorepo with 4 core packages, 3 agent adapters, a Tauri 2 desktop app, and automated Vitest suites). However, the system currently functions as an interactive prototype rather than a closed-loop MVP.

### The Golden Path to Prove

The primary goal of VisualLoop is:
```
User commands Agent (e.g., Gemini CLI) 
  → Agent publishes artifact to Local Core Server
    → VisualLoop desktop window receives event & displays Mini Preview
      → User expands window (Cmd+Shift+V) & circles area to fix
        → User clicks Submit
          → Feedback delivered to Core Server & picked up by Agent
            → Agent modifies source code in the same session
              → Core Server broadcasts updated revision
                → VisualLoop preview reloads automatically
```

Until this exact loop functions end-to-end without manual copy-pasting of JSON, VisualLoop cannot be considered an MVP.

---

## 2. Codebase Defect & Gap Matrix

| Severity | Issue | Impacted Files | Impact & Risk |
| :--- | :--- | :--- | :--- |
| **P0** | **CI Typecheck Failure** | `.github/workflows/ci.yml`<br>`package.json` | Monorepo packages lack `dist/` before `tsc --noEmit`, failing CI on fresh clones. |
| **P0** | **Feedback Submit Disconnected** | `apps/desktop/src/App.tsx`<br>`apps/desktop/src/components/ExpandedEditor.tsx` | Feedback was only stored in `localStorage` without calling `POST /v1/feedback`. |
| **P0** | **Blank Screenshot Mock** | `packages/preview-engine/src/screenshotWorker.ts`<br>`apps/desktop/src/components/ExpandedEditor.tsx` | Base screenshot was a synthetic 1x1 PNG or empty dark rect (`#070B14`), blinding the Agent. |
| **P0** | **Local API & WebSocket Security** | `packages/core-server/src/server.ts`<br>`packages/core-server/src/websocket.ts` | Weak substring origin checks (`origin.includes("localhost")`) and unauthenticated WebSockets allowed remote CSRF. |
| **P0** | **Regex SVG Sanitization** | `packages/preview-engine/src/sanitizer.ts` | Regex sanitization could be bypassed via XML CDATA, namespaces (`<svg:script>`), or entity encoding. |
| **P1** | **Hardcoded Demos in UI** | `apps/desktop/src/components/DemoArtifactViewer.tsx`<br>`apps/desktop/src/components/MiniOverlay.tsx` | UI is bound to static Solar System SVG instead of live artifacts streamed from Agent sessions. |
| **P1** | **Core Server Lifecycle Missing** | `apps/desktop/src/main.tsx`<br>`apps/desktop/src-tauri/src/lib.rs` | Desktop app does not automatically start or ensure Core Server daemon is active. |
| **P1** | **Agent Feedback Auto-Correction** | `adapters/gemini-cli/src/index.ts` | Adapter wrote `visualloop-feedback.json` but lacked active polling/injection into active agent session. |
| **P1** | **Stub Adapters for Claude & Codex** | `adapters/claude-code/src/index.ts`<br>`adapters/codex/src/index.ts` | Return mock receipts without actual tool or session integration. |
| **P1** | **In-Memory Volatile Store** | `packages/core-server/src/store.ts` | Sessions and feedback are lost if Core Server restarts. |
| **P2** | **Packaging & Multi-platform Installers** | `apps/desktop/src-tauri/tauri.conf.json` | Missing verified CI build pipeline for `.dmg`, `.msi`, `.deb`. |

---

## 3. Four-Milestone Remediation Roadmap

```
+-------------------------------------------------------------------------+
| Milestone A: Stable Foundation & Hardened Security                      |
| [x] Fix CI build order & TypeScript project references                  |
| [x] Secure WebSocket Origin and token authentication                   |
| [x] Hardened SVG Sanitizer with XML/namespace/attribute defenses        |
| [ ] Embedded Core Server daemon lifecycle management                    |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
| Milestone B: Real Live Preview & Screenshot Capture Pipeline            |
| [ ] Desktop WebSocket Event Client (`/v1/ws`) for live artifact stream   |
| [ ] Dynamic Artifact Viewer replacing hardcoded static demos             |
| [ ] Real DOM/SVG rasterization in DualCaptureEngine                     |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
| Milestone C: Closed-Loop Agent Feedback Pipeline                        |
| [x] Desktop Submit invokes `POST /v1/feedback`                          |
| [ ] Gemini CLI active feedback watcher & automated file patcher          |
| [ ] Feedback delivery receipt & acknowledgement loop (`/v1/feedback/ack`)|
| [ ] Persistent SQLite / JSON file storage for Core Server Store         |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
| Milestone D: Multi-Agent Adapters & Production Packaging                |
| [ ] Claude Code Adapter implementation via ACP / MCP                    |
| [ ] Codex Adapter implementation via file & prompt hooks                |
| [ ] Multi-Platform Release packaging via GitHub Actions                 |
+-------------------------------------------------------------------------+
```

---

## 4. Milestone Details & Acceptance Criteria

### Milestone A — Stable Foundation & Hardened Security

#### Task A.1: CI Pipeline & Build Order Resolution
- **Files Modified:**
  - `.github/workflows/ci.yml`
  - `package.json`
- **Root Cause:**
  When `tsc --noEmit` runs across workspaces without prior building of `@visualloop/protocol`, dependent packages cannot resolve `./dist/index.d.ts`.
- **Solution:**
  Add `pnpm build` before running tests and `typecheck`. Update `package.json` script `"typecheck": "pnpm build && pnpm -r --stream exec tsc --noEmit"`.
- **Acceptance Criteria:**
  - [x] Clean clone running `pnpm install && pnpm typecheck && pnpm test` exits with code 0.
  - [x] GitHub Actions CI job passes on both Ubuntu and macOS runners.

#### Task A.2: Local Server Authentication & WebSocket Security
- **Files Modified:**
  - `packages/core-server/src/websocket.ts`
  - `packages/core-server/src/server.ts`
- **Solution:**
  1. Replace substring check `origin.includes("localhost")` with strict URL hostname validation (`new URL(origin).hostname === "localhost" || "127.0.0.1"` or `tauri://*`).
  2. If `secretToken` is configured, enforce token validation during WebSocket connection handshake via query parameter `?token=<secretToken>` or `x-visualloop-token` header. Disconnect unauthorized clients with code 1008.
- **Acceptance Criteria:**
  - [x] Requests from `http://attacker-localhost.com` are rejected with HTTP 403 / WS 1008.
  - [x] Legitimate clients from `http://127.0.0.1:*`, `http://localhost:*`, and `tauri://localhost` connect successfully.

#### Task A.3: Safe XML/SVG Sanitization
- **Files Modified:**
  - `packages/preview-engine/src/sanitizer.ts`
- **Solution:**
  Thoroughly strip:
  - XML stylesheets and processing instructions (`<?xml-stylesheet ...?>`)
  - Standard and namespaced script tags (`<svg:script>`, `<a:script>`)
  - Dangerous tags (`foreignObject`, `embed`, `object`, `iframe`, `applet`, `meta`, `link`, `base`)
  - All inline event handlers (`onload`, `onclick`, `onerror`, `onmouseover`, etc.)
  - Pseudo-protocols (`javascript:`, `vbscript:`, `data:text/html`) in `href`, `xlink:href`, and `src` attributes.
- **Acceptance Criteria:**
  - [x] Vitest suite `packages/preview-engine/src/sanitizer.test.ts` passes with 0 failures.

#### Task A.4: Core Server Daemon Lifecycle Integration
- **Files to Modify:**
  - `apps/desktop/src/services/serverLifecycle.ts`
  - `apps/desktop/src/main.tsx`
- **Goal:**
  When the desktop app boots, check if `http://127.0.0.1:4178/v1/health` is responsive. If not, optionally launch the embedded core server or prompt the user with clear connection status.

---

### Milestone B — Real Live Preview & Screenshot Capture Pipeline

#### Task B.1: Desktop WebSocket Client (`/v1/ws`)
- **Files to Create/Modify:**
  - `apps/desktop/src/services/eventClient.ts`
  - `apps/desktop/src/hooks/useArtifactStream.ts`
- **Specifications:**
  - Connect to `ws://127.0.0.1:4178/v1/ws`.
  - Listen for events:
    - `preview.ready`: Updates active artifact ID, revision number, entrypoint, and content.
    - `session.registered`: Sets active session ID and capabilities.
    - `feedback.delivered`: Confirms agent received feedback.
  - Expose current active artifact and revision to React components via Context or Hook.

#### Task B.2: Replace Hardcoded Demos with Dynamic Artifact Store
- **Files to Modify:**
  - `apps/desktop/src/components/MiniOverlay.tsx`
  - `apps/desktop/src/components/ExpandedEditor.tsx`
  - `apps/desktop/src/components/DemoArtifactViewer.tsx` -> `ArtifactViewer.tsx`
- **Specifications:**
  - Render live SVG/HTML from `useArtifactStream`.
  - If no active session exists, display a graceful "Waiting for Agent..." idle screen with quick instructions.

#### Task B.3: Real Dual-Capture Screenshot Engine
- **Files to Modify:**
  - `apps/desktop/src/components/ExpandedEditor.tsx`
  - `packages/annotation-engine/src/capture.ts`
  - `packages/preview-engine/src/screenshotWorker.ts`
- **Specifications:**
  - Extract the actual rendered SVG DOM tree (`svgElement.outerHTML`) or rasterize using `<canvas>` for HTML artifacts.
  - Overlay annotation geometry (circles, arrows, freehand lines) onto the authentic visual representation.
  - Pass the resulting base64 data URLs in `FeedbackSubmission`:
    - `originalScreenshotDataUrl`
    - `annotatedScreenshotDataUrl`

---

### Milestone C — Closed-Loop Agent Feedback Pipeline

#### Task C.1: Direct API Submission from Desktop UI
- **Files Modified:**
  - `apps/desktop/src/App.tsx`
- **Implementation:**
  - When user clicks Submit, POST payload to `http://127.0.0.1:4178/v1/feedback`.
  - Handle success: transition state to `mini_waiting`, auto-collapse window to mini mode.
  - Handle failure: cache in `localStorage` for automatic retry.
- **Acceptance Criteria:**
  - [x] POST `http://127.0.0.1:4178/v1/feedback` returns HTTP 201 with `{ feedbackId, status: "submitted" }`.
  - [x] Server broadcasts `feedback.submitted` event.

#### Task C.2: Gemini CLI Active Feedback Loop
- **Files to Modify:**
  - `adapters/gemini-cli/src/index.ts`
- **Specifications:**
  - Provide a command or hook `visualloop watch`:
    - Subscribes to Core Server WebSocket or polls `/v1/feedback/latest?sessionId=...`.
    - When new feedback arrives, reads `annotatedScreenshotDataUrl`, `annotations`, and `generalInstruction`.
    - Formats prompt:
      ```markdown
      [VisualLoop Feedback #fb_123]
      The user reviewed the generated artifact and provided the following visual corrections:
      1. [circle at (32%, 45%)]: "Increase font size and change color to emerald"
      2. General Instruction: "Make the card responsive on mobile"
      Please update the corresponding source file now.
      ```
    - Automatically injects instruction or updates file, then calls `/v1/feedback/:id/ack`.

#### Task C.3: Persistent State Storage
- **Files to Modify:**
  - `packages/core-server/src/store.ts`
- **Specifications:**
  - Write sessions, artifact revisions, and feedback history to a local JSON file (e.g., `~/.visualloop/state.json`) or SQLite (`better-sqlite3`).
  - Ensures data is retained across server restarts.

---

### Milestone D — Multi-Agent Adapters & Production Packaging

#### Task D.1: Claude Code Adapter
- **Files to Modify:**
  - `adapters/claude-code/src/index.ts`
- **Specifications:**
  - Implement MCP (Model Context Protocol) tool or CLI wrapper for Claude Code so it publishes artifacts to VisualLoop and consumes feedback.

#### Task D.2: Codex CLI Adapter
- **Files to Modify:**
  - `adapters/codex/src/index.ts`
- **Specifications:**
  - Implement Codex agent adapter with file-watching and prompt hook delivery.

#### Task D.3: Production Packaging
- **Files to Modify:**
  - `apps/desktop/src-tauri/tauri.conf.json`
  - `.github/workflows/release.yml`
- **Specifications:**
  - Configure Tauri bundle identifiers, icons, and permissions.
  - Generate signed macOS `.dmg` (Universal / Apple Silicon), Windows `.msi`, and Linux `.AppImage`.

---

## 5. Verification Commands

Run the following commands to verify project health after each milestone:

```bash
# 1. Clean build of all packages in dependency order
pnpm build

# 2. Workspace-wide TypeScript typecheck
pnpm typecheck

# 3. Complete Vitest test suite (10 suites, 39+ tests)
pnpm test

# 4. Native Rust / Tauri check
export PATH="$HOME/.cargo/bin:$PATH"
cd apps/desktop/src-tauri && cargo check
```

---

*This plan represents the authoritative remediation blueprint for VisualLoop.*
