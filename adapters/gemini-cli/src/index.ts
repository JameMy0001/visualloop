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

  public async getPendingFeedback(sessionId: string): Promise<FeedbackSubmission[]> {
    try {
      const res = await fetch(
        `${this.serverUrl}/v1/feedback/pending?sessionId=${encodeURIComponent(sessionId)}`,
        { headers: this.getHeaders() }
      );
      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data.pending) ? data.pending : [];
      }
    } catch (e) {
      // fallback to latest
    }
    const latest = await this.getLatestFeedback(sessionId);
    return latest ? [latest] : [];
  }

  /**
   * Watches for new incoming feedback on the session, processes it in FIFO order,
   * and acknowledges each feedback only after the callback resolves successfully.
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
        const pendingList = await this.getPendingFeedback(sessionId);
        for (const item of pendingList) {
          if (!isRunning) break;
          if (this.acknowledgedFeedbackIds.has(item.feedbackId)) continue;

          // Process feedback callback first
          await onFeedback(item);

          // Acknowledge receipt only after processing succeeds
          await this.acknowledgeFeedback(item.feedbackId);
          this.acknowledgedFeedbackIds.add(item.feedbackId);
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

  /**
   * Directly invokes Google Gemini AI model to modify the source code
   * according to user annotations and visual screenshot.
   */
  public async generateRevisionWithGemini(options: {
    sourceCode: string;
    feedback: FeedbackSubmission;
    apiKey?: string;
    model?: string;
  }): Promise<{ revisedCode: string; modelUsed: string }> {
    const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
    const model = options.model || process.env.GEMINI_MODEL || "gemini-2.5-flash";

    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY environment variable is required to generate revisions with the real Gemini AI model. Please set GEMINI_API_KEY and retry."
      );
    }

    const promptText = [
      `You are an expert software engineer and UI designer.`,
      `The user has reviewed the visual artifact and provided visual annotations and instructions.`,
      ``,
      `--- CURRENT SOURCE CODE ---`,
      options.sourceCode,
      `--- END CURRENT SOURCE CODE ---`,
      ``,
      `--- USER INSTRUCTIONS ---`,
      this.formatFeedbackPrompt(options.feedback),
      `--- END USER INSTRUCTIONS ---`,
      ``,
      `Please modify the source code strictly according to the user visual annotations and instructions.`,
      `Return ONLY the complete updated source code inside a single markdown code block (e.g. \`\`\`xml or \`\`\`svg or \`\`\`html).`,
      `Do not include conversational preamble or explanation.`,
    ].join("\n");

    const parts: any[] = [{ text: promptText }];

    // Attach multimodal annotated screenshot if available
    if (options.feedback.annotatedScreenshotDataUrl) {
      const match = options.feedback.annotatedScreenshotDataUrl.match(
        /^data:([^;]+);base64,(.+)$/
      );
      if (match) {
        parts.push({
          inlineData: {
            mimeType: match[1],
            data: match[2],
          },
        });
      }
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }] }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error (HTTP ${response.status}): ${errText}`);
    }

    const data = (await response.json()) as any;
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!candidateText) {
      throw new Error("Gemini API returned empty text response.");
    }

    const codeBlockMatch = candidateText.match(/```(?:xml|svg|html|tsx|jsx)?\s*([\s\S]*?)```/);
    const revisedCode = codeBlockMatch ? codeBlockMatch[1].trim() : candidateText.trim();

    if (!revisedCode || revisedCode.length === 0) {
      throw new Error("Model generated empty code output.");
    }

    // Safety validation against corrupt code output
    const isSvg = options.sourceCode.trim().startsWith("<svg") || options.sourceCode.includes("<svg");
    if (isSvg) {
      if (!revisedCode.includes("<svg") || !revisedCode.includes("</svg>")) {
        throw new Error(
          "Model generated invalid SVG: output does not contain valid <svg> ... </svg> root tags."
        );
      }
    }

    return { revisedCode, modelUsed: model };
  }

  public getSession(): SessionHandle | undefined {
    return this.activeSession;
  }
}
