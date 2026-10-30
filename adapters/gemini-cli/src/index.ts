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

  /**
   * Transparent fallback: writes structured feedback to a local JSON file
   * for agents without direct WebSocket listeners.
   */
  public writeFeedbackFile(input: FeedbackSubmission, outputDir: string = "."): string {
    const outPath = path.resolve(outputDir, "visualloop-feedback.json");
    fs.writeFileSync(outPath, JSON.stringify(input, null, 2), "utf-8");
    return outPath;
  }

  /**
   * Formats structured annotations and user instructions into an actionable prompt
   * for the LLM to execute during the next turn.
   */
  public formatFeedbackPrompt(input: FeedbackSubmission): string {
    const lines: string[] = [
      `=== VISUALLOOP USER FEEDBACK ===`,
      `Artifact: ${input.artifactId} (Revision ${input.revision})`,
      `Canvas Viewport: ${input.viewport.width}x${input.viewport.height}`,
      `Total Annotations: ${input.annotations.length}`,
      "",
    ];

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
