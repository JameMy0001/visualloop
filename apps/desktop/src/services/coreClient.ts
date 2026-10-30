import { FeedbackSubmission, SessionHandle } from "@visualloop/protocol";

export interface ServiceHealth {
  status: string;
  version: string;
  clientsConnected: number;
}

export interface ActiveArtifactInfo {
  sessionId: string;
  artifactId: string;
  revision: number;
  kind: "svg" | "html";
  title?: string;
  entrypoint: string;
  content?: string;
}

export interface RuntimeSnapshot {
  activeSessionId: string | null;
  activeArtifact: ActiveArtifactInfo | null;
  sessions: SessionHandle[];
}

export interface FeedbackReceipt {
  feedbackId: string;
  status: string;
  duplicate?: boolean;
}

export class CoreClient {
  private baseUrl: string;
  private token?: string;

  constructor(baseUrl = "http://127.0.0.1:4178", token?: string) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  public setToken(token: string | undefined): void {
    this.token = token;
  }

  private async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };
    if (this.token) {
      headers["x-visualloop-token"] = this.token;
      headers["Authorization"] = `Bearer ${this.token}`;
    }
    return fetch(url, { ...options, headers });
  }

  public async getHealth(): Promise<ServiceHealth> {
    const res = await this.fetchWithAuth(`${this.baseUrl}/v1/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`Health check failed: HTTP ${res.status}`);
    return res.json();
  }

  public async getState(): Promise<RuntimeSnapshot> {
    const res = await this.fetchWithAuth(`${this.baseUrl}/v1/state`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`Get state failed: HTTP ${res.status}`);
    return res.json();
  }

  public async submitFeedback(submission: FeedbackSubmission): Promise<FeedbackReceipt> {
    const res = await this.fetchWithAuth(`${this.baseUrl}/v1/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(submission),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Feedback submission failed: HTTP ${res.status}`);
    }
    return res.json();
  }

  public async acknowledgeFeedback(feedbackId: string): Promise<any> {
    const res = await this.fetchWithAuth(`${this.baseUrl}/v1/feedback/${feedbackId}/ack`, {
      method: "POST",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`Feedback acknowledgement failed: HTTP ${res.status}`);
    return res.json();
  }
}

export const coreClient = new CoreClient();
