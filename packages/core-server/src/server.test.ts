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

  it("reads and updates provider configuration via /v1/config/provider", async () => {
    const authHeaders = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${authToken}`,
    };

    // 1. GET current provider config
    const getRes = await fetch(`${baseUrl}/v1/config/provider`, {
      headers: authHeaders,
    });
    expect(getRes.status).toBe(200);
    const initialConfig = await getRes.json();
    expect(initialConfig.provider).toBeDefined();
    expect(initialConfig.model).toBeDefined();
    expect(typeof initialConfig.hasApiKey).toBe("boolean");
    expect(typeof initialConfig.maskedApiKey).toBe("string");

    // 2. POST update provider to openai
    const postRes = await fetch(`${baseUrl}/v1/config/provider`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        provider: "openai",
        model: "gpt-4o",
        apiKey: "sk-proj-test1234567890abcdef",
      }),
    });
    expect(postRes.status).toBe(200);
    const updated = await postRes.json();
    expect(updated.success).toBe(true);
    expect(updated.provider).toBe("openai");
    expect(updated.model).toBe("gpt-4o");
    expect(updated.hasApiKey).toBe(true);
    expect(updated.maskedApiKey).toContain("••••••••");
    expect(updated.maskedApiKey).not.toBe("sk-proj-test1234567890abcdef");

    // 3. Confirm GET reflects updated configuration and masks key
    const checkRes = await fetch(`${baseUrl}/v1/config/provider`, {
      headers: authHeaders,
    });
    expect(checkRes.status).toBe(200);
    const checked = await checkRes.json();
    expect(checked.provider).toBe("openai");
    expect(checked.model).toBe("gpt-4o");
    expect(checked.hasApiKey).toBe(true);
    expect(checked.maskedApiKey).toBe(updated.maskedApiKey);
  });

  it("handles CORS preflight OPTIONS requests and sets Access-Control headers for Tauri", async () => {
    // 1. Preflight OPTIONS request from tauri://localhost without auth header
    const preflightRes = await fetch(`${baseUrl}/v1/feedback`, {
      method: "OPTIONS",
      headers: {
        Origin: "tauri://localhost",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type,x-visualloop-token",
      },
    });
    expect(preflightRes.status).toBe(204);
    expect(preflightRes.headers.get("access-control-allow-origin")).toBe("tauri://localhost");
    expect(preflightRes.headers.get("access-control-allow-methods")).toContain("POST");
    expect(preflightRes.headers.get("access-control-allow-headers")).toContain("Authorization");

    // 2. Preflight from untrusted origin is rejected with 403
    const badOriginRes = await fetch(`${baseUrl}/v1/feedback`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://malicious-site.com",
        "Access-Control-Request-Method": "POST",
      },
    });
    expect(badOriginRes.status).toBe(403);

    // 3. Standard GET request receives Access-Control-Allow-Origin header
    const healthRes = await fetch(`${baseUrl}/v1/health`, {
      headers: { Origin: "tauri://localhost" },
    });
    expect(healthRes.status).toBe(200);
    expect(healthRes.headers.get("access-control-allow-origin")).toBe("tauri://localhost");
  });
});
