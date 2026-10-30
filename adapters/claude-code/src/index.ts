import {
  AgentAdapter,
  BaseAgentAdapter,
  UnsupportedCapabilityError,
} from "@visualloop/agent-sdk";
import {
  SessionRegistration,
  SessionHandle,
  ArtifactPublication,
  FeedbackSubmission,
  DeliveryReceipt,
  AgentCapabilities,
} from "@visualloop/protocol";

export class ClaudeCodeAdapter extends BaseAgentAdapter implements AgentAdapter {
  id = "claude-code";

  async registerSession(input: SessionRegistration): Promise<SessionHandle> {
    const now = new Date().toISOString();
    return {
      sessionId: `sess_claude_${Date.now()}`,
      adapterId: this.id,
      workspaceRoot: input.workspaceRoot,
      capabilities: await this.getCapabilities(),
      createdAt: now,
      lastActiveAt: now,
    };
  }

  async publishArtifact(input: ArtifactPublication): Promise<void> {
    console.info(`[ClaudeCodeAdapter] Artifact publication registered for ${input.artifactId}`);
  }

  async deliverFeedback(input: FeedbackSubmission): Promise<DeliveryReceipt> {
    throw new UnsupportedCapabilityError(
      "Claude Code automated feedback delivery is currently experimental. Please use Gemini CLI adapter or export feedback JSON."
    );
  }

  async getCapabilities(): Promise<AgentCapabilities> {
    return {
      supportsDirectInjection: false,
      supportsFilePolling: false,
      supportsStreaming: false,
      acceptedArtifactKinds: ["svg", "html"],
    };
  }
}
