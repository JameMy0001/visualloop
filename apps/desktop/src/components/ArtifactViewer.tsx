import React, { useRef, useEffect, useMemo } from "react";
import { Settings } from "lucide-react";
import { sanitizeSvg, generateSandboxedHtml } from "@visualloop/preview-engine/sanitizer";
import { ActiveArtifactInfo } from "../services/coreClient";

interface ArtifactViewerProps {
  artifact: ActiveArtifactInfo | null;
  className?: string;
  onDimensionsReady?: (dims: { width: number; height: number }) => void;
  showEmptyStatePrompt?: boolean;
  onOpenSettings?: () => void;
}

export const ArtifactViewer: React.FC<ArtifactViewerProps> = ({
  artifact,
  className = "",
  onDimensionsReady,
  showEmptyStatePrompt = true,
  onOpenSettings,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current && onDimensionsReady) {
      const rect = containerRef.current.getBoundingClientRect();
      onDimensionsReady({ width: rect.width, height: rect.height });
    }
  }, [onDimensionsReady, artifact]);

  // Sanitize SVG or wrap HTML in sandboxed CSP container
  const renderedContent = useMemo(() => {
    if (!artifact?.content) return null;

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
        className={`w-full h-full flex flex-col items-center justify-center p-6 text-center bg-[#FAFAFA] border border-[#E5E5E5] rounded-lg select-none ${className}`}
      >
        <div className="w-8 h-8 mb-2.5 rounded-full bg-[#F0F0F0] border border-[#E5E5E5] flex items-center justify-center text-[#737373]">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </div>
        <div className="text-xs font-semibold text-[#171717] mb-1 tracking-tight">
          Waiting for an agent
        </div>
        <p className="text-[11px] text-[#525252] max-w-[220px] leading-relaxed mb-3">
          Connect an agent and publish an SVG or HTML file to preview here.
        </p>
        <code className="text-[10px] text-[#525252] bg-[#F0F0F0] px-2 py-1 rounded border border-[#E5E5E5] font-mono select-all">
          visualloop publish &lt;file&gt;
        </code>
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-[#171717] bg-[#FFFFFF] border border-[#D4D4D4] rounded-[6px] hover:bg-[#F5F5F5] transition-colors cursor-pointer shadow-xs"
          >
            <Settings className="w-3 h-3 text-[#737373]" />
            <span>Configure AI API Key</span>
          </button>
        )}
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
