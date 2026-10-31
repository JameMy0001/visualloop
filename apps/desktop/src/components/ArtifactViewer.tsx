import React, { useRef, useEffect, useMemo } from "react";
import { Settings, FolderOpen, Upload } from "lucide-react";
import { sanitizeSvg, generateSandboxedHtml } from "@visualloop/preview-engine/sanitizer";
import { ActiveArtifactInfo } from "../services/coreClient";

interface ArtifactViewerProps {
  artifact: ActiveArtifactInfo | null;
  className?: string;
  onDimensionsReady?: (dims: { width: number; height: number }) => void;
  showEmptyStatePrompt?: boolean;
  onOpenSettings?: () => void;
  onOpenAssetPicker?: () => void;
  onFileSelected?: (file: File) => void;
}

export const ArtifactViewer: React.FC<ArtifactViewerProps> = ({
  artifact,
  className = "",
  onDimensionsReady,
  showEmptyStatePrompt = true,
  onOpenSettings,
  onOpenAssetPicker,
  onFileSelected,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (containerRef.current && onDimensionsReady) {
      const rect = containerRef.current.getBoundingClientRect();
      onDimensionsReady({ width: rect.width, height: rect.height });
    }
  }, [onDimensionsReady, artifact]);

  // Sanitize SVG or wrap HTML in sandboxed CSP container or pass through image data URL
  const renderedContent = useMemo(() => {
    if (!artifact?.content) return null;

    if (artifact.kind === "image") {
      return artifact.content;
    }

    if (artifact.kind === "svg") {
      return sanitizeSvg(artifact.content);
    }

    if (artifact.kind === "html") {
      return generateSandboxedHtml(artifact.content);
    }

    return null;
  }, [artifact]);

  if (!artifact || !renderedContent) {
    if (!showEmptyStatePrompt) {
      return (
        <div
          ref={containerRef}
          className={`w-full h-full flex items-center justify-center bg-[#F9F9F9] text-[#737373] text-xs font-mono select-none ${className}`}
        >
          No artifact
        </div>
      );
    }

    return (
      <div
        ref={containerRef}
        className={`w-full h-full flex flex-col items-center justify-center p-6 text-center bg-[#FAFAFA] border border-[#E5E5E5] rounded-lg select-none pointer-events-auto ${className}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.svg,.html,.htm,.pdf"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files[0] && onFileSelected) {
              onFileSelected(e.target.files[0]);
            }
          }}
        />

        <div className="w-10 h-10 mb-3 rounded-full bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-600 shadow-xs">
          <FolderOpen className="w-5 h-5" />
        </div>
        <div className="text-sm font-bold text-[#171717] mb-1 tracking-tight">
          Waiting for an artifact
        </div>
        <p className="text-xs text-[#525252] max-w-[280px] leading-relaxed mb-4">
          Select an image, slide, SVG, or HTML file from your project or drag and drop any file here to circle.
        </p>

        <div className="flex items-center gap-2 mb-3">
          {onOpenAssetPicker && (
            <button
              type="button"
              onClick={onOpenAssetPicker}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#FFFFFF] bg-[#14B8A6] hover:bg-[#0D9488] rounded-[6px] transition-colors cursor-pointer shadow-xs pointer-events-auto"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Browse Project Assets</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#171717] bg-[#FFFFFF] border border-[#D4D4D4] hover:bg-[#F5F5F5] rounded-[6px] transition-colors cursor-pointer shadow-xs pointer-events-auto"
          >
            <Upload className="w-3.5 h-3.5 text-[#525252]" />
            <span>Choose File...</span>
          </button>

          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#171717] bg-[#FFFFFF] border border-[#D4D4D4] rounded-[6px] hover:bg-[#F5F5F5] transition-colors cursor-pointer shadow-xs pointer-events-auto"
            >
              <Settings className="w-3.5 h-3.5 text-[#737373]" />
              <span>Settings</span>
            </button>
          )}
        </div>

        <div className="text-[11px] text-[#A3A3A3] flex items-center gap-1">
          <span>Tip: You can also drag and drop any file directly onto this window</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full flex items-center justify-center overflow-hidden bg-[#FFFFFF] rounded-lg ${className}`}
    >
      {artifact.kind === "svg" ? (
        <div
          className="w-full h-full flex items-center justify-center p-2 [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:w-auto [&>svg]:h-auto"
          dangerouslySetInnerHTML={{ __html: renderedContent }}
        />
      ) : artifact.kind === "image" ? (
        <img
          src={renderedContent}
          alt={artifact.title || "Image Artifact"}
          className="max-w-full max-h-full object-contain pointer-events-none select-none rounded-lg"
        />
      ) : (
        <iframe
          title={artifact.title || "Artifact Preview"}
          sandbox="allow-scripts"
          srcDoc={renderedContent}
          className="w-full h-full border-0 rounded-lg pointer-events-none select-none"
        />
      )}
    </div>
  );
};
