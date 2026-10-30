import {
  SessionRegistration,
  SessionHandle,
  ArtifactPublication,
  FeedbackSubmission,
  DeliveryReceipt,
  AgentCapabilities,
  ArtifactRevisionRecord,
} from "@visualloop/protocol";

export interface AgentAdapter {
  id: string;
  registerSession(input: SessionRegistration): Promise<SessionHandle>;
  publishArtifact(input: ArtifactPublication): Promise<ArtifactRevisionRecord | void>;
  deliverFeedback(input: FeedbackSubmission): Promise<DeliveryReceipt>;
  getCapabilities(): Promise<AgentCapabilities>;
}

export abstract class BaseAgentAdapter implements AgentAdapter {
  abstract id: string;
  abstract registerSession(input: SessionRegistration): Promise<SessionHandle>;
  abstract publishArtifact(input: ArtifactPublication): Promise<ArtifactRevisionRecord | void>;
  abstract deliverFeedback(input: FeedbackSubmission): Promise<DeliveryReceipt>;
  abstract getCapabilities(): Promise<AgentCapabilities>;
}
