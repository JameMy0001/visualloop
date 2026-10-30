import React from "react";
import { Maximize2, Minimize2, X, MousePointer, ShieldAlert } from "lucide-react";
import { WindowMode, WindowState } from "@visualloop/protocol";

interface WindowControlsProps {
  mode: WindowMode;
  state: WindowState;
  clickThrough: boolean;
  onToggleExpand: () => void;
  onToggleClickThrough?: () => void;
  onClose: () => void;
}

export const WindowControls: React.FC<WindowControlsProps> = ({
  mode,
  state,
  clickThrough,
  onToggleExpand,
  onToggleClickThrough,
  onClose,
}) => {
  const isMini = mode === "mini";

  const getStatusColor = () => {
    switch (state) {
      case "mini_rendering":
        return "bg-amber-400";
      case "mini_waiting":
        return "bg-blue-400";
      case "error":
        return "bg-red-400";
      case "submitting":
        return "bg-purple-400";
      default:
        return "bg-emerald-400";
    }
  };

  const getStatusLabel = () => {
    switch (state) {
      case "mini_idle":
        return "Idle";
      case "mini_rendering":
        return "Rendering";
      case "mini_waiting":
        return "Waiting Agent";
      case "expanded":
        return "Editing";
      case "submitting":
        return "Submitting";
      case "error":
        return "Error";
      default:
        return state;
    }
  };

  return (
    <div
      data-tauri-drag-region
      className={`flex items-center justify-between px-3 py-1.5 select-none bg-slate-900/90 border-b border-white/10 ${
        isMini ? "h-8" : "h-10"
      }`}
    >
      <div className="flex items-center gap-2 pointer-events-none">
        <span className={`w-2 h-2 rounded-full ${getStatusColor()} animate-pulse`} />
        <span className="text-xs font-semibold tracking-wide text-slate-200">
          VisualLoop
        </span>
        <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
          {getStatusLabel()}
        </span>
      </div>

      <div className="flex items-center gap-1">
        {isMini && onToggleClickThrough && (
          <button
            title={clickThrough ? "Click-through: Enabled" : "Click-through: Disabled"}
            onClick={onToggleClickThrough}
            className={`p-1 rounded text-xs transition-colors ${
              clickThrough
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <MousePointer className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          title={isMini ? "Expand (Cmd+Shift+V)" : "Shrink to Mini"}
          onClick={onToggleExpand}
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          {isMini ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
        </button>

        <button
          title="Close"
          onClick={onClose}
          className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-red-500/20 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
