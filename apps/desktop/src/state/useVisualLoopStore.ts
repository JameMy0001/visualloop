import { useState, useEffect, useCallback } from "react";
import { SessionHandle, ServerEvent } from "@visualloop/protocol";
import { coreClient, ActiveArtifactInfo } from "../services/coreClient";
import { eventClient, ConnectionStatus } from "../services/eventClient";

export type FeedbackUIStatus =
  | "idle"
  | "draft"
  | "submitting"
  | "queued"
  | "acknowledged"
  | "failed";

export interface VisualLoopRuntimeState {
  connection: ConnectionStatus;
  sessions: SessionHandle[];
  activeSessionId: string | null;
  activeArtifact: ActiveArtifactInfo | null;
  feedbackStatus: FeedbackUIStatus;
  pendingFeedbackId: string | null;
  staleRevisionAvailable: number | null;
}

export function useVisualLoopStore() {
  const [connection, setConnection] = useState<ConnectionStatus>(eventClient.getStatus());
  const [sessions, setSessions] = useState<SessionHandle[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeArtifact, setActiveArtifact] = useState<ActiveArtifactInfo | null>(null);
  const [feedbackStatus, setFeedbackStatus] = useState<FeedbackUIStatus>("idle");
  const [pendingFeedbackId, setPendingFeedbackId] = useState<string | null>(null);
  const [staleRevisionAvailable, setStaleRevisionAvailable] = useState<number | null>(null);

  // Reconcile snapshot from Core Server REST API
  const refreshSnapshot = useCallback(async () => {
    try {
      const snap = await coreClient.getState();
      if (snap.sessions) setSessions(snap.sessions);
      if (snap.activeSessionId) setActiveSessionId(snap.activeSessionId);
      if (snap.activeArtifact) {
        setActiveArtifact(snap.activeArtifact);
      }
    } catch (err) {
      // Server not reachable yet
    }
  }, []);

  // Connect WebSocket and subscribe to real-time events
  useEffect(() => {
    eventClient.connect();

    const unsubStatus = eventClient.onStatusChange((status) => {
      setConnection(status);
      if (status === "connected") {
        refreshSnapshot();
      }
    });

    const unsubEvent = eventClient.onEvent((event: ServerEvent) => {
      switch (event.type) {
        case "state.snapshot": {
          const payload = event.payload;
          if (payload.sessions) setSessions(payload.sessions);
          if (payload.activeSessionId) setActiveSessionId(payload.activeSessionId);
          if (payload.activeArtifact) {
            setActiveArtifact(payload.activeArtifact);
          }
          break;
        }

        case "session.registered": {
          const handle = event.payload;
          setSessions((prev) => {
            const exists = prev.some((s) => s.sessionId === handle.sessionId);
            return exists ? prev.map((s) => (s.sessionId === handle.sessionId ? handle : s)) : [...prev, handle];
          });
          setActiveSessionId(handle.sessionId);
          break;
        }

        case "preview.ready": {
          const p = event.payload;
          setActiveArtifact((prev) => {
            // If user is currently editing feedback on an older revision, notify rather than silently wipe
            if (prev && prev.artifactId === p.artifactId && p.revision > prev.revision) {
              setStaleRevisionAvailable(p.revision);
            }
            return {
              sessionId: p.sessionId || prev?.sessionId || "active_session",
              artifactId: p.artifactId,
              revision: p.revision,
              kind: p.kind || (p.entrypoint.endsWith(".html") ? "html" : "svg"),
              title: p.title || p.entrypoint.split("/").pop() || p.artifactId,
              entrypoint: p.entrypoint,
              content: p.content,
            };
          });
          break;
        }

        case "feedback.submitted": {
          const fb = event.payload;
          setPendingFeedbackId(fb.feedbackId);
          setFeedbackStatus("queued");
          break;
        }

        case "feedback.delivered": {
          const receipt = event.payload;
          setPendingFeedbackId((current) => {
            if (current === receipt.feedbackId) {
              setFeedbackStatus("acknowledged");
            }
            return current;
          });
          break;
        }

        case "feedback.failed": {
          const fail = event.payload;
          setPendingFeedbackId((current) => {
            if (current === fail.feedbackId) {
              setFeedbackStatus("failed");
            }
            return current;
          });
          break;
        }

        case "revision.published": {
          const rev = event.payload;
          setActiveArtifact((prev) => {
            if (prev && prev.artifactId === rev.artifactId) {
              return {
                ...prev,
                revision: rev.revision,
              };
            }
            return prev;
          });
          break;
        }
      }
    });

    return () => {
      unsubStatus();
      unsubEvent();
    };
  }, [refreshSnapshot]);

  const acceptNewRevision = useCallback(() => {
    setStaleRevisionAvailable(null);
    refreshSnapshot();
  }, [refreshSnapshot]);

  return {
    connection,
    sessions,
    activeSessionId,
    activeArtifact,
    feedbackStatus,
    pendingFeedbackId,
    staleRevisionAvailable,
    setFeedbackStatus,
    refreshSnapshot,
    acceptNewRevision,
  };
}
