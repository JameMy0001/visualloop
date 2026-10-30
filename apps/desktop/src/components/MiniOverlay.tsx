import React from "react";
import { Maximize2, MousePointer, Eye, Sliders } from "lucide-react";
import { WindowState } from "@visualloop/protocol";
import { DemoArtifactViewer } from "./DemoArtifactViewer";
import { WindowControls } from "./WindowControls";

interface MiniOverlayProps {
  state: WindowState;
  opacity: number;
  clickThrough: boolean;
  onExpand: () => void;
  onToggleClickThrough: () => void;
  onChangeOpacity: (val: number) => void;
  onClose: () => void;
}

export const MiniOverlay: React.FC<MiniOverlayProps> = ({
  state,
  opacity,
  clickThrough,
  onExpand,
  onToggleClickThrough,
  onChangeOpacity,
  onClose,
}) => {
  const [showControls, setShowControls] = React.useState(false);

  return (
    <div
      style={{ opacity }}
      className="relative w-full h-full flex flex-col rounded-xl overflow-hidden shadow-2xl border border-slate-700/60 bg-slate-950/85 backdrop-blur-md transition-opacity duration-200"
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      {/* Top Header / Drag Region */}
      <WindowControls
        mode="mini"
        state={state}
        clickThrough={clickThrough}
        onToggleExpand={onExpand}
        onToggleClickThrough={onToggleClickThrough}
        onClose={onClose}
      />

      {/* Artifact Preview Area */}
      <div className="relative flex-1 w-full h-[calc(100%-2rem)] p-1.5 overflow-hidden">
        <DemoArtifactViewer showSwitcher={false} className="rounded-lg border border-slate-800/80" />

        {/* Click-through notice badge */}
        {clickThrough && (
          <div className="absolute top-3 left-3 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-[10px] font-medium text-amber-300 backdrop-blur-sm pointer-events-none">
            Click-through Active (Press ⌘+Shift+V to unlock)
          </div>
        )}

        {/* Hover Action Overlay & Expand Handle */}
        <div
          className={`absolute inset-0 bg-slate-950/40 backdrop-blur-[2px] flex items-center justify-center transition-opacity duration-150 ${
            showControls ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          }`}
        >
          <div className="flex flex-col items-center gap-2 p-2">
            <button
              onClick={onExpand}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-500/30 transition-all hover:scale-105 active:scale-95"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Expand & Annotate</span>
            </button>
            <span className="text-[10px] text-slate-300 font-mono tracking-tight">
              Shortcut: ⌘+Shift+V
            </span>
          </div>

          {/* Quick Opacity Adjuster at bottom */}
          <div className="absolute bottom-2.5 right-3 flex items-center gap-1.5 px-2 py-1 rounded bg-slate-900/90 border border-slate-700/60">
            <Eye className="w-3 h-3 text-slate-400" />
            <input
              type="range"
              min="0.3"
              max="1.0"
              step="0.05"
              value={opacity}
              onChange={(e) => onChangeOpacity(parseFloat(e.target.value))}
              className="w-14 h-1 accent-blue-500 cursor-pointer"
              title={`Opacity: ${Math.round(opacity * 100)}%`}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
