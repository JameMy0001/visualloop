import { describe, it, expect } from "vitest";
import {
  WindowStateSchema,
  WindowConfigSchema,
  FeedbackSubmissionSchema,
  normalizeBounds,
} from "@visualloop/protocol";

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
});
