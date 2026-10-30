import { ServerEvent, ServerEventSchema } from "@visualloop/protocol";

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";
export type EventListener = (event: ServerEvent) => void;
export type StatusListener = (status: ConnectionStatus) => void;

export class EventClient {
  private ws: WebSocket | null = null;
  private wsUrl: string;
  private token?: string;
  private eventListeners = new Set<EventListener>();
  private statusListeners = new Set<StatusListener>();
  private status: ConnectionStatus = "disconnected";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 20;
  private baseBackoffMs = 1000;
  private isExplicitlyClosed = false;

  constructor(wsUrl = "ws://127.0.0.1:4178/v1/ws", token?: string) {
    this.wsUrl = wsUrl;
    this.token = token;
  }

  public setToken(token: string | undefined): void {
    this.token = token;
  }

  public getStatus(): ConnectionStatus {
    return this.status;
  }

  public onEvent(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  public onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private setStatus(next: ConnectionStatus): void {
    if (this.status !== next) {
      this.status = next;
      for (const listener of this.statusListeners) {
        listener(next);
      }
    }
  }

  public connect(): void {
    if (typeof window === "undefined") return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isExplicitlyClosed = false;
    this.setStatus("connecting");

    const targetUrl = this.token
      ? `${this.wsUrl}?token=${encodeURIComponent(this.token)}`
      : this.wsUrl;

    try {
      this.ws = new WebSocket(targetUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.setStatus("connected");
      };

      this.ws.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data);
          const parsed = ServerEventSchema.safeParse(raw);
          if (parsed.success) {
            for (const listener of this.eventListeners) {
              listener(parsed.data);
            }
          } else {
            console.warn("[EventClient] Received non-conforming server event:", raw, parsed.error);
          }
        } catch (err) {
          console.warn("[EventClient] Failed to parse message:", err);
        }
      };

      this.ws.onclose = (event) => {
        this.ws = null;
        this.setStatus("disconnected");

        if (!this.isExplicitlyClosed) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (err) => {
        this.setStatus("error");
      };
    } catch (err) {
      this.setStatus("error");
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.isExplicitlyClosed) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(
        this.baseBackoffMs * Math.pow(1.5, this.reconnectAttempts),
        10000
      );
      this.reconnectTimer = setTimeout(() => {
        this.connect();
      }, delay);
    }
  }

  public disconnect(): void {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus("disconnected");
  }
}

export const eventClient = new EventClient();
