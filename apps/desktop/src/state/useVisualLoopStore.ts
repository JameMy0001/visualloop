import { useState, useEffect, useCallback, useRef } from "react";
import { SessionHandle, ServerEvent } from "@visualloop/protocol";
import { coreClient, ActiveArtifactInfo } from "../services/coreClient";
import { eventClient, ConnectionStatus } from "../services/eventClient";
import { tauriBridge } from "../services/tauriBridge";
import { isOlderRevision, isSameReviewSnapshot } from "./revisionGuard";

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

  // Refs keep websocket and REST handlers synchronized with the latest review snapshot.
  // In-progress annotations must stay attached to the exact content the reviewer saw.
  const draftProtectedRef = useRef(false);
  const activeArtifactRef = useRef<ActiveArtifactInfo | null>(null);
  const pendingArtifactRef = useRef<ActiveArtifactInfo | null>(null);

  const setReviewDraftActive = useCallback((active: boolean) => {
    draftProtectedRef.current = active;
  }, []);

  const receiveArtifact = useCallback((incoming: ActiveArtifactInfo) => {
    const current = activeArtifactRef.current;
    if (isOlderRevision(current, incoming) || isOlderRevision(pendingArtifactRef.current, incoming)) {
      return;
    }
    if (current && isSameReviewSnapshot(current, incoming)) return;

    if (draftProtectedRef.current && current) {
      // Queue the complete content; do not merely advance the revision number.
      pendingArtifactRef.current = incoming;
      setStaleRevisionAvailable(incoming.revision);
      return;
    }

    activeArtifactRef.current = incoming;
    setActiveArtifact(incoming);
    pendingArtifactRef.current = null;
    setStaleRevisionAvailable(null);
  }, []);

  // Reconcile snapshot from Core Server REST API
  const refreshSnapshot = useCallback(async () => {
    try {
      const snap = await coreClient.getState();
      if (snap.sessions) setSessions(snap.sessions);
      if (snap.activeSessionId) setActiveSessionId(snap.activeSessionId);
      if (snap.activeArtifact) receiveArtifact(snap.activeArtifact);
    } catch (err) {
      // Server not reachable yet
    }
  }, [receiveArtifact]);

  // Connect WebSocket and subscribe to real-time events with auto-synchronized auth token
  useEffect(() => {
    let isMounted = true;

    async function initAuthAndConnect() {
      const token = await tauriBridge.getAuthToken();
      if (token) {
        coreClient.setToken(token);
        eventClient.setToken(token);
      }
      if (isMounted) {
        eventClient.connect();
      }
    }

    initAuthAndConnect();

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
          if (payload.activeArtifact) receiveArtifact(payload.activeArtifact);
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
          receiveArtifact({
            sessionId: p.sessionId || activeArtifactRef.current?.sessionId || "active_session",
            artifactId: p.artifactId,
            revision: p.revision,
            kind: p.kind || (p.entrypoint.endsWith(".html") ? "html" : "svg"),
            title: p.title || p.entrypoint.split("/").pop() || p.artifactId,
            entrypoint: p.entrypoint,
            content: p.content,
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
          const current = activeArtifactRef.current;
          if (current && current.artifactId === rev.artifactId && rev.revision > current.revision) {
            // Never update a revision number without fetching its corresponding content.
            if (draftProtectedRef.current) setStaleRevisionAvailable(rev.revision);
            void refreshSnapshot();
          }
          break;
        }
      }
    });

    return () => {
      unsubStatus();
      unsubEvent();
    };
  }, [receiveArtifact, refreshSnapshot]);

  const acceptNewRevision = useCallback(() => {
    const pending = pendingArtifactRef.current;
    if (pending) {
      activeArtifactRef.current = pending;
      setActiveArtifact(pending);
      pendingArtifactRef.current = null;
      setStaleRevisionAvailable(null);
    } else {
      // The publish event might precede the content. Keep the notice until the
      // server actually supplies a snapshot with the new revision.
      void refreshSnapshot();
    }
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
    setReviewDraftActive,
  };
}
