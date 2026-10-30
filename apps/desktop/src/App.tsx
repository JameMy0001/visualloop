import React, { useEffect } from "react";
import { FeedbackSubmission } from "@visualloop/protocol";
import { tauriBridge } from "./services/tauriBridge";
import { coreClient } from "./services/coreClient";
import { useWindowState } from "./hooks/useWindowState";
import { useVisualLoopStore } from "./state/useVisualLoopStore";
import { MiniOverlay } from "./components/MiniOverlay";
import { ExpandedEditor } from "./components/ExpandedEditor";

export const App: React.FC = () => {
  const {
    mode,
    state,
    opacity,
    clickThrough,
    setMode,
    setState,
    setOpacity,
    toggleClickThrough,
  } = useWindowState();

  const {
    connection,
    sessions,
    activeSessionId,
    activeArtifact,
    feedbackStatus,
    staleRevisionAvailable,
    acceptNewRevision,
  } = useVisualLoopStore();

  // Escape key handling to collapse expanded window
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mode === "expanded") {
        setMode("mini");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, setMode]);

  // Active session details
  const activeSession = sessions.find((s) => s.sessionId === activeSessionId);
  const agentName = activeSession?.adapterId || "Gemini CLI";

  const handleSubmitFeedback = async (submission: FeedbackSubmission): Promise<boolean | void> => {
    console.info("[VisualLoop] Submitting feedback:", submission);
    setState("submitting");

    // 1. Local offline persistence backup
    try {
      localStorage.setItem("visualloop_last_feedback", JSON.stringify(submission));
    } catch (e) {
      console.warn("Failed to store feedback locally", e);
    }

    // 2. Transmit via typed coreClient
    try {
      const receipt = await coreClient.submitFeedback(submission);
      console.info("[VisualLoop] Feedback queued by Core Server:", receipt);

      // Transition to waiting and collapse back to mini
      setState("mini_waiting");
      setMode("mini");
    } catch (err: any) {
      console.error("[VisualLoop] Core Server submission failed:", err);
      setState("error");
      throw err; // Propagate to ExpandedEditor to show inline error message
    }
  };

  const handleClose = async () => {
    setMode("hidden");
    await tauriBridge.closeWindow();
  };

  return (
    <main className="w-screen h-screen flex items-center justify-center p-0 m-0 bg-transparent overflow-hidden">
      {mode === "mini" ? (
        <MiniOverlay
          artifact={activeArtifact}
          agentName={agentName}
          state={state}
          opacity={opacity}
          clickThrough={clickThrough}
          onExpand={() => setMode("expanded")}
          onToggleClickThrough={toggleClickThrough}
          onClose={handleClose}
        />
      ) : mode === "expanded" ? (
        <ExpandedEditor
          artifact={activeArtifact}
          agentName={agentName}
          staleRevisionAvailable={staleRevisionAvailable}
          onAcceptNewRevision={acceptNewRevision}
          onShrink={() => setMode("mini")}
          onClose={handleClose}
          onSubmitFeedback={handleSubmitFeedback}
          feedbackStatus={feedbackStatus}
        />
      ) : (
        <div className="p-3 bg-[#FFFFFF] border border-[#E5E5E5] rounded-[8px] text-xs text-[#525252] shadow-sm">
          VisualLoop is hidden. Press ⌘+Shift+V to reopen.
        </div>
      )}
    </main>
  );
};

export default App;
