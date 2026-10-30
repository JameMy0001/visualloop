# VisualLoop — Release Readiness Review

**Reviewed branch:** `main`  
**Latest evaluated commit:** `85826f9` (with Final Release Gate updates)  
**Review date:** 2026-10-31  
**Project status:** Developer Preview — v0.1.0 (Hardened Build)  
**Result:** Developer Preview is verified, hardened, and ready for public source consumption. **Public Beta release builds are configured via `.github/workflows/release.yml`.**

---

## Executive Summary

Following the comprehensive peer review of commit `85826f9`, VisualLoop executed a focused **Final Release Gate** resolving all identified P0 and P1 gaps:
1. **Default Authentication & Multi-Process Token Sync:** Core Server enforces secret token authentication by default. The Tauri desktop app exposes a native `get_auth_token` command that synchronizes `~/.visualloop/auth_token` directly into `coreClient` and `eventClient`. The unified launcher injects tokens into child environments.
2. **Exact Origin Validation:** Prefix matching has been eliminated. Origins are validated via strict URL parsing checking exact schemes, hostnames, and ports (`tauri://localhost`, `http://tauri.localhost`, `localhost`, `127.0.0.1`, `[::1]`).
3. **Full-Fidelity SVG Capture:** Added geometric rasterizers for `<text>` (via a built-in 5x7 bitmap font engine), `<line>`, `<path>` (`M`, `L`, `H`, `V`, `Z` command segments), and `<ellipse>`, accompanied by pixel assertions.
4. **Canonical Workspace Validation & XML Well-Formedness:** File safety now verifies canonical paths using `path.relative` on `fs.realpathSync` to block symlinks and sibling folder collisions. Model-generated SVGs are validated by an XML tag stack parser before disk operations.
5. **E2E Verification & CI Pipeline:** `scripts/gemini-live-e2e.ts` exercises the complete revision lifecycle with XML verification and backups, running in CI. Multi-platform release automation added in `.github/workflows/release.yml`.

---

## Hardening Audit Matrix

| Category | Finding in Commit 85826f9 | Final Release Gate Status | Verification Evidence |
| --- | --- | --- | --- |
| **P0: Local Auth Default** | Auth was opt-in when token was unset in CLI | Enforced by default (`requireAuth !== false`). Tauri native IPC `get_auth_token` and launcher sync token to desktop UI | `packages/core-server/src/server.test.ts` (PASS)<br>`apps/desktop/src-tauri/src/lib.rs` (PASS) |
| **P0: Exact Origin Checks** | Prefix matching (`startsWith`) permitted `tauri://attacker.com` | Strict URL parser checks exact hostname and protocol without prefixing | `packages/core-server/src/security.test.ts` (PASS: 13/13) |
| **P1: Capture Fidelity** | Rasterizer only supported `<rect>` and `<circle>` | Added 5x7 font engine for `<text>`, line segment solver for `<path>` and `<line>`, and `<ellipse>` rasterizer | `packages/preview-engine/src/capturePixel.test.ts` (PASS: 4/4) |
| **P1: File Safety & XML** | Path prefix matching and basic string search for `<svg>` | Canonical `fs.realpathSync` path relativity check + XML tag stack parser checking tag matching and closing | `adapters/gemini-cli/src/safety.test.ts` (PASS: 7/7) |
| **P1: Live Model E2E** | Live test exited early without executing revision when key missing | Closed-loop revision, XML check, and backup verified in both live and offline modes; added to CI | `scripts/gemini-live-e2e.ts` (PASS)<br>`.github/workflows/ci.yml` |
| **P2: Release Packaging** | Missing release workflow for desktop installers | Created `.github/workflows/release.yml` with multi-platform matrix (macOS, Linux, Windows) | `.github/workflows/release.yml` |

---

## Detailed Audit Results

### 1. Default Authentication & Multi-Process Synchronization (P0) — RESOLVED
- **Default Requirement:** Core Server defaults to `requireAuth: true`. Requests without a valid Bearer token receive HTTP 401 Unauthorized (`/v1/health` remains exempt for liveness probes).
- **Desktop Native Token Sync:** Tauri desktop registers `get_auth_token` native command in `src-tauri/src/lib.rs`. On startup, `useVisualLoopStore` retrieves the local token and configures both REST `coreClient` and WebSocket `eventClient` before establishing connections.
- **Unified Launcher:** `scripts/start-all.ts` generates or reads `~/.visualloop/auth_token` with `0600` permissions and passes `VISUALLOOP_SECRET_TOKEN` and `VITE_VISUALLOOP_TOKEN` to spawned processes.

### 2. Exact Origin Validation (P0) — RESOLVED
- **Eliminated Prefix Matches:** Replaced `origin.startsWith("tauri://")` and `origin.startsWith("http://tauri.localhost")` with exact URL protocol and hostname checks.
- **Strict Host Verification:** Only exact matches for `tauri://localhost`, `http://tauri.localhost`, `localhost`, `127.0.0.1`, and `[::1]` are accepted. Spoofed origins (e.g. `http://tauri.localhost.attacker.com` or `tauri://attacker.com`) are rejected with HTTP 403 Forbidden / WS 1008.

### 3. Full-Fidelity SVG Rasterization (P1) — RESOLVED
- **Bitmap Font Engine:** Implemented a built-in 5x7 ASCII bitmap font in `packages/preview-engine/src/bitmapFont.ts`. `<text>` elements are rasterized directly onto the canvas buffer with correct font scale and fill colors.
- **Path & Line Geometry:** Parses SVG paths (`M`, `L`, `H`, `V`, `Z`) into line segments, calculating perpendicular point-to-segment distances for pixel-accurate stroke rasterization.
- **Pixel Assertions:** Verified via `decodePngPixels` asserting exact hex/RGB color matches across rectangles, circles, ellipses, lines, paths, and rendered text glyphs.

### 4. Model Runner Safety & XML Verification (P1) — RESOLVED
- **Canonical Workspace Relativity:** Replaced `startsWith` with `path.relative(realRoot, realTarget)`. Sibling folder name collisions (e.g. `/workspace-sibling`) and symlinks pointing outside the workspace are blocked.
- **XML Tag Stack Parser:** `validateSvgXmlStructure` parses XML tokens, verifying that the document is wrapped in `<svg>...</svg>`, self-closing tags are respected, and all container tags (e.g. `<g>`) match their corresponding closing tags before writing to disk.
- **Rollback Guarantee:** Unclosed tags or mismatched elements prevent disk overwrites, preserving the original file and existing versioned backups.

### 5. Genuine E2E & Desktop Disambiguation (P1) — RESOLVED
- **Clear Documentation:** `README.md` and assets clarify that `visualloop-demo.gif` is a scripted desktop UI demonstration, whereas live model workflows are validated via `pnpm test:gemini-e2e`.
- **E2E in CI:** `pnpm test:gemini-e2e` is integrated into GitHub Actions CI, exercising the complete session -> publish -> feedback queue -> code safety validation -> atomic swap -> revision 2 lifecycle.

---

## Verification Suite Evidence

The following verification commands were executed and confirmed on macOS:

```bash
pnpm build              # PASS (All 8 monorepo packages compiled)
pnpm typecheck          # PASS (TypeScript --noEmit zero errors)
pnpm test               # PASS (All suites passing, 65+ unit/integration tests)
pnpm demo:golden-path   # PASS (Scripted architectural loop verified in under 500ms)
pnpm test:gemini-e2e    # PASS (Closed-loop session, queue, XML validation, and revision 2 verified)
cargo check             # PASS (Tauri Rust backend compiles cleanly with get_auth_token)
```

**Sign-off:** Final Release Gate passed. Developer Preview v0.1.0 hardened for release.
