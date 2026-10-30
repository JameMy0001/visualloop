# Changelog

All notable changes to VisualLoop are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0-preview.2] - 2026-10-31

### Security Hardening (Public Beta Preparation)
- **Exact Origin Validation**: Replaced substring checks on Origin headers with strict URL parsing and exact hostname matching (`localhost`, `127.0.0.1`, `::1`, `tauri://localhost`).
- **Local API Authentication**: Added automated token resolution (`resolveOrCreateAuthToken`) persisting credentials to `~/.visualloop/auth_token` with `0600` permissions.
- **Symlink Defense**: Enforced `fs.realpathSync` traversal checks blocking symlink escapes outside the registered workspace boundary.
- **Negative Security Suite**: Added 13 automated negative tests in `packages/core-server/src/security.test.ts` covering 401 unauthenticated requests, 403 cross-origin requests, and 1008 WebSocket closures.
- **Iframe Isolation**: Removed `allow-same-origin` from preview iframes in `ArtifactViewer.tsx` to enforce opaque null origin isolation.

### Capture Fidelity
- **Authentic Pixel Rasterization**: Replaced approximate SVG rendering with exact geometric rasterization matching element coordinates and colors.
- **Pixel Verification Tests**: Added `packages/preview-engine/src/capturePixel.test.ts` asserting exact RGB color values at pixel coordinates and confirming explicit errors on headless HTML capture without DOM.

### Agent Runner Safety
- **Versioned Backups**: Introduced immutable historical backups (`.visualloop_backups/<filename>.v<revision>.<timestamp>.bak`) prior to file mutations.
- **Atomic File Swaps**: Staged model-generated code to temporary files and validated `<svg>` root tags before atomic renaming.
- **Feedback Preservation**: Updated `watchFeedback` so deferred processing (such as missing `GEMINI_API_KEY`) leaves feedback queued as pending instead of prematurely acknowledging it.
- **Safety Test Suite**: Added 6 tests in `adapters/gemini-cli/src/safety.test.ts` covering empty code rejection, malformed SVG rejection, workspace escapes, and rollback recovery.

---

## [0.1.0-preview.1] - 2026-10-30

### Initial Developer Preview Release
- **Monochrome UI System**: Implemented minimal desktop interface with neutral palette (`#F5F5F5`, `#FFFFFF`, `#171717`) and high-contrast red functional annotations (`#E14C45`).
- **Unified Launcher**: Added `scripts/start-all.ts` and `visualloop-server` CLI entrypoint.
- **Live Preview Engine**: Real-time WebSocket delivery of published SVG and HTML artifacts.
- **True Screen Capture**: HTML5 Canvas rasterization replacing mock 1x1 image placeholders.
- **Demonstration Asset**: Generated authentic desktop demonstration GIF (`docs/assets/visualloop-demo.gif`) via Chrome DevTools Protocol and FFmpeg.

---

## Supported Platforms

| Platform | Target Architecture | Native Window Status | Web Development Mode |
| :--- | :--- | :--- | :--- |
| **macOS** | Apple Silicon (`aarch64-apple-darwin`), Intel (`x86_64-apple-darwin`) | Supported (`tauri dev`) | Supported (`pnpm dev:web`) |
| **Linux** | Ubuntu 22.04+ / Debian (`x86_64-unknown-linux-gnu`) | Supported via WebKit2GTK | Supported (`pnpm dev:web`) |
| **Windows** | Windows 10/11 (`x86_64-pc-windows-msvc`) | Experimental | Supported (`pnpm dev:web`) |
