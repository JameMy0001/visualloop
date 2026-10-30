import { describe, it, expect } from "vitest";
import {
  WindowStateSchema,
  SessionRegistrationSchema,
  ArtifactPublicationSchema,
  FeedbackSubmissionSchema,
  ServerEventSchema,
} from "./index.js";

describe("Protocol Schemas", () => {
  it("validates window states correctly", () => {
    expect(WindowStateSchema.parse("mini_idle")).toBe("mini_idle");
    expect(WindowStateSchema.parse("expanded")).toBe("expanded");
    expect(() => WindowStateSchema.parse("invalid_state")).toThrow();
  });

  it("validates session registration payload", () => {
    const valid = {
      adapterId: "gemini-cli",
      agentName: "Gemini CLI",
      workspaceRoot: "/Users/dev/project",
    };
    const parsed = SessionRegistrationSchema.parse(valid);
    expect(parsed.adapterId).toBe("gemini-cli");
    expect(parsed.agentName).toBe("Gemini CLI");
  });

  it("validates artifact publication payload", () => {
    const valid = {
      sessionId: "sess_123",
      artifactId: "art_001",
      revision: 1,
      kind: "svg",
      entrypoint: "solar-system.svg",
    };
    const parsed = ArtifactPublicationSchema.parse(valid);
    expect(parsed.revision).toBe(1);
    expect(parsed.kind).toBe("svg");
  });

  it("validates feedback submission and normalized bounds", () => {
    const valid = {
      protocolVersion: "1.0",
      feedbackId: "fb_001",
      sessionId: "sess_123",
      artifactId: "art_001",
      revision: 2,
      viewport: {
        width: 1280,
        height: 720,
        devicePixelRatio: 2,
        zoom: 1,
        scrollX: 0,
        scrollY: 0,
      },
      annotations: [
        {
          id: "ann_01",
          type: "circle",
          bounds: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
          instruction: "Make this circle smaller",
          color: "#EF4444",
          strokeWidth: 2,
          createdAt: new Date().toISOString(),
        },
      ],
      idempotencyKey: "idem_abc123",
      createdAt: new Date().toISOString(),
    };
    const parsed = FeedbackSubmissionSchema.parse(valid);
    expect(parsed.annotations).toHaveLength(1);
    expect(parsed.annotations[0].bounds.x).toBe(0.1);
  });

  it("rejects out-of-bounds normalized coordinates", () => {
    const invalid = {
      protocolVersion: "1.0",
      feedbackId: "fb_001",
      sessionId: "sess_123",
      artifactId: "art_001",
      revision: 1,
      viewport: { width: 100, height: 100, devicePixelRatio: 1, zoom: 1, scrollX: 0, scrollY: 0 },
      annotations: [
        {
          id: "ann_01",
          type: "rectangle",
          bounds: { x: -0.5, y: 1.5, width: 0.2, height: 0.2 },
          instruction: "Invalid bounds",
          color: "#EF4444",
          strokeWidth: 2,
          createdAt: new Date().toISOString(),
        },
      ],
      idempotencyKey: "key_1",
      createdAt: new Date().toISOString(),
    };
    expect(() => FeedbackSubmissionSchema.parse(invalid)).toThrow();
  });

  it("validates server events discriminated union", () => {
    const event = {
      type: "artifact.published",
      timestamp: new Date().toISOString(),
      payload: {
        sessionId: "sess_1",
        artifactId: "art_1",
        revision: 1,
        kind: "svg",
        entrypoint: "demo.svg",
      },
    };
    const parsed = ServerEventSchema.parse(event);
    expect(parsed.type).toBe("artifact.published");
  });
});
