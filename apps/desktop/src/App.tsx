import React, { useEffect } from "react";
import { FeedbackSubmission } from "@visualloop/protocol";
import { tauriBridge } from "./services/tauriBridge";
import { useWindowState } from "./hooks/useWindowState";
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
    toggleExpand,
    setOpacity,
    toggleClickThrough,
  } = useWindowState();

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

  const handleSubmitFeedback = async (submission: FeedbackSubmission) => {
    console.info("[VisualLoop] Submitting feedback:", submission);
    setState("submitting");

    // 1. Local offline persistence
    try {
      localStorage.setItem("visualloop_last_feedback", JSON.stringify(submission));
    } catch (e) {
      console.warn("Failed to store feedback locally", e);
    }

    // 2. Transmit to Core Server API
    try {
      const response = await fetch("http://127.0.0.1:4178/v1/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(submission),
      });

      if (response.ok) {
        const data = await response.json();
        console.info("[VisualLoop] Feedback successfully delivered to Core Server:", data);
      } else {
        console.warn("[VisualLoop] Server returned non-200 feedback status:", response.status);
      }
    } catch (err) {
      console.warn("[VisualLoop] Core Server unreachable, cached locally:", err);
    }

    // 3. Transition state machine to mini_waiting and return to mini overlay
    setTimeout(() => {
      setState("mini_waiting");
      setMode("mini");
    }, 600);
  };

  const handleClose = async () => {
    setMode("hidden");
    await tauriBridge.closeWindow();
  };

  return (
    <main className="w-screen h-screen flex items-center justify-center p-0 m-0 bg-transparent overflow-hidden">
      {mode === "mini" ? (
        <MiniOverlay
          state={state}
          opacity={opacity}
          clickThrough={clickThrough}
          onExpand={() => setMode("expanded")}
          onToggleClickThrough={toggleClickThrough}
          onChangeOpacity={setOpacity}
          onClose={handleClose}
        />
      ) : mode === "expanded" ? (
        <ExpandedEditor
          onShrink={() => setMode("mini")}
          onClose={handleClose}
          onSubmitFeedback={handleSubmitFeedback}
        />
      ) : (
        <div className="p-4 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-300">
          VisualLoop is hidden. Press ⌘+Shift+V to reopen.
        </div>
      )}
    </main>
  );
};

export default App;
