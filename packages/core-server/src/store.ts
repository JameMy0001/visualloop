import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  SessionHandle,
  SessionRegistration,
  ArtifactPublication,
  ArtifactRevisionRecord,
  FeedbackSubmission,
  FeedbackStatus,
  DeliveryReceipt,
} from "@visualloop/protocol";

export interface RuntimeSnapshot {
  activeSessionId: string | null;
  activeArtifact: {
    sessionId: string;
    artifactId: string;
    revision: number;
    kind: "svg" | "html";
    title?: string;
    entrypoint: string;
    content?: string;
  } | null;
  sessions: SessionHandle[];
}

export interface CoreStoreOptions {
  storageFilePath?: string | null;
}

export class CoreStore {
  private sessions = new Map<string, SessionHandle>();
  private artifacts = new Map<string, ArtifactPublication>();
  private revisions = new Map<string, ArtifactRevisionRecord[]>();
  private feedback = new Map<string, FeedbackSubmission>();
  private feedbackStatus = new Map<string, FeedbackStatus>();
  private idempotencyKeys = new Set<string>();

  private activeSessionId: string | null = null;
  private activeArtifact: RuntimeSnapshot["activeArtifact"] = null;
  private storageFilePath: string | null = null;

  constructor(options: CoreStoreOptions = {}) {
    if (options.storageFilePath === null) {
      this.storageFilePath = null;
    } else if (typeof options.storageFilePath === "string") {
      this.storageFilePath = options.storageFilePath;
    } else {
      // Default: persist to ~/.visualloop/store.json
      this.storageFilePath = path.join(os.homedir(), ".visualloop", "store.json");
    }

    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    if (!this.storageFilePath) return;
    try {
      if (fs.existsSync(this.storageFilePath)) {
        const raw = fs.readFileSync(this.storageFilePath, "utf-8");
        const data = JSON.parse(raw);

        if (Array.isArray(data.sessions)) {
          for (const s of data.sessions) this.sessions.set(s.sessionId, s);
        }
        if (Array.isArray(data.artifacts)) {
          for (const a of data.artifacts) this.artifacts.set(a.artifactId, a);
        }
        if (data.revisions && typeof data.revisions === "object") {
          for (const [k, v] of Object.entries(data.revisions)) {
            if (Array.isArray(v)) this.revisions.set(k, v as ArtifactRevisionRecord[]);
          }
        }
        if (Array.isArray(data.feedback)) {
          for (const f of data.feedback) this.feedback.set(f.feedbackId, f);
        }
        if (data.feedbackStatus && typeof data.feedbackStatus === "object") {
          for (const [k, v] of Object.entries(data.feedbackStatus)) {
            this.feedbackStatus.set(k, v as FeedbackStatus);
          }
        }
        if (Array.isArray(data.idempotencyKeys)) {
          for (const k of data.idempotencyKeys) this.idempotencyKeys.add(k);
        }
        if (typeof data.activeSessionId === "string") {
          this.activeSessionId = data.activeSessionId;
        }
        if (data.activeArtifact) {
          this.activeArtifact = data.activeArtifact;
        }
      }
    } catch (err) {
      console.warn("[CoreStore] Failed to load store from disk, starting fresh:", err);
    }
  }

  private saveToDisk(): void {
    if (!this.storageFilePath) return;
    try {
      const dir = path.dirname(this.storageFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const serialized = JSON.stringify(
        {
          sessions: Array.from(this.sessions.values()),
          artifacts: Array.from(this.artifacts.values()),
          revisions: Object.fromEntries(this.revisions.entries()),
          feedback: Array.from(this.feedback.values()),
          feedbackStatus: Object.fromEntries(this.feedbackStatus.entries()),
          idempotencyKeys: Array.from(this.idempotencyKeys.values()),
          activeSessionId: this.activeSessionId,
          activeArtifact: this.activeArtifact,
        },
        null,
        2
      );

      // Atomic write via temp file
      const tempPath = `${this.storageFilePath}.tmp.${Date.now()}`;
      fs.writeFileSync(tempPath, serialized, "utf-8");
      fs.renameSync(tempPath, this.storageFilePath);
    } catch (err) {
      console.warn("[CoreStore] Failed to persist state to disk:", err);
    }
  }

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
    this.activeSessionId = sessionId;
    this.saveToDisk();
    return handle;
  }

  public getSession(sessionId: string): SessionHandle | undefined {
    return this.sessions.get(sessionId);
  }

  public getAllSessions(): SessionHandle[] {
    return Array.from(this.sessions.values());
  }

  // --- Artifact & Revision Management ---
  public publishArtifact(
    input: ArtifactPublication,
    contentHash: string,
    sanitizedContent?: string
  ): ArtifactRevisionRecord {
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

    this.activeSessionId = input.sessionId;
    this.activeArtifact = {
      sessionId: input.sessionId,
      artifactId: input.artifactId,
      revision: revisionNumber,
      kind: input.kind,
      title: input.title || path.basename(input.entrypoint),
      entrypoint: input.entrypoint,
      content: sanitizedContent || input.content,
    };

    this.saveToDisk();
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
    this.feedbackStatus.set(submission.feedbackId, "queued");

    this.saveToDisk();
    return { submission, duplicate: false };
  }

  public getFeedback(feedbackId: string): FeedbackSubmission | undefined {
    return this.feedback.get(feedbackId);
  }

  public getPendingFeedback(sessionId: string): FeedbackSubmission[] {
    return Array.from(this.feedback.values()).filter(
      (f) => f.sessionId === sessionId && this.feedbackStatus.get(f.feedbackId) === "queued"
    );
  }

  public getNextPendingFeedback(sessionId: string): FeedbackSubmission | undefined {
    const pending = this.getPendingFeedback(sessionId);
    return pending.length > 0 ? pending[0] : undefined;
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
    this.saveToDisk();

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

  public getSnapshot(): RuntimeSnapshot {
    return {
      activeSessionId: this.activeSessionId,
      activeArtifact: this.activeArtifact,
      sessions: this.getAllSessions(),
    };
  }

  public clear(): void {
    this.sessions.clear();
    this.artifacts.clear();
    this.revisions.clear();
    this.feedback.clear();
    this.feedbackStatus.clear();
    this.idempotencyKeys.clear();
    this.activeSessionId = null;
    this.activeArtifact = null;

    if (this.storageFilePath && fs.existsSync(this.storageFilePath)) {
      try {
        fs.unlinkSync(this.storageFilePath);
      } catch {
        // ignore
      }
    }
  }
}
