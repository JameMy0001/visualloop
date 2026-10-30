import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, it, expect } from "vitest";
import {
  WindowStateSchema,
  WindowConfigSchema,
  FeedbackSubmissionSchema,
  normalizeBounds,
} from "@visualloop/protocol";
import { CoreServer } from "@visualloop/core-server";
import { GeminiCliAdapter } from "@visualloop/adapter-gemini-cli";

describe("Phase 1 Desktop Integration Pipeline", () => {
  it("transitions between mini and expanded states safely", () => {
    let currentState = WindowStateSchema.parse("mini_idle");
    expect(currentState).toBe("mini_idle");

    // Simulating user clicking expand handle or pressing Cmd+Shift+V
    currentState = WindowStateSchema.parse("expanded");
    expect(currentState).toBe("expanded");

    // Simulating user submitting feedback
    currentState = WindowStateSchema.parse("submitting");
    expect(currentState).toBe("submitting");

    // Simulating post-submit transition back to mini waiting
    currentState = WindowStateSchema.parse("mini_waiting");
    expect(currentState).toBe("mini_waiting");
  });

  it("handles window config persistence with valid constraints", () => {
    const config = WindowConfigSchema.parse({
      mode: "mini",
      state: "mini_idle",
      alwaysOnTop: true,
      clickThrough: true,
      opacity: 0.8,
      size: { width: 360, height: 240 },
    });

    expect(config.opacity).toBe(0.8);
    expect(config.alwaysOnTop).toBe(true);
    expect(config.clickThrough).toBe(true);
  });

  it("produces complete validated feedback submission from drawn rectangle", () => {
    const viewport = { width: 1024, height: 768 };
    const drawnRect = { x: 200, y: 150, width: 300, height: 200 };
    const norm = normalizeBounds(drawnRect, viewport);

    const submission = FeedbackSubmissionSchema.parse({
      protocolVersion: "1.0",
      feedbackId: "fb_test_1",
      sessionId: "sess_gemini_test",
      artifactId: "art_solar_system",
      revision: 1,
      viewport: {
        width: 1024,
        height: 768,
        devicePixelRatio: 2,
        zoom: 1,
        scrollX: 0,
        scrollY: 0,
      },
      annotations: [
        {
          id: "ann_001",
          type: "circle",
          bounds: norm,
          instruction: "Make Saturn's rings more prominent",
          color: "#FBBF24",
          strokeWidth: 2,
          createdAt: new Date().toISOString(),
        },
      ],
      generalInstruction: "Focus on visual clarity",
      idempotencyKey: "idem_test_abc",
      createdAt: new Date().toISOString(),
    });

    expect(submission.annotations[0].instruction).toBe("Make Saturn's rings more prominent");
    expect(submission.annotations[0].bounds.x).toBeCloseTo(200 / 1024);
  });

  it("executes the full closed-loop feedback and revision cycle", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "visualloop-test-loop-"));
    const svgPath = path.join(tempDir, "card.svg");
    fs.writeFileSync(
      svgPath,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="blue"/></svg>`,
      "utf-8"
    );

    const testPort = 4199;
    const server = new CoreServer({ port: testPort, host: "127.0.0.1", storageFilePath: null });
    await server.start();
    const token = server.getSecretToken();

    try {
      const adapter = new GeminiCliAdapter({
        serverUrl: `http://127.0.0.1:${testPort}`,
        secretToken: token,
      });
      const session = await adapter.registerSession({
        adapterId: "gemini-cli",
        agentName: "Gemini CLI",
        workspaceRoot: tempDir,
      });

      // 1. Publish rev 1
      const rev1 = await adapter.publishArtifact({
        sessionId: session.sessionId,
        artifactId: "art_test_card",
        revision: 1,
        kind: "svg",
        entrypoint: "card.svg",
        viewport: { width: 100, height: 100, devicePixelRatio: 1, zoom: 1, scrollX: 0, scrollY: 0 },
      });
      expect(rev1.revision).toBe(1);
      const hash1 = (rev1 as any).contentHash;

      // 2. Submit feedback
      await adapter.deliverFeedback({
        protocolVersion: "1.0",
        feedbackId: "fb_test_cycle",
        sessionId: session.sessionId,
        artifactId: "art_test_card",
        revision: 1,
        viewport: { width: 100, height: 100, devicePixelRatio: 1, zoom: 1, scrollX: 0, scrollY: 0 },
        annotations: [],
        generalInstruction: "Change fill to red",
        idempotencyKey: "idem_test_cycle",
        createdAt: new Date().toISOString(),
      });

      // 3. Adapter consumes & acks
      const feedback = await adapter.getLatestFeedback(session.sessionId);
      expect(feedback).not.toBeNull();
      expect(feedback?.feedbackId).toBe("fb_test_cycle");
      await adapter.acknowledgeFeedback("fb_test_cycle");

      // 4. File edit
      fs.writeFileSync(
        svgPath,
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="red"/></svg>`,
        "utf-8"
      );

      // 5. Publish rev 2
      const rev2 = await adapter.publishArtifact({
        sessionId: session.sessionId,
        artifactId: "art_test_card",
        revision: 2,
        kind: "svg",
        entrypoint: "card.svg",
        viewport: { width: 100, height: 100, devicePixelRatio: 1, zoom: 1, scrollX: 0, scrollY: 0 },
      });
      expect(rev2.revision).toBe(2);
      const hash2 = (rev2 as any).contentHash;
      expect(hash1).not.toBe(hash2);
    } finally {
      await server.stop();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
