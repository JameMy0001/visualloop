# VisualLoop — Release Readiness Review

**Reviewed branch:** `main`  
**Reviewed commit:** `d6914ac6f38978cfea3a9a24d04ebb06786dc199`  
**Review date:** 2026-10-30  
**Result:** Developer preview is appropriate. **Not approved for public beta / stable release.**

This review is based on GitHub source inspection and workflow status; it is not a substitute for running the packaged application on physical macOS, Windows, and Linux machines.

## Confirmed positives

- Main branch contains a live-artifact viewer, local API, desktop UI redesign, session state, feedback queue, and Gemini API revision method.
- GitHub Actions latest run `41076548929` reports success (macOS and Ubuntu).
- Core Server state persistence and pending-feedback endpoints exist.
- A genuine Gemini API request path exists in `adapters/gemini-cli/src/index.ts` and is called by `scripts/gemini-live-agent.ts` when `GEMINI_API_KEY` is set.
- Tauri CSP configuration is no longer null.

## Blocking issues

### P0 — Fix launch and packaging

**Evidence:** `scripts/start-all.ts` spawns `pnpm --filter @visualloop/core-server start`, but `packages/core-server/package.json` does not define a `start` script and `packages/core-server/src/index.ts` is only a library export. When a server is not already running, the advertised `pnpm start` path cannot bring it up.

**Fix:** Add a supported server executable, package entrypoint / start script, and a robust desktop lifecycle strategy (sidecar or managed local daemon). Verify clean installs and shutdown. Ensure the test covers the server-not-running case.

**Acceptance:** From a clean clone, run a documented command and observe the health endpoint and the native window, with no manual hidden steps. Prove macOS and Ubuntu; test Windows before claiming support.

### P0 — Replace fake PNG capture with artifact-faithful capture

**Evidence:** `packages/preview-engine/src/screenshotWorker.ts` generates a valid PNG using `createSolidPngBuffer(...)` for a solid white / light gray image. This is NOT a rendered screenshot. `apps/desktop/src/components/ExpandedEditor.tsx` searches for an SVG child element, and falls back to a blank canvas when it is reviewing an HTML iframe.

**Fix:** Capture pixels from the actual preview surface for both SVG and HTML. Implement an isolated browser/WebView-based rasterization pipeline, coordinate transformation for letterboxing/scroll/zoom/device-pixel-ratio, and visual regression tests. Do not fall back to fabricated images: report an explicit capture error.

**Acceptance:** Pixel-based screenshot tests prove text, shapes, CSS, and annotations are visible and correctly aligned. HTML and SVG both pass. Compare with real screenshots from the desktop app.

### P0 — Hardening of local API and preview isolation

**Evidence:** `packages/core-server/src/server.ts` accepts `secretToken?` and only enforces authentication when supplied; `packages/preview-engine/src/sanitizer.ts` includes a regex fallback; `apps/desktop/src/components/ArtifactViewer.tsx` injects SVG into the document and uses an HTML iframe with `allow-same-origin allow-scripts`.

**Fix:** Require authenticated connections by default (except carefully scoped health checks), secure credential creation / propagation to browser and agent, verify Origin and CORS against actual threat model, and use a robust structured allowlist sanitizer / sandbox isolation for untrusted preview content. Do a focused security review before marketing as safe for arbitrary third-party HTML/SVG.

**Acceptance:** Negative security tests for unauthenticated HTTP + WS access, malicious SVG/HTML, network requests and local file accesses; public docs describe actual restrictions.

### P1 — Verify a truly live agent + desktop loop

**Evidence:** `scripts/gemini-live-agent.ts` calls the Gemini API when configured, but `scripts/demo-loop.ts` writes hard-coded revision content via `fs.writeFileSync`, so its pass is not a live model E2E. CI runs compilation and tests but no GUI-driven live model test.

**Fix:** Run a real user journey on a desktop: agent registers and publishes a nontrivial SVG and HTML file; preview renders; human draws an annotation; screenshot is faithful; feedback is delivered; live Gemini API produces code; review the diff; publish revision; see correct updated preview.

**Acceptance:** Archive redacted video/screenshot evidence and logs. Document model, OS, test command, environment requirements and whether API calls cost money.

### P1 — Model-generated code safety

**Evidence:** `scripts/gemini-live-agent.ts` replaces the target source file directly after receiving model output, with no visible parse or schema verification, diff review, transaction/rollback, or guaranteed backup. `generateRevisionWithGemini` extracts a code fence or uses the entire raw response as replacement.

**Fix:** Write to a temporary file, parse/validate output, show diff or require opt-in for auto-apply, retain backups, atomically replace only when verified, and protect paths outside the selected workspace. Never execute untrusted preview content with elevated privileges.

**Acceptance:** Bad/empty model output leaves original unchanged; undo/rollback works; no uncontrolled write path.

### P1 — README integrity and promotional assets

**Evidence:** Existing README calls the project `Production-Ready` and says it uses DOMPurify, while current source does not import DOMPurify. Existing README presents Gemini CLI as fully supported even though the live revision runner directly uses Gemini API credentials and its own polling process.

**Fix:** Use the attached redesigned README with truthful status wording. Obtain a genuine 10–20 second recording of a working desktop flow, optimize it for GitHub, add a screenshot/GIF to `docs/assets/`, and include a succinct visual above the fold. Do not ship fake screenshots.

**Acceptance:** Every quickstart command and feature assertion can be demonstrated in a fresh clone. Accessibility alt text and images work in GitHub dark/light themes.

### P2 — Public distribution and community standards

- Add a release workflow that builds actual distributables; signing/notarization plan for macOS and signing/distribution plan for Windows.
- Add `SECURITY.md`, issue/PR templates and a release changelog.
- Define versioning and support matrix; test at least one full installer per platform before advertising it.
- Confirm the license of any third-party screenshots, logos, or GIF footage.

## README design guidance

- Keep title and tagline above the fold. No gradient-heavy banners, fake endorsements, or badge walls.
- Use monochrome layout with one recognizable product screenshot from real hardware once available.
- Place Quick Start before lengthy architecture internals.
- Use one feature matrix and one compact architecture tree; avoid repeating each feature across multiple sections.
- Distinguish `Gemini API model runner` from `Gemini CLI conversation integration`.
- Make limitations and privacy expectations discoverable, not hidden in an appendix.

## Verification commands / evidence to collect

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm demo:golden-path
```

Add separate release workflows that actually execute `pnpm start`, run desktop UI screenshot tests, test the HTML capture, and verify the signed/distributable binaries; the existing CI does not cover these.

## Release decision

- **Developer Preview README:** ready to use as a draft now.
- **Public Beta:** defer until P0 issues are fixed and real GUI + Gemini integration is demonstrated.
- **Stable / Production-Ready:** defer until additional reliability/security review and downloadable builds are available.
