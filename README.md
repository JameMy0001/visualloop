<div align="center">

<img src="docs/assets/logo.svg" width="96" height="96" alt="VisualLoop Logo" />
<br /><br />

# VisualLoop

### See it. Circle it. Fix it.

**A local-first visual feedback layer for AI-generated interfaces.**

Review a UI in a floating preview, mark the exact region that needs work, and send structured, revision-aware feedback to an AI coding workflow.

[![VisualLoop CI](https://github.com/JameMy0001/visualloop/actions/workflows/ci.yml/badge.svg)](https://github.com/JameMy0001/visualloop/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/License-MIT-171717.svg)](LICENSE)
[![Developer Preview](https://img.shields.io/badge/Status-Developer%20Preview-737373.svg)](#project-maturity)

[Overview](#overview) · [Demo](#demo) · [Agent Skill & Setup](#agent-skill-and-setup) · [Tech stack](#technology-stack) · [Architecture](#system-architecture) · [Getting started](#getting-started) · [Contributing](#contributing)

</div>

---

## Overview

When an AI coding agent produces a visual interface, reviewing the result often means taking screenshots, switching windows, and trying to explain exactly which element needs changing. The feedback is easy to lose, especially across multiple revisions.

**VisualLoop makes visual review a first-class part of the agent workflow.** It provides a compact desktop companion where a reviewer can inspect an SVG or HTML artifact, draw an annotation on the relevant area, add an instruction, and submit feedback tied to the artifact and revision.

VisualLoop is **not another code-generation model**. It is a local visual review and feedback layer for AI-generated work. For SVG and HTML files, a configured provider-backed processor or an optional external runner can apply code revisions. Agent Skill scripts can open artifacts for review, but do not automatically inject messages into every existing AI chat session.

### Who is it for?

- **AI-assisted developers** who want to review generated interfaces without describing every visual issue in prose.
- **Designers and reviewers** who want to communicate location-specific changes to an engineering or agent workflow.
- **Open-source contributors and tooling teams** exploring human-in-the-loop feedback, local-first developer utilities, and agent integrations.

### The idea in one example

Instead of vaguely asking an AI to “fix this page,” circle the unreadable hero headline, overlapping cards, and misplaced button, then attach a correction to each region. VisualLoop links these annotations to the exact artifact and revision so the AI workflow knows what to change.

## Demo

<div align="center">
  <img src="docs/assets/visualloop-app-capture.gif" alt="VisualLoop running web UI: live SVG preview, three real mouse-drawn annotations, feedback submission to local core, and verified revision 2" width="800" />
  <br />
  <a href="docs/assets/visualloop-app-capture.gif">Watch the VisualLoop app workflow capture</a>
  <br />
  <sub>Captured from the running VisualLoop browser UI and Core Server on commit 95a41ac. Mouse annotations, submitted feedback, source-file replacement, and revision publication use the actual application; the AI response is supplied by a deterministic local OpenAI-compatible test provider, not a live external model. This is not a native Tauri screen recording.</sub>
</div>

This capture begins in the **running VisualLoop web editor**: a flawed SVG draft is published into its actual Preview, three regions are circled using real mouse events, a correction note is entered, and **Send feedback** submits to the real Core Server. A local deterministic test provider returns a revised SVG; VisualLoop applies the source change and displays **Revision 2**. It does **not** show the initial AI generation prompt, a native Tauri window, or a live external-model response. For a fully native AI-run recording, see the [recording checklist](docs/DEMO_RECORDING.md).

## Why this approach?

| Typical AI UI review | With VisualLoop |
| --- | --- |
| “The thing near the top-right looks wrong.” | Annotate the exact region on the current preview. |
| Feedback lives in screenshots and chat messages. | Feedback is represented as structured annotations and instructions. |
| It is unclear which version a comment applies to. | Feedback references a session, artifact, and revision. |
| Reviewing means switching to a separate browser or image viewer. | A Tauri desktop companion offers mini and expanded views. |
| Integrations are tightly coupled to one UI. | A local server and adapter contracts separate review from model execution. |

## Technology stack

The icons below represent tools **actually referenced by the current source and dependency manifests**. They link to the corresponding official documentation.

<div align="center">

**Languages & web standards**

<p align="center">
  <a href="https://www.typescriptlang.org/" title="TypeScript"><img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/typescript/typescript-original.svg" alt="TypeScript logo" width="42" height="42" /></a>
  &nbsp;&nbsp; <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript" title="JavaScript"><img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/javascript/javascript-original.svg" alt="JavaScript logo" width="42" height="42" /></a>
  &nbsp;&nbsp; <a href="https://www.rust-lang.org/" title="Rust"><img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/rust/rust-original.svg" alt="Rust logo" width="42" height="42" /></a>
  &nbsp;&nbsp; <a href="https://developer.mozilla.org/en-US/docs/Web/HTML" title="HTML5"><img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/html5/html5-original.svg" alt="HTML5 logo" width="42" height="42" /></a>
  &nbsp;&nbsp; <a href="https://developer.mozilla.org/en-US/docs/Web/CSS" title="CSS3"><img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/css3/css3-original.svg" alt="CSS3 logo" width="42" height="42" /></a>
</p>

<sub>TypeScript · JavaScript · Rust · HTML5 · CSS3</sub>

<br /><br />

**Desktop, frontend & backend**

<p align="center">
  <a href="https://react.dev/" title="React"><img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/react/react-original.svg" alt="React logo" width="42" height="42" /></a>
  &nbsp;&nbsp; <a href="https://tauri.app/" title="Tauri"><img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/tauri/tauri-original.svg" alt="Tauri logo" width="42" height="42" /></a>
  &nbsp;&nbsp; <a href="https://tailwindcss.com/" title="Tailwind CSS"><img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/tailwindcss/tailwindcss-original.svg" alt="Tailwind CSS logo" width="42" height="42" /></a>
  &nbsp;&nbsp; <a href="https://vite.dev/" title="Vite"><img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/vitejs/vitejs-original.svg" alt="Vite logo" width="42" height="42" /></a>
  &nbsp;&nbsp; <a href="https://nodejs.org/" title="Node.js"><img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/nodejs/nodejs-original.svg" alt="Node.js logo" width="42" height="42" /></a>
  &nbsp;&nbsp; <a href="https://fastify.dev/" title="Fastify"><img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/fastify/fastify-original.svg" alt="Fastify logo" width="42" height="42" /></a>
</p>

<sub>React · Tauri · Tailwind CSS · Vite · Node.js · Fastify</sub>

<br /><br />

**Development & continuous integration**

<p align="center">
  <a href="https://pnpm.io/" title="pnpm"><img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/pnpm/pnpm-original.svg" alt="pnpm logo" width="42" height="42" /></a>
  &nbsp;&nbsp; <a href="https://vitest.dev/" title="Vitest"><img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/vitest/vitest-original.svg" alt="Vitest logo" width="42" height="42" /></a>
  &nbsp;&nbsp; <a href="https://docs.github.com/en/actions" title="GitHub Actions"><img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/githubactions/githubactions-original.svg" alt="GitHub Actions logo" width="42" height="42" /></a>
</p>

<sub>pnpm · Vitest · GitHub Actions</sub>

</div>

### Where each technology fits

| Layer | Main technologies | Responsibility |
| :--- | :--- | :--- |
| **Native desktop** | Rust, Tauri 2 | Window lifecycle, native commands, desktop shell |
| **Review interface** | TypeScript, React, HTML/CSS, Tailwind CSS, Vite | Floating preview, annotations, editor interactions |
| **Local API & events** | Node.js, TypeScript, Fastify, WebSocket (`ws`), Zod | Sessions, artifact revisions, validated requests, feedback transport |
| **Shared packages** | TypeScript | Protocol types, annotation geometry, preview utilities, agent contracts |
| **Agent integration** | TypeScript; Gemini, OpenAI, Anthropic and compatible API transports | Use configured providers or a polling runner to revise supported SVG/HTML source |
| **Build & quality** | pnpm, Vitest, Cargo, GitHub Actions | Monorepo dependencies, automated tests, Rust checks, CI |

> **Integration boundary:** Gemini is an external API used by the optional runner, not a bundled local model. Claude Code and Codex are adapter scaffolds rather than finished integrations.

---

## Extensible AI provider adapters

VisualLoop supports provider configuration through the desktop Settings panel and API transports for `gemini`, `openai`, `anthropic`, and `openai-compatible` endpoints. The built-in Core Server revision path and optional external runner can use configured model services. **Provider support in code is not proof that every service and model has passed a live end-to-end test.**

```bash
# Example: use your own OpenAI API credentials
export VISUALLOOP_AI_PROVIDER=openai
export VISUALLOOP_AI_MODEL=YOUR_MODEL_ID
export OPENAI_API_KEY="your-api-key"
pnpm agent:ai examples/solar-system.svg
```

The `ModelProvider` plugin interface is open for contributors to implement other services, subject to the service's API format and access requirements. See [Provider adapter guide](docs/PROVIDER_ADAPTERS.md).

## System architecture

VisualLoop is a **local-first TypeScript monorepo with a Tauri 2 desktop shell**. The desktop UI, annotation engine, preview utilities, local API, agent skill, and optional revision processors have distinct responsibilities.

The architecture below shows how the VisualLoop Skill, desktop review UI, local Core Server, workspace files, and optional AI revision processors connect. Agents must invoke the skill or its scripts; Claude Code and Codex direct-session adapters are still experimental.

```mermaid
flowchart TB
    subgraph LOCAL["Local machine"]
        subgraph AGENTS["Agent and workspace"]
            AGENT["AI coding agent<br/>Generates visual artifact"]
            SKILL["VisualLoop Skill scripts<br/>setup / open / wait_feedback"]
            FILES[("Workspace files<br/>SVG, HTML and previewable assets")]
        end

        subgraph DESKTOP["Visual review"]
            UI["Tauri 2 + React<br/>Mini Preview / Expanded Editor / Settings"]
            ANNO["Annotation engine<br/>Marked regions and capture"]
            DEV["Vite browser UI<br/>Development only"]
        end

        subgraph SERVICES["Local services"]
            CORE["Core Server<br/>Fastify REST + WebSocket"]
            PREVIEW["Preview engine<br/>Load / sanitize / render data"]
            INTERNAL["Core AI revision processor<br/>SVG / HTML source edits"]
            RUNNER["Optional external AI runner<br/>Poll feedback / publish revision"]
            CONFIG[("Local provider settings<br/>Provider, model and API key")]
            TOKEN[("Local auth token")]
        end

        AGENT -->|"Write artifact"| FILES
        AGENT -->|"Invoke scripts"| SKILL
        SKILL -->|"Select artifact"| CORE
        SKILL -->|"Activate app"| UI
        SKILL -.->|"Optional feedback polling"| CORE
        UI --> ANNO
        UI <-->|"Authenticated REST / WebSocket"| CORE
        DEV -.->|"Development access"| CORE
        CORE --> PREVIEW
        PREVIEW --> FILES
        CORE --> INTERNAL
        INTERNAL -->|"Validate, back up and write"| FILES
        RUNNER <-->|"Poll / publish / acknowledge"| CORE
        RUNNER <-->|"Read and update files"| FILES
        CONFIG -.-> CORE
        TOKEN -.-> CORE
        TOKEN -.-> UI
        TOKEN -.-> RUNNER
    end

    PROVIDERS["External model services<br/>Gemini / OpenAI / Anthropic<br/>OpenAI-compatible endpoints"]
    INTERNAL -->|"Configured API call"| PROVIDERS
    RUNNER -.->|"Optional provider call"| PROVIDERS
```

**Architecture boundaries:** The agent creates the first artifact and can use `skills/visualloop/scripts/open.sh` to open it. The desktop app handles preview, annotations, and feedback composition; the Core Server owns sessions, feedback transport, revisions, and a built-in model-driven **SVG/HTML** editing path. A separate runner can also consume feedback. Previewable image files are not equivalent to directly AI-editable image source files. Provider configuration is selectable in the app, but direct integration into an existing third-party agent chat is not implied.

## Current capabilities

| Area | Implemented today | Important boundary |
| --- | --- | --- |
| Desktop review | Tauri 2 + React UI with compact and expanded modes, desktop window controls, and preview state | Native interaction still needs hands-on release qualification. |
| Visual annotations | Markup shapes, instructions, viewport-aware normalized geometry | Coordinate fidelity should be evaluated against real preview content. |
| Artifacts | Local SVG and HTML artifact loading/preview | Headless capture does not fully reproduce arbitrary browser-rendered content. |
| Feedback and events | Fastify API, feedback queue, session/revision records, WebSocket updates | Requires the local core service. |
| AI source revisions | Core Server or an optional runner can request provider-backed SVG/HTML revisions, validate the output, and republish a new revision | Needs usable provider configuration; no guarantee that every model request succeeds or that a running agent chat receives feedback directly. |
| File safeguards | Workspace checks, validation for generated SVG structure, staged replacement, versioned backups | Validation is not a complete XML/HTML security or semantic correctness guarantee. |
| Other agent adapters | Agent SDK contracts and Claude Code/Codex scaffolding | Automated Claude Code/Codex revision integration is not complete. |
| Releases | CI and a cross-platform draft-release workflow are configured | No verified publicly distributed installer or stable release yet. |

## Agent Skill and setup

VisualLoop includes a repository **Agent Skill** (`skills/visualloop/`) and helper scripts for supported AI coding agents. An agent must be configured to load and invoke the skill; simply cloning the repository does not ensure automatic discovery in every tool.

### 1. Agent-assisted setup (macOS scripts)
After cloning the repository, ask a compatible coding agent to help with setup, or run the command yourself:

> *"Set up VisualLoop and make it ready to use"*
>
> หรือสั่งเป็นภาษาไทย: *"ช่วยเซ็ตอัพ VisualLoop ให้พร้อมใช้งานที"*

If your agent can access the repository skill, it can use the setup script:
```bash
bash skills/visualloop/scripts/setup.sh
```

**What the current macOS-oriented setup script attempts:**
- Locate the project and build the Core Server if necessary.
- Start the local Core Server on `http://127.0.0.1:4178` when it is not already running.
- Find or build the macOS VisualLoop desktop app, using the system or user Applications folder when possible.
- Check for an existing local auth token. API credentials and model configuration may require separate setup.

The script requires the relevant development dependencies to be installed and may fail on unsupported systems. For a reproducible source build, use [Getting started](#getting-started).

### 2. Autonomous Visual Generation & Circling Workflow
Whenever you instruct an AI assistant to create or modify visual artifacts:
> *"Design a cloud architecture diagram in SVG"* or *"Generate a sleek telemetry dashboard in HTML"*

When a configured coding agent invokes the VisualLoop Skill, the workflow is:
1. **Writes the file to disk** (e.g., `dashboard.html` or `diagram.svg`).
2. **Pops up VisualLoop on your screen** with one command:
   ```bash
   bash skills/visualloop/scripts/open.sh "<path-to-file>"
   ```
3. The selected artifact is loaded into VisualLoop's Preview.
4. Circle the areas requiring adjustment, add instructions, and select **Send feedback**.
5. With a valid provider configuration, VisualLoop can request an updated **SVG or HTML** source file, validate and back up the prior version, then display a published revision. The animated progress HUD is a UI indication, **not a live measurement of model processing stages**. External runner workflows are optional and must be configured separately.

---

## Getting started

**This is a source-build developer preview**, not a polished one-click installation.

### Prerequisites

- **Node.js 22** and **pnpm 12.3.4** (the version declared by the workspace).
- **Rust stable / Cargo** and the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your operating system when using the native desktop app.
- Git.
- **Optional:** a supported AI provider API key (or compatible local endpoint) for model-generated source revisions.

### 1. Clone and build

```bash
git clone https://github.com/JameMy0001/visualloop.git
cd visualloop
pnpm install
pnpm build
```

### 2. Start VisualLoop

```bash
pnpm start
```

The unified launcher starts the local core server (default: `http://127.0.0.1:4178`) and the Tauri desktop development app. It configures a local authentication token for the cooperating processes.

For browser-only development without a native Tauri window:

```bash
pnpm start --web
```

To run individual development services instead:

```bash
# Terminal A: core server
pnpm --filter @visualloop/core-server start

# Terminal B: Tauri desktop development window
pnpm dev
```

### 3. Try a local artifact with Gemini (optional)

In a separate terminal, from the repository root:

```bash
# Set the key in your own shell or secrets manager; do not commit it
export GEMINI_API_KEY="your-api-key"

# Start an agent runner against the included example SVG
pnpm agent:gemini examples/solar-system.svg
```

Open the VisualLoop desktop UI, review the published artifact, annotate it, and submit feedback. With the key configured, the runner requests an updated source file from the Gemini API and publishes the next revision after applying its file-safety checks.

Without `GEMINI_API_KEY`, the runner can format feedback for review, but **does not automatically edit the file**; feedback is kept pending. Model use can incur charges and sends relevant source/feedback content to Google's service.

> **Important:** The runner can change the target source file. Use Git, review the generated diff, and work on a disposable example or a branch until you are comfortable with the workflow.

## Technical details

### Repository map

```text
apps/desktop/               Tauri 2 + React review interface
  src/                      Mini preview, expanded editor, UI state and clients
  src-tauri/                Rust window commands and native configuration

packages/core-server/       Fastify API, WebSocket events, session/revision store
packages/preview-engine/    Artifact loader, SVG sanitization, capture helpers
packages/annotation-engine/ Annotation operations and coordinate mapping
packages/protocol/          Shared request/event schemas and TypeScript types
packages/agent-sdk/         Agent adapter interfaces

adapters/gemini-cli/        Gemini API-backed adapter and revision safeguards
adapters/claude-code/       Adapter scaffold
adapters/codex/             Adapter scaffold

skills/visualloop/          Autonomous Agent Skill package and automation scripts
scripts/                    Launcher, Gemini runner, demonstrations, E2E checks
examples/                   Example artifacts
docs/                       Release-readiness notes and demonstration assets
.github/workflows/          CI and draft-release automation
```

### Protocol and revision model

- A **session** associates an agent/runner with a workspace.
- An **artifact** identifies a reviewable SVG or HTML source.
- A **revision** identifies the specific published version being reviewed.
- A **feedback item** includes instructions and normalized annotation bounds associated with that session, artifact, and revision.
- The **core server** records and broadcasts feedback and can process supported SVG/HTML revisions with a configured AI provider; alternatively, an external runner can poll for feedback and publish revisions.

The desktop UI is independent of any one model provider.

### Local security and data flow

- The core server binds to loopback by default and requires a local token by default for protected API/WebSocket access. Tokens are stored in `~/.visualloop/auth_token`; do not share or commit them.
- The origin-checking and preview-sanitization layers reduce exposure to untrusted artifacts. HTML is previewed in a sandboxed iframe; this is a security boundary to test, not a guarantee that arbitrary untrusted content is harmless.
- The Gemini runner includes workspace path checks, SVG structure checks, backups, and staged file replacement. Keep your own version control as an additional recovery mechanism.
- Local preview and feedback transport run on your machine. **When Gemini is enabled, source code, feedback, and optionally an annotated image may leave your machine** through the API request.

See [SECURITY.md](SECURITY.md) for the security model and vulnerability reporting instructions.

## Verification and testing

The CI workflow runs on **macOS and Ubuntu** and includes workspace builds, automated tests, TypeScript checks, Rust `cargo check`, a scripted feedback loop, the Gemini pipeline script, and a core-server CLI smoke test.

```bash
pnpm test                 # Unit and integration suites
pnpm typecheck            # Build and TypeScript type checks
pnpm demo:golden-path     # Scripted local feedback/revision plumbing test
pnpm test:gemini-e2e      # Pipeline test (offline fallback if no Gemini key)
cd apps/desktop/src-tauri && cargo check
```

**What passing CI means—and what it does not:**

- The [CI workflow](https://github.com/JameMy0001/visualloop/actions/workflows/ci.yml) has passed on both supported CI runners for the recent source commits.
- `pnpm test:gemini-e2e` **uses a simulated model response when `GEMINI_API_KEY` is absent**. A green CI step is not proof of a live Google Gemini API call.
- Scripted pipeline tests do **not** replace hands-on native desktop E2E, pixel comparisons against real browser rendering, or clean installation of packaged binaries.
- The [release workflow](.github/workflows/release.yml) defines draft/prerelease build automation; successful, installable distributions must be verified separately.

For tracked qualification details, see [Release readiness](docs/RELEASE_READINESS.md) and the [Changelog](CHANGELOG.md).

## Project maturity

**Developer Preview — v0.1.0 source tree.**

The architecture, local service, UI, annotation flow, Gemini runner, and automated verification are available for exploration and contribution. VisualLoop should **not** yet be represented as production-ready, a fully validated public beta, or a universally compatible desktop application.

Known work before a broad public-beta release includes:

1. **Native desktop E2E:** verify real user interaction, window behavior, review submission, and revision refresh on target platforms.
2. **Capture fidelity:** the headless SVG rasterizer implements a subset of SVG elements/commands; complex SVG, text styling, and browser-rendered HTML are not guaranteed pixel-faithful. Headless HTML capture requires a browser/WebView context.
3. **Live model evidence:** validate real Gemini API requests and nontrivial revisions with credentials provided securely, distinct from the offline simulation used by CI.
4. **Distribution:** produce, install, and smoke-test desktop packages per platform, with any required signing/notarization.
5. **Hardening:** continue negative security tests and review of generated source before file replacement.

**Platform notes:** macOS and Ubuntu are covered by source-build CI. The release configuration targets macOS (Intel/Apple Silicon), Linux (x86_64), and Windows (x86_64), but an OS appearing in the release matrix is **not** a claim that installers have shipped or been verified there.

## Contributing

VisualLoop is open source and welcomes bug reports, reproducible tests, documentation improvements, design feedback, and focused pull requests.

Start with [CONTRIBUTING.md](CONTRIBUTING.md), browse the [issues](https://github.com/JameMy0001/visualloop/issues), and include steps to reproduce plus platform/environment details when reporting a bug.

Useful areas for contributions include capture fidelity, native desktop behavior, accessibility, deeper agent adapters, security regression tests, and release packaging. Please disclose vulnerabilities privately using the instructions in [SECURITY.md](SECURITY.md).

## License

[MIT License](LICENSE). You can inspect, reuse, and contribute to the source under the terms of that license.

---

<div align="center">
  <sub>VisualLoop — make feedback about AI-generated interfaces visual, specific, and actionable.</sub>
</div>
