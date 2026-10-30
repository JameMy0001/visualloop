# Security Policy

VisualLoop is an open-source, local-first review companion for AI-generated visual interfaces. Because VisualLoop renders untrusted SVG and HTML code and integrates with code-modifying agent runners, security boundaries are enforced across all layers of the application.

---

## Supported Versions

| Version | Supported | Status |
| :--- | :--- | :--- |
| `0.1.x` (Developer Preview) | Yes | Active Security Hardening |
| `< 0.1.0` | No | Deprecated / Mock Prototypes |

---

## Threat Model and Security Architecture

### 1. Preview Isolation Boundary
- **HTML Sandboxing**: All rendered HTML previews are executed inside isolated iframes configured with `sandbox="allow-scripts"`. The `allow-same-origin` directive is strictly prohibited, ensuring preview code runs in an opaque null origin with zero access to cookies, local storage, parent windows, or Tauri IPC bridges.
- **SVG Sanitization**: Untrusted SVG files are scrubbed of executable scripts, foreign objects, inline event handlers (`onload`, `onclick`, etc.), and dangerous link protocols (`javascript:`, `vbscript:`, `data:text/html`).

### 2. Local API & WebSocket Access Control
- **Origin Validation**: Both HTTP routes and WebSocket connections enforce strict URL parsing and exact hostname verification (`localhost`, `127.0.0.1`, `::1`, or `tauri://localhost`). Substring and suffix matches are rejected to prevent DNS rebinding or unauthorized website access.
- **Authentication**: Sensitive API operations (session registration, artifact publication, feedback submission, and state queries) require an authentication token (`X-VisualLoop-Token` header or Bearer authorization). When running in secure mode, tokens are saved to `~/.visualloop/auth_token` with `0600` permissions.
- **Readiness Exception**: The `/v1/health` endpoint is unauthenticated by design to support external orchestrators and process supervisors.

### 3. File System & Boundary Defense
- **Path Traversal & Symlinks**: All artifact file paths must resolve within the registered workspace boundary. Path canonicalization via `fs.realpathSync` ensures symlinks pointing outside the workspace (e.g. `/etc/passwd` or home directory files) are rejected with a `SecurityPathError`.
- **Extension Allowlist**: Only permitted visual artifact extensions (`.svg`, `.html`, `.htm`, `.css`, `.js`) are loaded into the preview engine.

### 4. Agent Code Generation Safety
- **Staged Atomic Writes**: Model-generated code is verified for well-formed root elements (e.g. `<svg>...</svg>`) and written to a staged temporary file before atomic renaming (`fs.renameSync`).
- **Versioned Backups**: Immutable historical backups (`.visualloop_backups/<filename>.v<revision>.<timestamp>.bak`) are created before mutating any source file on disk.
- **Failure Recovery**: On validation failure or unhandled exception, modifications are automatically rolled back, preserving original source files intact.
- **Pending Feedback Preservation**: If an API key is missing or agent processing fails, feedback items remain queued as pending in the Core Server store.

---

## Reporting a Vulnerability

If you discover a security vulnerability in VisualLoop, please do not disclose it publicly via issue trackers.

Please report vulnerabilities via **GitHub Security Advisories**:
https://github.com/JameMy0001/visualloop/security/advisories/new

Or contact the maintainers directly. You will receive an initial response within 48 hours with an assessment and triage timeline.
