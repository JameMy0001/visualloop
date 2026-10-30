# VisualLoop

> **Tagline:** See it. Circle it. Fix it.  
> **Status:** Phase 1 Complete (Desktop Prototype & Protocol Engine)  
> **License:** MIT

VisualLoop is an open-source, local-first visual feedback companion for AI coding agents. When an agent produces a previewable artifact (such as an SVG, HTML snippet, or UI component), VisualLoop displays it in a transparent, always-on-top desktop overlay. The user can expand the window, circle or highlight specific areas, add structured instructions, and submit the annotated feedback directly to the agent session.

---

## Architecture Overview

```
                      +-----------------------------+
                      |       AI Coding Agent       |
                      |  (Gemini CLI, Claude, etc.) |
                      +--------------+--------------+
                                     |
                       Adapter Bridge (Port 4178)
                                     |
                      +--------------v--------------+
                      |      VisualLoop Core        |
                      |    (Protocol & Schemas)     |
                      +--------------+--------------+
                                     |
                      +--------------v--------------+
                      |   Tauri 2 Desktop Shell     |
                      |   - Mini Floating Overlay   |
                      |   - Expanded React Editor   |
                      |   - Normalized Coordinates  |
                      +-----------------------------+
```

### Phase 1 Capabilities Delivered
- **Monorepo Layout:** Standard pnpm workspace with `@visualloop/protocol`, `@visualloop/desktop`, core server, preview engine, annotation engine, agent SDK, adapters, and demo artifacts.
- **Tauri 2 Native Desktop Shell:**
  - Mini overlay mode (~360 x 240 px, ~80% opacity, always-on-top, transparent backdrop, click-through toggle).
  - Expansion to full annotation workspace (~1024 x 768 px, 100% opacity, click-through disabled).
  - Global hotkey support (`Cmd+Shift+V` / `Ctrl+Shift+V`) and interactive handle for expansion.
  - OS click-through toggling via `set_ignore_cursor_events`.
- **Annotation & Protocol Engine:**
  - Drawing tools: Circle, Rectangle, Arrow, Freehand sketch.
  - Normalized coordinates `[0, 1]` relative to artifact canvas.
  - Full feedback payload conforming to `FeedbackSubmission` schema.
- **Bundled Demo Artifacts:**
  - `examples/solar-system.svg`: Interactive vector illustration with multiple planets.
  - `examples/animated-card/`: Modern HTML/CSS previewable component.
- **Dual Execution Modes:**
  - Native Tauri 2 Desktop mode (`pnpm dev`).
  - Web Simulation mode (`pnpm dev:web`) for instant browser preview and headless CI.

---

## Directory Structure

```text
visualloop/
├── apps/
│   └── desktop/                 # Tauri 2 + React + Vite + Tailwind CSS
│       ├── src/
│       │   ├── components/      # MiniOverlay, ExpandedEditor, WindowControls
│       │   ├── hooks/           # useWindowState
│       │   ├── services/        # tauriBridge
│       │   └── styles/          # globals.css
│       └── src-tauri/           # Rust Tauri 2 shell (lib.rs, main.rs, tauri.conf.json)
├── packages/
│   ├── protocol/                # Zod schemas, types, coordinate normalization
│   ├── core-server/             # Fastify, WebSocket, SQLite persistence (Phase 4)
│   ├── preview-engine/          # Renderers and screenshot worker (Phase 2)
│   ├── annotation-engine/       # Canvas drawing and geometry (Phase 3)
│   └── agent-sdk/               # AgentAdapter interface
├── adapters/
│   ├── gemini-cli/              # Gemini CLI adapter
│   ├── claude-code/             # Claude Code adapter
│   └── codex/                   # Codex adapter
├── skills/
│   └── visualloop/SKILL.md      # Agent integration skill definition
├── examples/
│   ├── solar-system.svg         # Demo SVG artifact
│   └── animated-card/           # Demo HTML/CSS artifact
└── tests/
    └── integration/             # End-to-end integration tests
```

---

## Getting Started

### Prerequisites
- Node.js >= 20 (v22 LTS recommended)
- pnpm >= 9 (`npm install -g pnpm`)
- Rust toolchain (stable, rustc >= 1.77) with Cargo (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)

### Installation

```bash
# Install workspace dependencies
pnpm install
```

### Running the Application

#### Option A: Web Simulation Mode (Instant, No Rust Compilation)
```bash
pnpm dev:web
```
Opens Vite at `http://localhost:5173`. Simulates both the mini floating window and the expanded annotation editor in-browser.

#### Option B: Native Tauri 2 Desktop Shell
```bash
# Ensure Rust is in PATH
export PATH="$HOME/.cargo/bin:$PATH"

# Run Tauri development desktop window
pnpm dev
```

---

## Manual Verification Steps (Phase 1)

1. Launch application via `pnpm dev:web` or `pnpm dev`.
2. Observe the **Mini Overlay**:
   - Window opens at ~360 x 240 px with semi-transparent background (~80% opacity).
   - Bundled SVG demo (Solar System) renders within the preview box.
3. Test **Click-through Toggle**:
   - Click the cursor icon in the title bar to enable click-through.
   - Status badge displays "Click-through Active".
4. Test **Window Expansion**:
   - Hover over the preview and click "Expand & Annotate" OR press `Cmd+Shift+V` (`Ctrl+Shift+V` on Windows/Linux).
   - Window expands to 1024 x 768 px with 100% opacity.
5. Test **Annotation & Feedback Generation**:
   - Select the Circle tool.
   - Click and drag over Saturn or Earth.
   - In the right sidebar, enter instructions (e.g., "Make Saturn rings larger").
   - Click "Submit to Agent Session".
   - A modal displays the validated JSON output containing normalized `[0, 1]` coordinates, matching `@visualloop/protocol`.
6. Return to Mini:
   - Click "Done (Back to Mini)" or press `Escape`.
   - Window restores to mini floating mode and displays status "Waiting Agent".

---

## Automated Test Execution

Run the Vitest test suite covering protocol validation, coordinate normalization, and window state transitions:

```bash
pnpm test
```

---

## Implementation Roadmap

- [x] **Phase 1 — Desktop prototype:** Tauri 2 + React + Vite, mini overlay, expanded editor, hotkeys, demo artifact, protocol package.
- [x] **Phase 2 — Preview renderer:** Safe path validation, SVG XSS sanitization, strict CSP sandbox for HTML/CSS, dual demo switcher.
- [ ] **Phase 3 — Annotation workspace:** Full Konva multi-layer annotation engine, dual screenshot capture (original + marked up).
- [x] **Phase 4 — Core protocol and state:** Fastify localhost API (`127.0.0.1:4178`), WebSocket event bus, session/artifact/revision/feedback store.
- [x] **Phase 5 — Real agent integration:** Gemini CLI adapter implementation, prompt formatting, fallback file writing (`visualloop-feedback.json`).
- [ ] **Phase 6 — OSS release:** Packaging, CI builds, signed installers (macOS, Linux, Windows).
