import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { CoreServer } from "@visualloop/core-server";
import { FeedbackSubmission } from "@visualloop/protocol";
import { GeminiCliAdapter } from "./index.js";

describe("Gemini CLI Adapter Integration & Prompt Generation", () => {
  let server: CoreServer;
  let adapter: GeminiCliAdapter;
  const workspaceRoot = path.resolve(__dirname, "../../../examples");
  const tempFeedbackFile = path.resolve(__dirname, "visualloop-feedback.json");

  beforeAll(async () => {
    server = new CoreServer({ port: 4181, host: "127.0.0.1" });
    const baseUrl = await server.start();
    adapter = new GeminiCliAdapter({ serverUrl: baseUrl });
  });

  afterAll(async () => {
    await server.stop();
    if (fs.existsSync(tempFeedbackFile)) {
      fs.unlinkSync(tempFeedbackFile);
    }
  });

  it("formats feedback annotations cleanly into an LLM instruction prompt", () => {
    const submission: FeedbackSubmission = {
      protocolVersion: "1.0",
      feedbackId: "fb_prompt_test",
      sessionId: "sess_1",
      artifactId: "art_solar",
      revision: 1,
      viewport: { width: 1200, height: 800, devicePixelRatio: 1, zoom: 1, scrollX: 0, scrollY: 0 },
      annotations: [
        {
          id: "ann_01",
          type: "circle",
          bounds: { x: 0.45, y: 0.35, width: 0.15, height: 0.15 },
          instruction: "Make Earth slightly greener and add atmospheric cloud layers",
          color: "#3B82F6",
          strokeWidth: 2,
          createdAt: new Date().toISOString(),
        },
      ],
      generalInstruction: "Increase contrast of orbit paths",
      idempotencyKey: "key_1",
      createdAt: new Date().toISOString(),
    };

    const prompt = adapter.formatFeedbackPrompt(submission);
    expect(prompt).toContain("VISUALLOOP USER FEEDBACK");
    expect(prompt).toContain("Revision 1");
    expect(prompt).toContain("Make Earth slightly greener");
    expect(prompt).toContain("Increase contrast of orbit paths");
    expect(prompt).toContain("publish Revision 2");
  });

  it("registers session, publishes artifact, and delivers feedback to mock agent", async () => {
    // 1. Register Session
    const session = await adapter.registerSession({
      adapterId: "gemini-cli",
      agentName: "Gemini CLI",
      workspaceRoot,
    });
    expect(session.sessionId).toBeDefined();

    // 2. Publish Artifact Revision 1
    const rev1 = await adapter.publishArtifact({
      sessionId: session.sessionId,
      artifactId: "art_gemini_test",
      revision: 1,
      kind: "svg",
      entrypoint: "solar-system.svg",
    });
    expect(rev1.revision).toBe(1);

    // 3. Deliver Feedback
    const receipt = await adapter.deliverFeedback({
      protocolVersion: "1.0",
      feedbackId: "fb_gemini_deliv",
      sessionId: session.sessionId,
      artifactId: "art_gemini_test",
      revision: 1,
      viewport: { width: 1200, height: 800, devicePixelRatio: 1, zoom: 1, scrollX: 0, scrollY: 0 },
      annotations: [
        {
          id: "ann_ring",
          type: "ellipse",
          bounds: { x: 0.8, y: 0.5, width: 0.1, height: 0.1 },
          instruction: "Increase Saturn ring tilt",
          color: "#F59E0B",
          strokeWidth: 2,
          createdAt: new Date().toISOString(),
        },
      ],
      idempotencyKey: "key_deliv_1",
      createdAt: new Date().toISOString(),
    });

    expect(receipt.status).toBe("delivered");

    // 4. Publish Revision 2
    const rev2 = await adapter.publishArtifact({
      sessionId: session.sessionId,
      artifactId: "art_gemini_test",
      revision: 2,
      kind: "svg",
      entrypoint: "solar-system.svg",
    });
    expect(rev2.revision).toBe(2);
  });
});
