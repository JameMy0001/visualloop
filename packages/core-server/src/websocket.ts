import { WebSocketServer, WebSocket } from "ws";
import { ServerEvent, ServerEventSchema } from "@visualloop/protocol";

export class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();

  public initialize(server: any): void {
    this.wss = new WebSocketServer({ server, path: "/v1/ws" });

    this.wss.on("connection", (ws, req) => {
      // Validate Origin header to prevent CSRF / unauthorized remote connections
      const origin = req.headers.origin;
      if (origin && !origin.includes("127.0.0.1") && !origin.includes("localhost") && !origin.startsWith("tauri://")) {
        console.warn(`[WebSocket] Rejected unauthorized connection from origin: ${origin}`);
        ws.close(1008, "Unauthorized origin");
        return;
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
