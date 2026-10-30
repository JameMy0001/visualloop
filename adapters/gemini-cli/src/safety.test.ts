import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyRevisionSafely, GeminiCliAdapter } from "./index.js";
import { FeedbackSubmission } from "@visualloop/protocol";

describe("Gemini Runner Safety & Failure Recovery", () => {
  let tempDir: string;
  let testSvgPath: string;
  const initialContent = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="#171717"/></svg>`;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "visualloop-runner-safety-"));
    testSvgPath = path.join(tempDir, "test-artifact.svg");
    fs.writeFileSync(testSvgPath, initialContent, "utf-8");
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("safely applies valid revised code, creates versioned backup, and tracks diff", () => {
    const revisedContent = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">\n  <circle cx="50" cy="50" r="30" fill="#E14C45"/>\n</svg>`;

    const res = applyRevisionSafely({
      targetFilePath: testSvgPath,
      revisedCode: revisedContent,
      revision: 1,
      workspaceRoot: tempDir,
    });

    expect(res.success).toBe(true);
    expect(res.backupPath).toBeDefined();
    expect(fs.existsSync(res.backupPath!)).toBe(true);
    expect(fs.readFileSync(res.backupPath!, "utf-8")).toBe(initialContent);

    // Target file on disk must be updated
    const updated = fs.readFileSync(testSvgPath, "utf-8");
    expect(updated).toBe(revisedContent);
  });

  it("rejects empty code output and preserves original file intact", () => {
    const res = applyRevisionSafely({
      targetFilePath: testSvgPath,
      revisedCode: "   ",
      revision: 1,
      workspaceRoot: tempDir,
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("Empty code received");
    // Original file must remain 100% unchanged
    expect(fs.readFileSync(testSvgPath, "utf-8")).toBe(initialContent);
  });

  it("rejects malformed SVG output missing root tags and preserves original file", () => {
    const res = applyRevisionSafely({
      targetFilePath: testSvgPath,
      revisedCode: "<div>This is not valid SVG</div>",
      revision: 1,
      workspaceRoot: tempDir,
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("SVG must have <svg> as root element");
    expect(fs.readFileSync(testSvgPath, "utf-8")).toBe(initialContent);
  });

  it("rejects unclosed or mismatched XML tags in SVG output", () => {
    // Unclosed <g> tag before </svg>
    const unclosedRes = applyRevisionSafely({
      targetFilePath: testSvgPath,
      revisedCode: `<svg width="100" height="100"><g><rect width="50"/></svg>`,
      revision: 1,
      workspaceRoot: tempDir,
    });
    expect(unclosedRes.success).toBe(false);
    expect(unclosedRes.error).toContain("Mismatched tag </svg>, expected </g>");

    // Mismatched closing tag </circle> for <g>
    const mismatchedRes = applyRevisionSafely({
      targetFilePath: testSvgPath,
      revisedCode: `<svg width="100" height="100"><g><rect width="50"/></circle></svg>`,
      revision: 1,
      workspaceRoot: tempDir,
    });
    expect(mismatchedRes.success).toBe(false);
    expect(mismatchedRes.error).toContain("Mismatched tag </circle>");
    expect(fs.readFileSync(testSvgPath, "utf-8")).toBe(initialContent);
  });

  it("blocks file modification attempts targeting paths outside the workspace or symlink escapes", () => {
    const outsideFile = path.join(os.tmpdir(), "outside-target.svg");
    fs.writeFileSync(outsideFile, initialContent, "utf-8");

    // 1. Direct path outside workspace
    try {
      const res = applyRevisionSafely({
        targetFilePath: outsideFile,
        revisedCode: `<svg><circle/></svg>`,
        revision: 1,
        workspaceRoot: tempDir,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("escapes workspace");
      expect(fs.readFileSync(outsideFile, "utf-8")).toBe(initialContent);
    } finally {
      if (fs.existsSync(outsideFile)) fs.unlinkSync(outsideFile);
    }

    // 2. Symlink inside workspace pointing outside
    const outsideTarget = path.join(os.tmpdir(), "real-outside-target.svg");
    fs.writeFileSync(outsideTarget, initialContent, "utf-8");
    const symlinkInWorkspace = path.join(tempDir, "symlink-escape.svg");

    try {
      fs.symlinkSync(outsideTarget, symlinkInWorkspace);
      const res = applyRevisionSafely({
        targetFilePath: symlinkInWorkspace,
        revisedCode: `<svg><circle/></svg>`,
        revision: 1,
        workspaceRoot: tempDir,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("escapes workspace");
      expect(fs.readFileSync(outsideTarget, "utf-8")).toBe(initialContent);
    } finally {
      if (fs.existsSync(symlinkInWorkspace)) fs.unlinkSync(symlinkInWorkspace);
      if (fs.existsSync(outsideTarget)) fs.unlinkSync(outsideTarget);
    }
  });

  it("leaves feedback pending when processing is deferred or API key is missing", async () => {
    const adapter = new GeminiCliAdapter({ serverUrl: "http://127.0.0.1:9999" });

    const mockFeedback: FeedbackSubmission = {
      protocolVersion: "1.0",
      feedbackId: "fb_deferred_01",
      sessionId: "sess_mock",
      artifactId: "art_mock",
      revision: 1,
      viewport: { width: 800, height: 600, devicePixelRatio: 1, zoom: 1, scrollX: 0, scrollY: 0 },
      annotations: [],
      createdAt: new Date().toISOString(),
    };

    let acknowledgeCalled = false;
    adapter.getPendingFeedback = async () => [mockFeedback];
    adapter.acknowledgeFeedback = async () => {
      acknowledgeCalled = true;
      return { feedbackId: mockFeedback.feedbackId, status: "delivered", timestamp: "" };
    };

    // Handler returns false to indicate processing cannot proceed (e.g. key missing)
    let handlerInvoked = false;
    const stopWatching = adapter.watchFeedback("sess_mock", async () => {
      handlerInvoked = true;
      return false; // Leave pending!
    }, 100);

    // Allow poll to execute once
    await new Promise((r) => setTimeout(r, 200));
    stopWatching();

    expect(handlerInvoked).toBe(true);
    expect(acknowledgeCalled).toBe(false); // Must NOT acknowledge
  });

  it("acknowledges feedback when processing succeeds", async () => {
    const adapter = new GeminiCliAdapter({ serverUrl: "http://127.0.0.1:9999" });

    const mockFeedback: FeedbackSubmission = {
      protocolVersion: "1.0",
      feedbackId: "fb_success_01",
      sessionId: "sess_mock",
      artifactId: "art_mock",
      revision: 1,
      viewport: { width: 800, height: 600, devicePixelRatio: 1, zoom: 1, scrollX: 0, scrollY: 0 },
      annotations: [],
      createdAt: new Date().toISOString(),
    };

    let acknowledgeCalled = false;
    adapter.getPendingFeedback = async () => [mockFeedback];
    adapter.acknowledgeFeedback = async () => {
      acknowledgeCalled = true;
      return { feedbackId: mockFeedback.feedbackId, status: "delivered", timestamp: "" };
    };

    // Handler succeeds
    let handlerInvoked = false;
    const stopWatching = adapter.watchFeedback("sess_mock", async () => {
      handlerInvoked = true;
      return true; // Successful handling
    }, 100);

    await new Promise((r) => setTimeout(r, 200));
    stopWatching();

    expect(handlerInvoked).toBe(true);
    expect(acknowledgeCalled).toBe(true); // Must acknowledge
  });
});
