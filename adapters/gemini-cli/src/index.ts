import fs from "node:fs";
import path from "node:path";
import {
  AgentAdapter,
  BaseAgentAdapter,
} from "@visualloop/agent-sdk";
import {
  SessionRegistration,
  SessionHandle,
  ArtifactPublication,
  FeedbackSubmission,
  DeliveryReceipt,
  AgentCapabilities,
  ArtifactRevisionRecord,
} from "@visualloop/protocol";

export interface GeminiAdapterConfig {
  serverUrl?: string;
  secretToken?: string;
}

export class GeminiCliAdapter extends BaseAgentAdapter implements AgentAdapter {
  public id = "gemini-cli";
  private serverUrl: string;
  private secretToken?: string;
  private activeSession?: SessionHandle;
  private acknowledgedFeedbackIds = new Set<string>();

  constructor(config: GeminiAdapterConfig = {}) {
    super();
    this.serverUrl = config.serverUrl || "http://127.0.0.1:4178";
    this.secretToken = config.secretToken;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.secretToken) {
      headers["X-VisualLoop-Token"] = this.secretToken;
      headers["Authorization"] = `Bearer ${this.secretToken}`;
    }
    return headers;
  }

  public async registerSession(input: SessionRegistration): Promise<SessionHandle> {
    const res = await fetch(`${this.serverUrl}/v1/sessions`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to register Gemini CLI session: ${err}`);
    }

    this.activeSession = (await res.json()) as SessionHandle;
    return this.activeSession;
  }

  public async publishArtifact(input: ArtifactPublication): Promise<ArtifactRevisionRecord> {
    const res = await fetch(`${this.serverUrl}/v1/artifacts`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to publish artifact: ${err}`);
    }

    return (await res.json()) as ArtifactRevisionRecord;
  }

  public async deliverFeedback(input: FeedbackSubmission): Promise<DeliveryReceipt> {
    // 1. Deliver to Core Server API
    const res = await fetch(`${this.serverUrl}/v1/feedback`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to deliver feedback: ${err}`);
    }

    // 2. Also write structured fallback file to disk
    this.writeFeedbackFile(input);

    return {
      feedbackId: input.feedbackId,
      sessionId: input.sessionId,
      status: "delivered",
      deliveredAt: new Date().toISOString(),
      adapterMessage: "Feedback delivered to Gemini CLI and written to visualloop-feedback.json",
    };
  }

  public async acknowledgeFeedback(feedbackId: string): Promise<DeliveryReceipt> {
    const res = await fetch(`${this.serverUrl}/v1/feedback/${feedbackId}/ack`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to acknowledge feedback: ${err}`);
    }

    this.acknowledgedFeedbackIds.add(feedbackId);
    return (await res.json()) as DeliveryReceipt;
  }

  public async getLatestFeedback(sessionId: string): Promise<FeedbackSubmission | null> {
    const res = await fetch(
      `${this.serverUrl}/v1/feedback/latest?sessionId=${encodeURIComponent(sessionId)}`,
      {
        headers: this.getHeaders(),
      }
    );

    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to fetch latest feedback: ${res.statusText}`);

    return (await res.json()) as FeedbackSubmission;
  }

  /**
   * Watches for new incoming feedback on the session, processes it, and acknowledges it.
   */
  public watchFeedback(
    sessionId: string,
    onFeedback: (feedback: FeedbackSubmission) => Promise<void>,
    pollIntervalMs = 800
  ): () => void {
    let isRunning = true;

    const poll = async () => {
      if (!isRunning) return;
      try {
        const latest = await this.getLatestFeedback(sessionId);
        if (latest && !this.acknowledgedFeedbackIds.has(latest.feedbackId)) {
          this.acknowledgedFeedbackIds.add(latest.feedbackId);
          await onFeedback(latest);
          await this.acknowledgeFeedback(latest.feedbackId);
        }
      } catch (err) {
        // Silently continue polling on transient connection hiccups
      }

      if (isRunning) {
        setTimeout(poll, pollIntervalMs);
      }
    };

    poll();

    return () => {
      isRunning = false;
    };
  }

  /**
   * Writes structured feedback to a local JSON file for agents that read from disk.
   */
  public writeFeedbackFile(input: FeedbackSubmission, outputDir: string = "."): string {
    const outPath = path.resolve(outputDir, "visualloop-feedback.json");
    fs.writeFileSync(outPath, JSON.stringify(input, null, 2), "utf-8");
    return outPath;
  }

  /**
   * Formats structured annotations and user instructions into an actionable prompt
   * for the LLM agent turn.
   */
  public formatFeedbackPrompt(input: FeedbackSubmission): string {
    const lines: string[] = [
      `=== VISUALLOOP USER FEEDBACK ===`,
      `Artifact: ${input.artifactId} (Revision ${input.revision})`,
      `Canvas Viewport: ${input.viewport.width}x${input.viewport.height}`,
      `Total Visual Annotations: ${input.annotations.length}`,
      "",
    ];

    if (input.annotations.length > 0) {
      input.annotations.forEach((ann, idx) => {
        const bx = Math.round(ann.bounds.x * 100);
        const by = Math.round(ann.bounds.y * 100);
        const bw = Math.round(ann.bounds.width * 100);
        const bh = Math.round(ann.bounds.height * 100);
        lines.push(
          `#${idx + 1} [${ann.type.toUpperCase()}] at ~${bx}%, ${by}% (area: ${bw}% x ${bh}%):`
        );
        lines.push(`   Instruction: "${ann.instruction}"`);
      });
    }

    if (input.generalInstruction) {
      lines.push("");
      lines.push(`General Direction: "${input.generalInstruction}"`);
    }

    lines.push("");
    lines.push(
      `Please apply these visual changes directly to the source file and publish Revision ${
        input.revision + 1
      }.`
    );
    lines.push(`================================`);

    return lines.join("\n");
  }

  public async getCapabilities(): Promise<AgentCapabilities> {
    return {
      supportsDirectInjection: false,
      supportsFilePolling: true,
      supportsStreaming: false,
      acceptedArtifactKinds: ["svg", "html"],
    };
  }

  public getSession(): SessionHandle | undefined {
    return this.activeSession;
  }
}
