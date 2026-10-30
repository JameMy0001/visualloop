import React, { useEffect } from "react";
import { FeedbackSubmission } from "@visualloop/protocol";
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

  const handleSubmitFeedback = (submission: FeedbackSubmission) => {
    console.info("[VisualLoop] Feedback submitted:", submission);
    setState("submitting");

    // Persist latest feedback to local cache
    try {
      localStorage.setItem("visualloop_last_feedback", JSON.stringify(submission));
    } catch (e) {
      console.warn("Failed to store feedback locally", e);
    }

    // Transition state machine: submitting -> mini_waiting
    setTimeout(() => {
      setState("mini_waiting");
    }, 600);
  };

  const handleClose = () => {
    setMode("hidden");
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
