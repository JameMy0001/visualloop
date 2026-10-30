import React from "react";
import { Maximize2, Minimize2, X, MousePointer, GripVertical } from "lucide-react";
import { WindowMode, WindowState } from "@visualloop/protocol";
import { tauriBridge } from "../services/tauriBridge";

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

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 && !(e.target as HTMLElement).closest("button, input, textarea")) {
      tauriBridge.startDragging();
    }
  };

  return (
    <div
      data-tauri-drag-region
      onMouseDown={handleHeaderMouseDown}
      className={`flex items-center justify-between px-3 py-1.5 select-none bg-slate-900/95 border-b border-white/10 cursor-move ${
        isMini ? "h-8" : "h-10"
      }`}
    >
      <div className="flex items-center gap-1.5 pointer-events-none">
        <GripVertical className="w-3.5 h-3.5 text-slate-500 mr-0.5" />
        <span className={`w-2 h-2 rounded-full ${getStatusColor()} animate-pulse`} />
        <span className="text-xs font-semibold tracking-wide text-slate-200">
          VisualLoop
        </span>
        <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
          {getStatusLabel()}
        </span>
      </div>

      <div
        className="flex items-center gap-1 pointer-events-auto"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {isMini && onToggleClickThrough && (
          <button
            type="button"
            title={clickThrough ? "Click-through: Active (Click to disable)" : "Enable Click-through"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleClickThrough();
            }}
            className={`p-1 rounded text-xs transition-colors cursor-pointer ${
              clickThrough
                ? "bg-amber-500/25 text-amber-300 border border-amber-500/40"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <MousePointer className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          title={isMini ? "Expand (Cmd+Shift+V)" : "Shrink to Mini"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
        >
          {isMini ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
        </button>

        <button
          type="button"
          title="Close Window"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
