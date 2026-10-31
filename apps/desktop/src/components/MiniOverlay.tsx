import React, { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { WindowState } from "@visualloop/protocol";
import { WindowControls } from "./WindowControls";
import { ArtifactViewer } from "./ArtifactViewer";
import { ActiveArtifactInfo } from "../services/coreClient";

interface MiniOverlayProps {
  artifact: ActiveArtifactInfo | null;
  agentName?: string;
  state: WindowState;
  opacity: number;
  clickThrough: boolean;
  onExpand: () => void;
  onToggleClickThrough: () => void;
  onOpenSettings?: () => void;
  onOpenAssetPicker?: () => void;
  onClose: () => void;
}

export const MiniOverlay: React.FC<MiniOverlayProps> = ({
  artifact,
  agentName = "Gemini CLI",
  state,
  opacity,
  clickThrough,
  onExpand,
  onToggleClickThrough,
  onOpenSettings,
  onOpenAssetPicker,
  onClose,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const statusText = artifact
    ? `Ready · r${artifact.revision}`
    : state === "mini_waiting"
    ? "Awaiting update"
    : "Waiting";

  return (
    <div
      style={{ opacity }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative w-full h-full flex flex-col rounded-[14px] overflow-hidden bg-[#FFFFFF] border border-[#E5E5E5] shadow-[0_8px_24px_rgba(0,0,0,0.12)] select-none transition-opacity duration-150"
    >
      {/* 34px Minimal Header Toolbar */}
      <WindowControls
        mode="mini"
        state={state}
        statusText={statusText}
        clickThrough={clickThrough}
        onToggleExpand={onExpand}
        onToggleClickThrough={onToggleClickThrough}
        onOpenSettings={onOpenSettings}
        onClose={onClose}
      />

      {/* Main Artifact Viewport */}
      <div className="relative flex-1 w-full overflow-hidden bg-[#FAFAFA]">
        <ArtifactViewer
          artifact={artifact}
          onOpenSettings={onOpenSettings}
          onOpenAssetPicker={onOpenAssetPicker}
          className="w-full h-full"
        />

        {/* Click-through notice pill */}
        {clickThrough && (
          <div className="absolute top-2 left-2 px-2.5 py-1 rounded-full bg-[#171717]/90 text-[10px] font-medium text-[#FFFFFF] backdrop-blur-sm pointer-events-none shadow-md flex items-center gap-1.5 border border-[#404040]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E14C45] animate-pulse" />
            <span>Click-through active · Press ⌘+Shift+V or ⌘+Shift+C to unlock</span>
          </div>
        )}

        {/* Hover Expand Shortcut Pill */}
        {artifact && isHovered && !clickThrough && (
          <div className="absolute inset-0 bg-[#FFFFFF]/40 backdrop-blur-[1px] flex items-center justify-center transition-opacity duration-150 pointer-events-auto">
            <button
              onClick={onExpand}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-[#171717] hover:bg-[#303030] text-[#FFFFFF] text-xs font-medium shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>Expand & Annotate</span>
            </button>
          </div>
        )}
      </div>

      {/* 24px Clean Metadata Bar */}
      <div className="h-[24px] px-3 flex items-center justify-between bg-[#FAFAFA] border-t border-[#F0F0F0] text-[11px] text-[#737373]">
        <div className="truncate max-w-[200px] font-mono">
          {artifact ? (
            <span>
              {artifact.title || artifact.entrypoint.split("/").pop()}
              <span className="ml-1 text-[#A3A3A3]">r{artifact.revision}</span>
            </span>
          ) : (
            <span>No active session</span>
          )}
        </div>
        <div className="text-[10px] text-[#A3A3A3] font-medium tracking-tight">
          {agentName}
        </div>
      </div>
    </div>
  );
};
