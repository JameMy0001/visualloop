import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import { CoreServer } from "./server.js";
import { isValidOrigin } from "./security.js";

describe("Security Validation & Negative Testing", () => {
  describe("Exact Origin Validation", () => {
    it("allows non-browser requests without origin", () => {
      expect(isValidOrigin(undefined)).toBe(true);
      expect(isValidOrigin("")).toBe(true);
    });

    it("allows opaque null origin for sandboxed iframes", () => {
      expect(isValidOrigin("null")).toBe(true);
    });

    it("allows legitimate local development origins", () => {
      expect(isValidOrigin("http://localhost:5173")).toBe(true);
      expect(isValidOrigin("http://127.0.0.1:4178")).toBe(true);
      expect(isValidOrigin("http://[::1]:5173")).toBe(true);
      expect(isValidOrigin("tauri://localhost")).toBe(true);
      expect(isValidOrigin("http://tauri.localhost")).toBe(true);
    });

    it("strictly rejects spoofed or substring-matched origins", () => {
      expect(isValidOrigin("http://attacker-localhost.com")).toBe(false);
      expect(isValidOrigin("http://127.0.0.1.attacker.net")).toBe(false);
      expect(isValidOrigin("http://localhost.evil.com")).toBe(false);
      expect(isValidOrigin("http://evil-tauri.localhost")).toBe(false);
      expect(isValidOrigin("https://evil.org")).toBe(false);
      expect(isValidOrigin("tauri://attacker.com")).toBe(false);
      expect(isValidOrigin("tauri://evil.com/path")).toBe(false);
      expect(isValidOrigin("http://tauri.localhost.attacker.com")).toBe(false);
      expect(isValidOrigin("http://tauri.localhost:8080.attacker.com")).toBe(false);
      expect(isValidOrigin("https://tauri.localhost.evil.com")).toBe(false);
    });

    it("rejects non-http/https protocols", () => {
      expect(isValidOrigin("javascript:alert(1)")).toBe(false);
      expect(isValidOrigin("data:text/html,<b>xss</b>")).toBe(false);
      expect(isValidOrigin("ftp://localhost")).toBe(false);
    });
  });

  describe("API and WebSocket Authentication & Boundary Enforcement", () => {
    let server: CoreServer;
    let baseUrl: string;
    const testSecret = "test_secure_token_999";

    beforeAll(async () => {
      server = new CoreServer({
        port: 4185,
        host: "127.0.0.1",
        secretToken: testSecret,
        requireAuth: true,
      });
      baseUrl = await server.start();
    });

    afterAll(async () => {
      await server.stop();
    });

    it("permits unauthenticated access to /v1/health for health probes", async () => {
      const res = await fetch(`${baseUrl}/v1/health`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("ok");
    });

    it("rejects unauthenticated requests to sensitive API endpoints with 401", async () => {
      const res = await fetch(`${baseUrl}/v1/state`);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain("Unauthorized");
    });

    it("rejects invalid secret tokens with 401", async () => {
      const res = await fetch(`${baseUrl}/v1/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-VisualLoop-Token": "wrong_token",
        },
        body: JSON.stringify({ adapterId: "test", agentName: "test", workspaceRoot: "/tmp" }),
      });
      expect(res.status).toBe(401);
    });

    it("accepts valid secret token via header or Bearer authorization", async () => {
      const res = await fetch(`${baseUrl}/v1/state`, {
        headers: {
          "X-VisualLoop-Token": testSecret,
        },
      });
      expect(res.status).toBe(200);

      const bearerRes = await fetch(`${baseUrl}/v1/state`, {
        headers: {
          Authorization: `Bearer ${testSecret}`,
        },
      });
      expect(bearerRes.status).toBe(200);
    });

    it("rejects cross-origin requests from untrusted origins with 403 Forbidden", async () => {
      const res = await fetch(`${baseUrl}/v1/state`, {
        headers: {
          Origin: "http://attacker-localhost.com",
          "X-VisualLoop-Token": testSecret,
        },
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("Forbidden");
    });

    it("rejects WebSocket connection from untrusted origin", async () => {
      await new Promise<void>((resolve) => {
        const ws = new WebSocket(`${baseUrl.replace("http", "ws")}/v1/ws?token=${testSecret}`, {
          headers: { Origin: "http://malicious-site.com" },
        });

        ws.on("unexpected-response", (req, res) => {
          expect(res.statusCode).toBe(1008);
          resolve();
        });

        ws.on("close", (code) => {
          expect(code).toBe(1008);
          resolve();
        });

        ws.on("open", () => {
          ws.close();
        });
      });
    });

    it("rejects WebSocket connection without required token", async () => {
      await new Promise<void>((resolve) => {
        const ws = new WebSocket(`${baseUrl.replace("http", "ws")}/v1/ws`, {
          headers: { Origin: "http://localhost:5173" },
        });

        ws.on("close", (code) => {
          expect(code).toBe(1008);
          resolve();
        });

        ws.on("open", () => {
          ws.close();
        });
      });
    });

    it("allows WebSocket connection with valid token and origin", async () => {
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(
          `${baseUrl.replace("http", "ws")}/v1/ws?token=${testSecret}`,
          {
            headers: { Origin: "http://localhost:5173" },
          }
        );

        ws.on("message", (data) => {
          const parsed = JSON.parse(data.toString());
          if (parsed.type === "state.snapshot") {
            ws.close();
            resolve();
          }
        });

        ws.on("error", reject);
      });
    });
  });

  describe("Workspace Asset Upload Path Traversal Prevention (Issue 1 Regression)", () => {
    let server: CoreServer;
    let baseUrl: string;
    const testSecret = "sec_upload_test_token";

    beforeAll(async () => {
      server = new CoreServer({
        port: 4186,
        host: "127.0.0.1",
        secretToken: testSecret,
        requireAuth: true,
      });
      baseUrl = await server.start();
    });

    afterAll(async () => {
      await server.stop();
    });

    it("strictly rejects path traversal attempts with ../ in filename", async () => {
      const res = await fetch(`${baseUrl}/v1/workspace/upload-asset`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-VisualLoop-Token": testSecret,
        },
        body: JSON.stringify({
          filename: "../../../etc/cron.d/malicious.sh",
          content: "echo hacked",
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("path traversal");
    });

    it("strictly rejects absolute path and slash traversal attempts", async () => {
      const res = await fetch(`${baseUrl}/v1/workspace/upload-asset`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-VisualLoop-Token": testSecret,
        },
        body: JSON.stringify({
          filename: "/tmp/evil.svg",
          content: "<svg><text>evil</text></svg>",
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("path traversal");
    });

    it("rejects unsupported extensions (e.g. .exe, .sh)", async () => {
      const res = await fetch(`${baseUrl}/v1/workspace/upload-asset`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-VisualLoop-Token": testSecret,
        },
        body: JSON.stringify({
          filename: "malware.exe",
          content: "MZ...",
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Unsupported file extension");
    });

    it("accepts valid SVG file inside upload directory", async () => {
      const res = await fetch(`${baseUrl}/v1/workspace/upload-asset`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-VisualLoop-Token": testSecret,
        },
        body: JSON.stringify({
          filename: "test_graphic.svg",
          content: "<svg viewBox='0 0 100 100'><circle cx='50' cy='50' r='40' /></svg>",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.publication.title).toBe("test_graphic.svg");
      expect(data.publication.entrypoint).toContain(".visualloop_uploads");
    });
  });
});
