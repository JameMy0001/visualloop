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
} from "@visualloop/protocol";

export class CodexAdapter extends BaseAgentAdapter implements AgentAdapter {
  id = "codex";

  async registerSession(input: SessionRegistration): Promise<SessionHandle> {
    const now = new Date().toISOString();
    return {
      sessionId: `sess_codex_${Date.now()}`,
      adapterId: this.id,
      workspaceRoot: input.workspaceRoot,
      capabilities: await this.getCapabilities(),
      createdAt: now,
      lastActiveAt: now,
    };
  }

  async publishArtifact(input: ArtifactPublication): Promise<void> {
    console.info(`[CodexAdapter] Published artifact ${input.artifactId}`);
  }

  async deliverFeedback(input: FeedbackSubmission): Promise<DeliveryReceipt> {
    return {
      feedbackId: input.feedbackId,
      sessionId: input.sessionId,
      status: "delivered",
      deliveredAt: new Date().toISOString(),
      adapterMessage: "Delivered feedback to Codex adapter queue",
    };
  }

  async getCapabilities(): Promise<AgentCapabilities> {
    return {
      supportsDirectInjection: false,
      supportsFilePolling: true,
      supportsStreaming: false,
      acceptedArtifactKinds: ["svg", "html"],
    };
  }
}
