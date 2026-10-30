import { WebSocketServer, WebSocket } from "ws";
import { ServerEvent, ServerEventSchema } from "@visualloop/protocol";

function isValidOrigin(origin?: string): boolean {
  if (!origin || origin === "null") return true;
  if (origin.startsWith("tauri://")) return true;
  try {
    const parsed = new URL(origin);
    return (
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "::1"
    );
  } catch {
    return false;
  }
}

export class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();

  public initialize(server: any, secretToken?: string): void {
    this.wss = new WebSocketServer({ server, path: "/v1/ws" });

    this.wss.on("connection", (ws, req) => {
      // 1. Validate Origin header to prevent CSRF / unauthorized remote web connections
      const origin = req.headers.origin;
      if (!isValidOrigin(origin)) {
        console.warn(`[WebSocket] Rejected unauthorized connection from origin: ${origin}`);
        ws.close(1008, "Unauthorized origin");
        return;
      }

      // 2. Validate Secret Token authentication if server is configured with a token
      if (secretToken) {
        let providedToken: string | null = null;
        try {
          const reqUrl = new URL(req.url || "", "http://127.0.0.1");
          providedToken = reqUrl.searchParams.get("token");
        } catch {
          // ignore url parse error
        }

        if (!providedToken) {
          const headerAuth = req.headers["x-visualloop-token"] || req.headers.authorization;
          if (typeof headerAuth === "string") {
            providedToken = headerAuth.startsWith("Bearer ")
              ? headerAuth.slice(7).trim()
              : headerAuth;
          }
        }

        if (providedToken !== secretToken) {
          console.warn("[WebSocket] Rejected connection with invalid or missing secret token");
          ws.close(1008, "Unauthorized: Invalid secret token");
          return;
        }
      }

      this.clients.add(ws);

      ws.on("close", () => {
        this.clients.delete(ws);
      });

      ws.on("error", (err) => {
        console.error("[WebSocket] Client error:", err);
        this.clients.delete(ws);
      });

      // Send initial connection handshake
      ws.send(
        JSON.stringify({
          type: "session.registered",
          timestamp: new Date().toISOString(),
          payload: {
            sessionId: "system_ready",
            adapterId: "visualloop-core",
            workspaceRoot: "/",
            capabilities: {
              supportsDirectInjection: false,
              supportsFilePolling: true,
              supportsStreaming: false,
              acceptedArtifactKinds: ["svg", "html"],
            },
            createdAt: new Date().toISOString(),
            lastActiveAt: new Date().toISOString(),
          },
        })
      );
    });
  }

  public broadcast(event: ServerEvent): void {
    const validated = ServerEventSchema.parse(event);
    const data = JSON.stringify(validated);

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  public getClientCount(): number {
    return this.clients.size;
  }

  public close(): void {
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }
}
