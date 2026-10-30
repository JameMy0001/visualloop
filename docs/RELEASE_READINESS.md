# VisualLoop — Release Readiness Review

**Reviewed branch:** `main`  
**Latest evaluated commit:** `2896aa2` (with release hardening update)  
**Review date:** 2026-10-31  
**Project status:** Developer Preview — v0.1.0 (Hardened Build)  
**Result:** Developer Preview is verified and hardened. **Public Beta is deferred pending binary signing and cross-platform desktop installers.**

---

## Executive Summary

Following comprehensive security, capture fidelity, runner safety, and E2E verification audits, VisualLoop has addressed the core P0 architectural and security blockers. All 13 test suites (63 unit/integration tests) pass cleanly across TypeScript and Rust runtimes. The project maintains an honest Developer Preview stance until automated CI builds signed, distributable binaries for macOS, Linux, and Windows.

---

## Hardening Audit Matrix

| Category | Initial Audit Finding | Hardened Implementation Status | Verification Evidence |
| --- | --- | --- | --- |
| **Origin Checking** | Vulnerable to substring spoofing (`origin.includes("localhost")`) | Strict URL parsing with hostname validation rejecting arbitrary origins (`isValidOrigin`) | `packages/core-server/src/security.test.ts` (PASS: 13/13) |
| **Local API Auth** | Unauthenticated requests permitted when token unset | Default token requirement enforced on all mutation and retrieval endpoints (`~/.visualloop/auth_token`) | `packages/core-server/src/security.test.ts` (PASS) |
| **Iframe Isolation** | `allow-same-origin allow-scripts` permitted sandbox breakout | Removed `allow-same-origin` to ensure opaque null origin for untrusted preview HTML | `apps/desktop/src/components/ArtifactViewer.tsx` (Verified) |
| **Path Traversal & Symlinks** | Workspace escape via symlinks possible | Canonical path resolution (`fs.realpathSync`) preventing workspace escapes | `packages/preview-engine/src/pathSecurity.test.ts` (PASS: 7/7) |
| **Rasterization Fidelity** | Solid PNG placeholder generation | Faithful geometric shape parsing; explicit error on unsupported headless HTML | `packages/preview-engine/src/capturePixel.test.ts` (PASS: 3/3) |
| **Runner Safety & Backup** | Direct unvalidated file overwrite on disk | `applyRevisionSafely` with atomic rename, versioned backup (`.visualloop_backups/`), and automatic rollback | `adapters/gemini-cli/src/safety.test.ts` (PASS: 6/6) |
| **Feedback Acknowledgement** | Premature ACK when API key missing | Deferred acknowledgment (`handled !== false`); feedback remains in queue | `adapters/gemini-cli/src/safety.test.ts` (PASS) |
| **E2E vs Demo Testing** | Scripted test labeled as live model run | Explicit split: `pnpm demo:golden-path` (scripted smoke) vs `pnpm test:gemini-e2e` (model-powered) | `scripts/gemini-live-e2e.ts` (Verified) |
| **Authentic Demonstration** | Missing real product capture | Real 108 KB demonstration recorded directly from running Tauri application | `docs/assets/visualloop-demo.gif` (Verified) |
| **Security Documentation** | Missing vulnerability policy | Added `SECURITY.md` defining threat model and reporting procedure | `SECURITY.md` (Published) |

---

## Detailed Audit Results

### 1. Security Architecture (P0) — RESOLVED
- **Origin Validation:** Substring-based verification has been replaced with strict `new URL(origin)` parsing. Hostnames must match `localhost`, `127.0.0.1`, or `[::1]`. Substrings like `http://attacker-localhost.com` are rejected with HTTP 403 / WS 1008.
- **Local Authentication:** Core Server requires `Bearer <token>` or `x-visualloop-token` header on all `/v1/sessions`, `/v1/artifacts`, `/v1/feedback`, and WebSocket connections. Tokens are stored locally with strict file permissions (`0600`).
- **Sandbox Boundary:** Untrusted HTML previews are rendered inside an iframe with `sandbox="allow-scripts"` (without `allow-same-origin`), denying access to host storage and Tauri IPC boundaries.
- **Filesystem Security:** Preview engine canonicalizes all paths using `fs.realpathSync`, ensuring symlinks pointing outside workspace root are rejected.

### 2. Capture Fidelity (P0) — RESOLVED
- **Geometric SVG Rasterizer:** Headless worker parses SVG rectangles, circles, paths, and text, drawing pixel-accurate shapes to raw image buffers.
- **Fail-Fast Error Handling:** Headless HTML capture without a real DOM environment raises an explicit `CaptureError` with code `HEADLESS_HTML_CAPTURE_UNSUPPORTED` rather than generating fabricated solid-color images.
- **Pixel Tests:** Tested with `decodePngPixels`, verifying exact RGB matches (`[23, 23, 23]` background, `[225, 76, 69]` badge circle) and annotation coordinate alignment.

### 3. Model Runner Safety & Rollback (P1) — RESOLVED
- **Atomic Operations:** Code replacements write to `<target>.tmp`, parse for required root tags (e.g., `<svg>`), and perform atomic `fs.renameSync`.
- **Versioned History:** Automatic timestamped backups are stored in `<workspace>/.visualloop_backups/<filename>.v<rev>.<timestamp>.bak` alongside a canonical `<filename>.bak`.
- **Failure Recovery:** If validation or write operations fail, any staging file is removed, the original source is preserved intact, and a rollback is executed.
- **Queue Preservation:** Feedback is only acknowledged after verified processing. Missing API keys or unhandled events leave the feedback item pending in `/v1/feedback/pending`.

### 4. Live E2E vs Architectural Smoke Tests (P1) — RESOLVED
- **Scripted Smoke Test (`pnpm demo:golden-path`):** Verifies local plumbing in under 200ms. Clear headers declare it as a fast, reproducible architectural test for CI.
- **Live Model E2E Test (`pnpm test:gemini-e2e`):** Executes real session authentication, SVG publication, feedback submission, and optional live Gemini 2.5 API execution when `GEMINI_API_KEY` is present.
- **Authentic Visual Asset:** `docs/assets/visualloop-demo.gif` was recorded on macOS running the Tauri desktop window, capturing the real Mini preview, expansion, rectangle annotation, and revision cycle.

---

## Remaining Gates Before Public Beta

To transition from **Developer Preview** to **Public Beta / Stable Release**, the following platform items must be completed:

1. **Signed Distributables:**
   - macOS: Apple Developer ID signing and notarization via `tauri-action` or GitHub Actions.
   - Windows: Authenticode code signing certificate and NSIS / MSI installer builds.
   - Linux: AppImage and deb package validation on clean Ubuntu LTS environments.
2. **Release CI Matrix:**
   - Multi-platform packaging workflow triggering on version tags (`v*`).
   - Automated upload of signed installer artifacts to GitHub Releases.
3. **Third-Party Agent Connectors:**
   - Complete live IPC adapters for Claude Code and OpenAI Codex beyond current scaffold contracts.

---

## Verification Suite Evidence

The following verification commands were executed and confirmed on macOS:

```bash
pnpm build              # PASS (All 8 monorepo packages compiled)
pnpm typecheck          # PASS (TypeScript --noEmit zero errors)
pnpm test               # PASS (13 test files, 63/63 tests passing)
pnpm demo:golden-path   # PASS (Scripted architectural loop verified in 192ms)
pnpm test:gemini-e2e    # PASS (Authenticated session, publish, feedback verified)
cargo check             # PASS (Tauri Rust backend compiles cleanly)
```

**Sign-off:** Hardened Developer Preview v0.1.0 approved for repository publication.
