# VisualLoop

> **Tagline:** See it. Circle it. Fix it.  
> **Status:** Production-Ready Desktop Utility (Live Previews, True DOM Capture & Gemini Closed-Loop Feedback)  
> **License:** MIT

VisualLoop is an open-source, local-first visual feedback companion for AI coding agents. When an agent creates or modifies a visual artifact (SVG or HTML snippet), VisualLoop displays it in a clean, floating desktop overlay. The user can expand the window, circle or highlight specific areas, add notes, and submit feedback directly back to the agent session.

---

## Architecture Overview

```
                      +-----------------------------+
                      |       AI Coding Agent       |
                      |  (Gemini CLI, Supported)    |
                      +--------------+--------------+
                                     |
                        Adapter Bridge (Port 4178)
                                     |
                      +--------------v--------------+
                      |   VisualLoop Core Server    |
                      |   - Atomic File Store       |
                      |   - Feedback Queue & Ack    |
                      |   - Authenticated WebSocket |
                      +--------------+--------------+
                                     |
                      +--------------v--------------+
                      |   Tauri 2 Desktop Shell     |
                      |   - Mini Floating Overlay   |
                      |   - Monochrome Design System|
                      |   - Live Artifact Renderer  |
                      |   - Normalized Coordinates  |
                      +-----------------------------+
```

### Core Features

- **Tauri 2 Native Desktop Shell:**
  - Minimal monochrome design system (`#F5F5F5` background, `#FFFFFF` panels, `#171717` typography, functional red `#E14C45` annotations).
  - Mini overlay mode (~360 x 220 px, floating, always-on-top, click-through toggle with keyboard lock release).
  - Expanded annotation workspace (1024 x 768 px, resizable, draggable titlebar).
  - Global hotkey support (`Cmd+Shift+V` / `Ctrl+Shift+V`).
- **Live Preview Engine:**
  - Live SVG & sandboxed HTML rendering (no mock or hardcoded solar-system fallback).
  - Path traversal security, strict origin validation, and DOMPurify SVG sanitization.
  - Empty state with clear guidance when awaiting agent artifacts.
- **Truthful Annotation & Feedback Pipeline:**
  - Native SVG capture directly from rendered canvas — no 1x1 dummy images.
  - Drawing tools: Circle, Rectangle, Arrow, Freehand drawing.
  - Normalized coordinates `[0, 1]` relative to artifact canvas.
  - Stale revision notifications when an agent updates while user is reviewing.
- **Agent Closed Loop:**
  - **Gemini CLI:** Fully supported (`watchFeedback`, `getLatestFeedback`, `acknowledgeFeedback`, actionable prompt generation).
  - **Claude Code & Codex:** Experimental stubs (transparently signal unsupported capabilities instead of returning fake delivered receipts).

---

## Directory Structure

```text
visualloop/
├── apps/
│   └── desktop/                 # Tauri 2 + React + Vite + Tailwind CSS
│       ├── src/
│       │   ├── components/      # MiniOverlay, ExpandedEditor, WindowControls, ArtifactViewer
│       │   ├── hooks/           # useWindowState
│       │   ├── services/        # tauriBridge, coreClient, eventClient
│       │   ├── state/           # useVisualLoopStore
│       │   └── styles/          # globals.css (monochrome design tokens)
│       └── src-tauri/           # Rust Tauri 2 shell (lib.rs, main.rs, tauri.conf.json)
├── packages/
│   ├── protocol/                # Zod schemas, types, coordinate normalization
│   ├── core-server/             # Fastify, WebSocket, atomic file persistence, feedback queue
│   ├── preview-engine/          # Safe path validation, SVG/HTML sanitization, rasterization
│   ├── annotation-engine/       # Canvas geometry, undo/redo, dual screenshot capture
│   └── agent-sdk/               # AgentAdapter interface & error types
├── adapters/
│   ├── gemini-cli/              # Gemini CLI adapter (Supported)
│   ├── claude-code/             # Claude Code adapter (Experimental)
│   └── codex/                   # Codex adapter (Experimental)
├── skills/
│   └── visualloop/SKILL.md      # Agent integration skill definition
├── examples/
│   ├── solar-system.svg         # Sample SVG artifact
│   └── animated-card/           # Sample HTML/CSS artifact
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
pnpm install
pnpm build
```

### Running the Application

#### Option A: One-Command Full Desktop Stack (Recommended)
```bash
# Starts VisualLoop Core Server on port 4178 and launches the Tauri Desktop window
pnpm start
```

#### Option B: Live Gemini AI Companion Runner
```bash
# Set your Gemini API key for real automated code edits
export GEMINI_API_KEY="your-google-gemini-api-key"

# Launches the Gemini companion agent to watch an artifact and apply circled revisions
pnpm agent:gemini examples/solar-system.svg
```

#### Option C: Web Simulation Mode (Instant, No Rust Compilation)
```bash
pnpm dev:web
```
Opens Vite at `http://localhost:5173`. Simulates both the mini floating window and the expanded annotation editor in-browser.

#### Option D: Standalone Desktop Window
```bash
export PATH="$HOME/.cargo/bin:$PATH"
pnpm dev
```

---

## Verified Golden Path E2E Demo

Run the automated closed-loop smoke test:

```bash
pnpm demo
# or
pnpm demo:golden-path
```

This script:
1. Spawns Core Server on an ephemeral port.
2. Registers a Gemini CLI session.
3. Publishes Revision 1 of an SVG artifact.
4. Simulates user feedback (annotation + general direction).
5. Agent receives feedback, acknowledges receipt, and edits the source file on disk.
6. Publishes Revision 2 and asserts different content hashes and revision progression.

---

## Automated Test Suite

Run the Vitest test suite covering protocol validation, path security, HTML sanitization, coordinate normalization, store snapshots, and closed-loop feedback:

```bash
pnpm test
```
