import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import WebSocket from "ws";
import { CoreServer } from "./server.js";

describe("Core Server End-to-End API & Event Pipeline", () => {
  let server: CoreServer;
  let baseUrl: string;
  let authToken: string;
  const workspaceRoot = path.resolve(__dirname, "../../../examples");

  beforeAll(async () => {
    // Start server on dynamic port for testing (auth enabled by default)
    server = new CoreServer({ port: 4179, host: "127.0.0.1" });
    baseUrl = await server.start();
    authToken = server.getSecretToken()!;
  });

  afterAll(async () => {
    await server.stop();
  });

  it("checks server health endpoint", async () => {
    expect(authToken).toBeDefined();
    const res = await fetch(`${baseUrl}/v1/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  it("registers an agent session and publishes an artifact revision", async () => {
    const authHeaders = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${authToken}`,
    };

    // 1. Register Session
    const sessRes = await fetch(`${baseUrl}/v1/sessions`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        adapterId: "gemini-cli",
        agentName: "Gemini CLI",
        workspaceRoot,
      }),
    });
    expect(sessRes.status).toBe(201);
    const session = await sessRes.json();
    expect(session.sessionId).toBeDefined();

    // 2. Publish Artifact Revision 1
    const artRes = await fetch(`${baseUrl}/v1/artifacts`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        sessionId: session.sessionId,
        artifactId: "art_solar",
        revision: 1,
        kind: "svg",
        entrypoint: "solar-system.svg",
      }),
    });
    expect(artRes.status).toBe(201);
    const artData = await artRes.json();
    expect(artData.revision).toBe(1);
    expect(artData.contentHash).toBeDefined();

    // 3. Query Revisions
    const revsRes = await fetch(`${baseUrl}/v1/artifacts/art_solar/revisions`, {
      headers: { "Authorization": `Bearer ${authToken}` },
    });
    expect(revsRes.status).toBe(200);
    const revsData = await revsRes.json();
    expect(revsData.revisions).toHaveLength(1);

    // 4. Submit Feedback
    const fbRes = await fetch(`${baseUrl}/v1/feedback`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        protocolVersion: "1.0",
        feedbackId: "fb_pipeline_01",
        sessionId: session.sessionId,
        artifactId: "art_solar",
        revision: 1,
        viewport: { width: 1200, height: 800, devicePixelRatio: 1, zoom: 1, scrollX: 0, scrollY: 0 },
        annotations: [
          {
            id: "ann_1",
            type: "circle",
            bounds: { x: 0.2, y: 0.3, width: 0.1, height: 0.1 },
            instruction: "Enlarge Jupiter",
            color: "#EF4444",
            strokeWidth: 2,
            createdAt: new Date().toISOString(),
          },
        ],
        idempotencyKey: "idem_pipe_001",
        createdAt: new Date().toISOString(),
      }),
    });
    expect(fbRes.status).toBe(201);

    // 5. Query Latest Feedback
    const latestRes = await fetch(`${baseUrl}/v1/feedback/latest?sessionId=${session.sessionId}`, {
      headers: { "Authorization": `Bearer ${authToken}` },
    });
    expect(latestRes.status).toBe(200);
    const latest = await latestRes.json();
    expect(latest.annotations[0].instruction).toBe("Enlarge Jupiter");

    // 6. Acknowledge Feedback
    const ackRes = await fetch(`${baseUrl}/v1/feedback/fb_pipeline_01/ack`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${authToken}` },
    });
    expect(ackRes.status).toBe(200);
    const ack = await ackRes.json();
    expect(ack.status).toBe("acknowledged");
  });

  it("broadcasts real-time events to connected WebSocket clients", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:4179/v1/ws?token=${authToken}`, {
      headers: { Origin: "http://127.0.0.1:4179" },
    });

    const receivedEvents: any[] = [];
    ws.on("message", (data) => {
      receivedEvents.push(JSON.parse(data.toString()));
    });

    await new Promise((resolve) => ws.on("open", resolve));

    // Initial handshake received
    expect(receivedEvents.length).toBeGreaterThanOrEqual(1);

    ws.close();
  });
});
