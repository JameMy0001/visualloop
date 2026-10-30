import {
  SessionHandle,
  SessionRegistration,
  ArtifactPublication,
  ArtifactRevisionRecord,
  FeedbackSubmission,
  FeedbackStatus,
  DeliveryReceipt,
} from "@visualloop/protocol";

export class CoreStore {
  private sessions = new Map<string, SessionHandle>();
  private artifacts = new Map<string, ArtifactPublication>();
  private revisions = new Map<string, ArtifactRevisionRecord[]>();
  private feedback = new Map<string, FeedbackSubmission>();
  private feedbackStatus = new Map<string, FeedbackStatus>();
  private idempotencyKeys = new Set<string>();

  // --- Session Management ---
  public registerSession(input: SessionRegistration): SessionHandle {
    const now = new Date().toISOString();
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const handle: SessionHandle = {
      sessionId,
      adapterId: input.adapterId,
      workspaceRoot: input.workspaceRoot,
      capabilities: input.capabilities || {
        supportsDirectInjection: false,
        supportsFilePolling: true,
        supportsStreaming: false,
        acceptedArtifactKinds: ["svg", "html"],
      },
      createdAt: now,
      lastActiveAt: now,
    };

    this.sessions.set(sessionId, handle);
    return handle;
  }

  public getSession(sessionId: string): SessionHandle | undefined {
    return this.sessions.get(sessionId);
  }

  // --- Artifact & Revision Management ---
  public publishArtifact(input: ArtifactPublication, contentHash: string): ArtifactRevisionRecord {
    const session = this.getSession(input.sessionId);
    if (!session) {
      throw new Error(`Unauthorized: Session ${input.sessionId} not found`);
    }

    const now = new Date().toISOString();
    const currentList = this.revisions.get(input.artifactId) || [];
    const revisionNumber = input.revision || currentList.length + 1;

    const revisionRecord: ArtifactRevisionRecord = {
      artifactId: input.artifactId,
      sessionId: input.sessionId,
      revision: revisionNumber,
      kind: input.kind,
      entrypoint: input.entrypoint,
      contentHash,
      viewport: input.viewport || {
        width: 1200,
        height: 800,
        devicePixelRatio: 1,
        zoom: 1,
        scrollX: 0,
        scrollY: 0,
      },
      createdAt: now,
    };

    this.artifacts.set(input.artifactId, input);
    currentList.push(revisionRecord);
    this.revisions.set(input.artifactId, currentList);

    return revisionRecord;
  }

  public getArtifact(artifactId: string): ArtifactPublication | undefined {
    return this.artifacts.get(artifactId);
  }

  public getRevisions(artifactId: string): ArtifactRevisionRecord[] {
    return this.revisions.get(artifactId) || [];
  }

  // --- Feedback Management ---
  public submitFeedback(submission: FeedbackSubmission): { submission: FeedbackSubmission; duplicate: boolean } {
    if (this.idempotencyKeys.has(submission.idempotencyKey)) {
      const existing = this.feedback.get(submission.feedbackId);
      if (existing) {
        return { submission: existing, duplicate: true };
      }
    }

    // Verify session
    const session = this.getSession(submission.sessionId);
    if (!session) {
      throw new Error(`Unauthorized: Session ${submission.sessionId} does not exist`);
    }

    this.idempotencyKeys.add(submission.idempotencyKey);
    this.feedback.set(submission.feedbackId, submission);
    this.feedbackStatus.set(submission.feedbackId, "submitted");

    return { submission, duplicate: false };
  }

  public getFeedback(feedbackId: string): FeedbackSubmission | undefined {
    return this.feedback.get(feedbackId);
  }

  public getLatestFeedback(sessionId: string): FeedbackSubmission | undefined {
    const sessionFeedback = Array.from(this.feedback.values()).filter(
      (f) => f.sessionId === sessionId
    );
    if (sessionFeedback.length === 0) return undefined;
    return sessionFeedback[sessionFeedback.length - 1];
  }

  public acknowledgeFeedback(feedbackId: string): DeliveryReceipt {
    const fb = this.feedback.get(feedbackId);
    if (!fb) {
      throw new Error(`Feedback ${feedbackId} not found`);
    }

    this.feedbackStatus.set(feedbackId, "acknowledged");
    return {
      feedbackId,
      sessionId: fb.sessionId,
      status: "acknowledged",
      deliveredAt: new Date().toISOString(),
      adapterMessage: "Feedback acknowledged by agent",
    };
  }

  public getStatus(feedbackId: string): FeedbackStatus | undefined {
    return this.feedbackStatus.get(feedbackId);
  }

  public clear(): void {
    this.sessions.clear();
    this.artifacts.clear();
    this.revisions.clear();
    this.feedback.clear();
    this.feedbackStatus.clear();
    this.idempotencyKeys.clear();
  }
}
