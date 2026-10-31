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
    if (e.button === 0 && !(e.target as HTMLElement).closest("button, input, textarea, [data-no-drag]")) {
      tauriBridge.startDragging();
    }
  };

  return (
    <div
      data-tauri-drag-region="deep"
      onMouseDown={handleHeaderMouseDown}
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      className={`w-full flex items-center justify-between px-3 select-none bg-[#FFFFFF] border-b border-[#E5E5E5] cursor-move ${
        isMini ? "h-[34px]" : "h-[40px]"
      }`}
    >
      {/* Title & Quiet Status */}
      <div data-tauri-drag-region className="flex items-center gap-1.5 cursor-move pointer-events-none">
        <div data-tauri-drag-region className="w-3.5 h-3.5 rounded-[3px] bg-[#000000] flex items-center justify-center flex-shrink-0">
          <svg viewBox="0 0 1024 1024" className="w-2.5 h-2.5" fill="none">
            <polygon points="164,260 272.3,260 374,504 475.7,260 584,260 374,764" fill="#FFFFFF" />
            <polygon points="638,260 738,260 738,664 860,664 860,764 638,764" fill="#FFFFFF" />
          </svg>
        </div>
        <span data-tauri-drag-region className="text-xs font-semibold text-[#171717] tracking-tight">
          VisualLoop
        </span>
        {statusText && (
          <>
            <span data-tauri-drag-region className="text-[#D4D4D4] text-[10px]">•</span>
            <span data-tauri-drag-region className="text-[11px] font-normal text-[#737373] truncate max-w-[150px]">
              {statusText}
            </span>
          </>
        )}
      </div>

      {/* Action Controls */}
      <div
        data-no-drag
        data-tauri-drag-region="false"
        className="flex items-center gap-0.5 pointer-events-auto"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {isMini && onToggleClickThrough && (
          <button
            type="button"
            data-no-drag
            data-tauri-drag-region="false"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            title={clickThrough ? "Click-through: Active (Press ⌘+Shift+V or ⌘+Shift+C to unlock)" : "Enable Click-through"}
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
          data-no-drag
          data-tauri-drag-region="false"
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
          data-no-drag
          data-tauri-drag-region="false"
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
