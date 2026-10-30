import {
  SessionRegistration,
  SessionHandle,
  ArtifactPublication,
  FeedbackSubmission,
  DeliveryReceipt,
  AgentCapabilities,
} from "@visualloop/protocol";

export interface AgentAdapter {
  id: string;
  registerSession(input: SessionRegistration): Promise<SessionHandle>;
  publishArtifact(input: ArtifactPublication): Promise<void>;
  deliverFeedback(input: FeedbackSubmission): Promise<DeliveryReceipt>;
  getCapabilities(): Promise<AgentCapabilities>;
}

export abstract class BaseAgentAdapter implements AgentAdapter {
  abstract id: string;
  abstract registerSession(input: SessionRegistration): Promise<SessionHandle>;
  abstract publishArtifact(input: ArtifactPublication): Promise<void>;
  abstract deliverFeedback(input: FeedbackSubmission): Promise<DeliveryReceipt>;
  abstract getCapabilities(): Promise<AgentCapabilities>;
}
