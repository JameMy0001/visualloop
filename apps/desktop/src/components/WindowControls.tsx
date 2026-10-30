import React from "react";
import { ArrowUpRight, Minimize2, X, MousePointer } from "lucide-react";
import { WindowMode, WindowState } from "@visualloop/protocol";
import { tauriBridge } from "../services/tauriBridge";

interface WindowControlsProps {
  mode: WindowMode;
  state: WindowState;
  statusText?: string;
  clickThrough?: boolean;
  onToggleExpand: () => void;
  onToggleClickThrough?: () => void;
  onClose: () => void;
}

export const WindowControls: React.FC<WindowControlsProps> = ({
  mode,
  statusText,
  clickThrough = false,
  onToggleExpand,
  onToggleClickThrough,
  onClose,
}) => {
  const isMini = mode === "mini";

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 && !(e.target as HTMLElement).closest("button, input, textarea")) {
      tauriBridge.startDragging();
    }
  };

  return (
    <div
      data-tauri-drag-region
      onMouseDown={handleHeaderMouseDown}
      className={`w-full flex items-center justify-between px-3 select-none bg-[#FFFFFF] border-b border-[#E5E5E5] cursor-move ${
        isMini ? "h-[34px]" : "h-[40px]"
      }`}
    >
      {/* Title & Quiet Status */}
      <div className="flex items-center gap-2 pointer-events-none">
        <span className="text-xs font-semibold text-[#171717] tracking-tight">
          VisualLoop
        </span>
        {statusText && (
          <>
            <span className="text-[#D4D4D4] text-[10px]">•</span>
            <span className="text-[11px] font-normal text-[#737373] truncate max-w-[150px]">
              {statusText}
            </span>
          </>
        )}
      </div>

      {/* Action Controls */}
      <div
        className="flex items-center gap-0.5 pointer-events-auto"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {isMini && onToggleClickThrough && (
          <button
            type="button"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            title={clickThrough ? "Click-through: Active (Press ⌘+Shift+V to unlock)" : "Enable Click-through"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleClickThrough();
            }}
            className={`p-1.5 rounded-[6px] text-xs transition-colors cursor-pointer ${
              clickThrough
                ? "bg-[#EBEBEB] text-[#171717]"
                : "text-[#737373] hover:text-[#171717] hover:bg-[#F2F2F2]"
            }`}
          >
            <MousePointer className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          title={isMini ? "Expand (⌘+Shift+V)" : "Collapse to Mini"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
          className="p-1.5 rounded-[6px] text-[#737373] hover:text-[#171717] hover:bg-[#F2F2F2] transition-colors cursor-pointer"
        >
          {isMini ? <ArrowUpRight className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
        </button>

        <button
          type="button"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          title="Close Window"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="p-1.5 rounded-[6px] text-[#737373] hover:text-[#C2413B] hover:bg-[#F2F2F2] transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
