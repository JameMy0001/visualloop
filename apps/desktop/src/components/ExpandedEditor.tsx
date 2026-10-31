import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft,
  Circle,
  Square,
  ArrowUpRight,
  Pencil,
  Undo2,
  Trash2,
  Send,
  X,
  AlertCircle,
  RefreshCw,
  Settings,
  FolderOpen,
} from "lucide-react";
import {
  Annotation,
  AnnotationType,
  FeedbackSubmission,
  ArtifactKind,
  ServerEvent,
  normalizeBounds,
  denormalizeBounds,
  normalizePoint,
} from "@visualloop/protocol";
import {
  generateDualCapture,
  DualCaptureResult,
  rasterizeSvgToPngDataUrl,
} from "@visualloop/annotation-engine";
import { ArtifactViewer } from "./ArtifactViewer";
import { ActiveArtifactInfo, coreClient } from "../services/coreClient";
import { eventClient } from "../services/eventClient";
import { FeedbackUIStatus } from "../state/useVisualLoopStore";
import { tauriBridge } from "../services/tauriBridge";

interface ExpandedEditorProps {
  artifact: ActiveArtifactInfo | null;
  agentName?: string;
  staleRevisionAvailable?: number | null;
  onAcceptNewRevision?: () => void;
  onShrink: () => void;
  onOpenSettings?: () => void;
  onOpenAssetPicker?: () => void;
  onClose: () => void;
  onSubmitFeedback: (submission: FeedbackSubmission) => Promise<boolean | void>;
  feedbackStatus?: FeedbackUIStatus;
}

export function parseModelOption(option: string): { provider: string; model: string } {
  if (!option) return { provider: "gemini", model: "gemini-3.8-flash" };
  const colonIdx = option.indexOf(":");
  if (colonIdx === -1) {
    return { provider: "gemini", model: option };
  }
  return {
    provider: option.slice(0, colonIdx),
    model: option.slice(colonIdx + 1),
  };
}

export const ExpandedEditor: React.FC<ExpandedEditorProps> = ({
  artifact,
  agentName = "Gemini CLI",
  staleRevisionAvailable,
  onAcceptNewRevision,
  onShrink,
  onOpenSettings,
  onOpenAssetPicker,
  onClose,
  onSubmitFeedback,
  feedbackStatus = "idle",
}) => {
  const [activeTool, setActiveTool] = useState<AnnotationType>("circle");
  const selectedColor = "#E14C45"; // Functional monochrome-contrast red from design brief
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [history, setHistory] = useState<Annotation[][]>([]);
  const [generalInstruction, setGeneralInstruction] = useState<string>("");
  const [selectedModelOption, setSelectedModelOption] = useState<string>(() => {
    try {
      return localStorage.getItem("visualloop_preferred_model") || "gemini:gemini-3.8-flash";
    } catch {
      return "gemini:gemini-3.8-flash";
    }
  });
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccessMessage, setSubmitSuccessMessage] = useState<string | null>(null);

  const [isRevising, setIsRevising] = useState<boolean>(false);
  const [revisionStage, setRevisionStage] = useState<number>(1);
  const [revisionSeconds, setRevisionSeconds] = useState<number>(0);
  const [submittedAnnotations, setSubmittedAnnotations] = useState<Annotation[]>([]);
  const [submittedGeneralInstruction, setSubmittedGeneralInstruction] = useState<string>("");
  const [revisionSuccessBanner, setRevisionSuccessBanner] = useState<{
    rev: number;
    duration: number;
  } | null>(null);

  const prevRevisionRef = useRef<number>(artifact?.revision || 1);
  useEffect(() => {
    if (artifact && artifact.revision > prevRevisionRef.current) {
      setIsRevising(false);
      setRevisionSuccessBanner({
        rev: artifact.revision,
        duration: Math.max(1, revisionSeconds),
      });
      prevRevisionRef.current = artifact.revision;
      const t = setTimeout(() => {
        setRevisionSuccessBanner(null);
      }, 7000);
      return () => clearTimeout(t);
    }
  }, [artifact?.revision, revisionSeconds]);

  useEffect(() => {
    if (!isRevising) return;
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 100) / 10;
      setRevisionSeconds(elapsed);
    }, 100);

    return () => clearInterval(interval);
  }, [isRevising]);

  useEffect(() => {
    const unsub = eventClient.onEvent((event: ServerEvent) => {
      if (event.type === "preview.rendering") {
        setRevisionStage(2);
      } else if (event.type === "preview.ready" || event.type === "revision.published") {
        setRevisionStage(3);
      } else if (event.type === "feedback.failed") {
        setIsRevising(false);
        const errMsg = (event.payload as any)?.error || "AI modification failed.";
        setSubmitError(errMsg);
      }
    });

    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    if (feedbackStatus === "failed") {
      setIsRevising(false);
    }
  }, [feedbackStatus]);

  useEffect(() => {
    let isMounted = true;
    async function syncActiveModel() {
      try {
        const savedPref = localStorage.getItem("visualloop_preferred_model");
        if (!savedPref) {
          const info = await tauriBridge.getProviderConfig();
          if (isMounted && info && info.provider && info.model) {
            setSelectedModelOption(`${info.provider}:${info.model}`);
          }
        }
      } catch {
        // ignore
      }
    }
    syncActiveModel();
    return () => {
      isMounted = false;
    };
  }, []);

  // Drag and drop state & file loader handlers
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const handleProcessFilePath = async (filePath: string) => {
    try {
      setIsSubmitting(true);
      setSubmitError(null);
      await coreClient.selectWorkspaceAsset(filePath);
      setSubmitSuccessMessage(`Loaded ${filePath.split("/").pop()} into canvas!`);
    } catch (err: any) {
      setSubmitError(err.message || "Failed to load dropped file.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProcessFile = async (file: File) => {
    const nativePath = (file as any).path;
    if (nativePath && typeof nativePath === "string") {
      await handleProcessFilePath(nativePath);
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitError(null);
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const content = reader.result as string;
          const ext = file.name.split(".").pop()?.toLowerCase();
          const isImage = ["png", "jpg", "jpeg", "webp", "gif", "bmp"].includes(ext || "");
          const isSvg = ext === "svg";
          const kind: ArtifactKind = isImage ? "image" : isSvg ? "svg" : "html";

          await coreClient.uploadAsset(file.name, content, kind);
          setSubmitSuccessMessage(`Loaded ${file.name} into canvas!`);
        } catch (innerErr: any) {
          setSubmitError(innerErr.message || "Failed to upload dropped file.");
        } finally {
          setIsSubmitting(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setSubmitError(err.message || "Failed to read dropped file.");
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    async function setupTauriDragDrop() {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const cleanup = await getCurrentWindow().onDragDropEvent(async (event) => {
          if (event.payload.type === "over") {
            setIsDragOver(true);
          } else if (event.payload.type === "drop") {
            setIsDragOver(false);
            const paths = event.payload.paths;
            if (paths && paths.length > 0) {
              await handleProcessFilePath(paths[0]);
            }
          } else {
            setIsDragOver(false);
          }
        });
        unlisten = cleanup;
      } catch {
        // Fallback to HTML5 drag and drop
      }
    }
    setupTauriDragDrop();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Drawing interaction state
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);

  const canvasRef = useRef<HTMLDivElement>(null);

  const getViewportDimensions = () => {
    if (!canvasRef.current) return { width: 800, height: 600 };
    const rect = canvasRef.current.getBoundingClientRect();
    return { width: Math.max(100, rect.width), height: Math.max(100, rect.height) };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsDrawing(true);
    setStartPoint({ x, y });

    if (activeTool === "freehand") {
      setCurrentPoints([{ x, y }]);
    } else {
      setCurrentRect({ x, y, width: 0, height: 0 });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !startPoint || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const currentX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const currentY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

    if (activeTool === "freehand") {
      setCurrentPoints((prev) => [...prev, { x: currentX, y: currentY }]);
    } else {
      const x = Math.min(startPoint.x, currentX);
      const y = Math.min(startPoint.y, currentY);
      const width = Math.abs(currentX - startPoint.x);
      const height = Math.abs(currentY - startPoint.y);
      setCurrentRect({ x, y, width, height });
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing || !canvasRef.current) return;
    setIsDrawing(false);

    const viewport = getViewportDimensions();
    const now = new Date().toISOString();
    const id = `ann_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    if (activeTool === "freehand" && currentPoints.length > 2) {
      const minX = Math.min(...currentPoints.map((p) => p.x));
      const minY = Math.min(...currentPoints.map((p) => p.y));
      const maxX = Math.max(...currentPoints.map((p) => p.x));
      const maxY = Math.max(...currentPoints.map((p) => p.y));

      const normBounds = normalizeBounds(
        { x: minX, y: minY, width: Math.max(10, maxX - minX), height: Math.max(10, maxY - minY) },
        viewport
      );

      const normalizedPoints = currentPoints.map((p) => normalizePoint(p, viewport));

      const newAnn: Annotation = {
        id,
        type: "freehand",
        bounds: normBounds,
        points: normalizedPoints,
        instruction: "Adjust this sketched region",
        color: selectedColor,
        strokeWidth: 2,
        createdAt: now,
      };

      setHistory((prev) => [...prev, annotations]);
      setAnnotations((prev) => [...prev, newAnn]);
    } else if (currentRect && currentRect.width > 8 && currentRect.height > 8) {
      const normBounds = normalizeBounds(currentRect, viewport);
      const newAnn: Annotation = {
        id,
        type: activeTool,
        bounds: normBounds,
        instruction:
          activeTool === "circle"
            ? "Inspect or modify circled object"
            : activeTool === "arrow"
            ? "Point attention here"
            : "Review this section",
        color: selectedColor,
        strokeWidth: 2,
        createdAt: now,
      };

      setHistory((prev) => [...prev, annotations]);
      setAnnotations((prev) => [...prev, newAnn]);
    }

    setStartPoint(null);
    setCurrentRect(null);
    setCurrentPoints([]);
  };

  const handleUndo = useCallback(() => {
    if (history.length > 0) {
      const previous = history[history.length - 1];
      setHistory((prev) => prev.slice(0, prev.length - 1));
      setAnnotations(previous);
    }
  }, [history]);

  const handleClear = useCallback(() => {
    if (annotations.length > 0) {
      setHistory((prev) => [...prev, annotations]);
      setAnnotations([]);
    }
  }, [annotations]);

  const updateAnnotationText = (id: string, text: string) => {
    setAnnotations((prev) =>
      prev.map((ann) => (ann.id === id ? { ...ann, instruction: text } : ann))
    );
  };

  const deleteAnnotation = (id: string) => {
    setHistory((prev) => [...prev, annotations]);
    setAnnotations((prev) => prev.filter((ann) => ann.id !== id));
  };

  const canSubmit = annotations.length > 0 || generalInstruction.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);

    const viewport = getViewportDimensions();
    const vpWidth = Math.max(1, Math.round(viewport.width));
    const vpHeight = Math.max(1, Math.round(viewport.height));

    // Extract actual rendered preview surface from the DOM
    let baseSvg = "";
    if (artifact?.kind === "svg") {
      const svgEl = canvasRef.current?.querySelector("svg");
      baseSvg = svgEl ? svgEl.outerHTML : (artifact.content || "");
    } else if (artifact?.kind === "image" && artifact.content) {
      baseSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${vpWidth}" height="${vpHeight}" viewBox="0 0 ${vpWidth} ${vpHeight}">
  <rect width="100%" height="100%" fill="#FAFAFA"/>
  <image href="${artifact.content}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet"/>
</svg>`;
    } else if (artifact?.kind === "html" && artifact.content) {
      // Authentic HTML rasterization via SVG foreignObject container
      baseSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${vpWidth}" height="${vpHeight}" viewBox="0 0 ${vpWidth} ${vpHeight}">
  <rect width="100%" height="100%" fill="#FFFFFF"/>
  <foreignObject width="100%" height="100%">
    <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;overflow:hidden;box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif;">
      ${artifact.content}
    </div>
  </foreignObject>
</svg>`;
    } else {
      const svgEl = canvasRef.current?.querySelector("svg");
      baseSvg = svgEl
        ? svgEl.outerHTML
        : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vpWidth} ${vpHeight}"><rect width="100%" height="100%" fill="#FFFFFF"/></svg>`;
    }

    const dual: DualCaptureResult = generateDualCapture(baseSvg, annotations, {
      width: vpWidth,
      height: vpHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
      zoom: 1,
      scrollX: 0,
      scrollY: 0,
    });

    let originalScreenshotDataUrl = dual.originalDataUrl;
    let annotatedScreenshotDataUrl = dual.annotatedDataUrl;

    try {
      const [origPng, annotPng] = await Promise.all([
        rasterizeSvgToPngDataUrl(baseSvg, vpWidth, vpHeight),
        rasterizeSvgToPngDataUrl(dual.annotatedSvg, vpWidth, vpHeight),
      ]);
      originalScreenshotDataUrl = origPng;
      annotatedScreenshotDataUrl = annotPng;
    } catch (e) {
      console.warn("PNG rasterization fallback to SVG data URL", e);
    }

    const activeSessionId = artifact?.sessionId || "sess_active";
    const activeArtifactId = artifact?.artifactId || "art_active";
    const activeRevision = artifact?.revision || 1;
    const { provider: preferredProvider, model: preferredModel } = parseModelOption(selectedModelOption);

    const submission: FeedbackSubmission = {
      protocolVersion: "1.0",
      feedbackId: `fb_${Date.now()}`,
      sessionId: activeSessionId,
      artifactId: activeArtifactId,
      revision: activeRevision,
      viewport: {
        width: vpWidth,
        height: vpHeight,
        devicePixelRatio: window.devicePixelRatio || 1,
        zoom: 1,
        scrollX: 0,
        scrollY: 0,
      },
      annotations,
      generalInstruction: generalInstruction.trim() || undefined,
      preferredProvider,
      preferredModel,
      originalScreenshotDataUrl,
      annotatedScreenshotDataUrl,
      idempotencyKey: `idem_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };

    try {
      setIsRevising(true);
      setRevisionStage(1);
      setRevisionSeconds(0);
      setSubmittedAnnotations([...annotations]);
      setSubmittedGeneralInstruction(generalInstruction.trim());
      setSubmitSuccessMessage(null);
      setSubmitError(null);

      await onSubmitFeedback(submission);
      setAnnotations([]);
      setHistory([]);
      setGeneralInstruction("");
    } catch (err: any) {
      setIsRevising(false);
      setSubmitError(err.message || "Failed to submit feedback to local service.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-[#FFFFFF] text-[#171717] border border-[#E5E5E5] rounded-[14px] overflow-hidden shadow-2xl select-none">
      {/* 40px Minimal Titlebar */}
      <div
        data-tauri-drag-region="deep"
        onMouseDown={(e) => {
          if (e.button === 0 && !(e.target as HTMLElement).closest("button, input, textarea, [data-no-drag]")) {
            tauriBridge.startDragging();
          }
        }}
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        className="h-[40px] px-3 flex items-center justify-between border-b border-[#E5E5E5] bg-[#FFFFFF] cursor-move select-none"
      >
        <div data-tauri-drag-region className="flex items-center gap-2 cursor-move pointer-events-none">
          <button
            type="button"
            data-no-drag
            data-tauri-drag-region="false"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            onClick={onShrink}
            title="Collapse to Mini (⌘+Shift+V)"
            className="p-1 rounded-[6px] text-[#737373] hover:text-[#171717] hover:bg-[#F2F2F2] transition-colors cursor-pointer pointer-events-auto"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div data-tauri-drag-region className="w-3.5 h-3.5 rounded-[3px] bg-[#000000] flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 1024 1024" className="w-2.5 h-2.5" fill="none">
              <polygon points="164,260 272.3,260 374,504 475.7,260 584,260 374,764" fill="#FFFFFF" />
              <polygon points="638,260 738,260 738,664 860,664 860,764 638,764" fill="#FFFFFF" />
            </svg>
          </div>
          <span className="text-xs font-semibold text-[#171717]" data-tauri-drag-region>
            {artifact?.title || artifact?.entrypoint.split("/").pop() || "VisualLoop Review"}
          </span>
          <span className="text-[11px] text-[#737373] font-mono" data-tauri-drag-region>
            · Revision {artifact?.revision ?? 1}
          </span>
          {staleRevisionAvailable && (
            <div
              data-no-drag
              data-tauri-drag-region="false"
              style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
              className="flex items-center gap-1 ml-2 px-2 py-0.5 rounded bg-[#9A6700]/10 border border-[#9A6700]/30 text-[11px] font-medium text-[#9A6700] pointer-events-auto"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <AlertCircle className="w-3 h-3" />
              <span>Revision {staleRevisionAvailable} ready</span>
              {onAcceptNewRevision && (
                <button
                  type="button"
                  data-no-drag
                  data-tauri-drag-region="false"
                  style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                  onClick={onAcceptNewRevision}
                  className="ml-1 underline hover:text-[#171717] cursor-pointer"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  Switch
                </button>
              )}
            </div>
          )}
        </div>

        <div
          data-no-drag
          data-tauri-drag-region="false"
          className="flex items-center gap-2 text-xs text-[#737373] pointer-events-auto"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {onOpenAssetPicker && (
            <button
              type="button"
              data-no-drag
              data-tauri-drag-region="false"
              style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
              onClick={onOpenAssetPicker}
              title="Browse Project Assets (Images, Slides, SVGs)"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-xs font-semibold text-[#171717] bg-[#FFFFFF] border border-[#D4D4D4] hover:bg-[#F2F2F2] transition-colors cursor-pointer shadow-xs"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <FolderOpen className="w-3.5 h-3.5 text-teal-600" />
              <span>Project Assets</span>
            </button>
          )}
          <span className="text-[11px] font-medium text-[#525252]">{agentName}</span>
          {onOpenSettings && (
            <button
              type="button"
              data-no-drag
              data-tauri-drag-region="false"
              style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
              onClick={onOpenSettings}
              title="AI Provider Settings"
              className="p-1 rounded-[6px] text-[#737373] hover:text-[#171717] hover:bg-[#F2F2F2] transition-colors cursor-pointer"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <Settings className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            data-no-drag
            data-tauri-drag-region="false"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            onClick={onClose}
            title="Close Window"
            className="p-1 rounded-[6px] text-[#737373] hover:text-[#C2413B] hover:bg-[#F2F2F2] transition-colors cursor-pointer"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Toolbar (Monochrome & Restrained) */}
        <div className="w-12 flex flex-col items-center py-3 gap-2 bg-[#FAFAFA] border-r border-[#E5E5E5]">
          <button
            type="button"
            title="Circle / Highlight"
            onClick={() => setActiveTool("circle")}
            className={`p-2 rounded-[8px] transition-colors cursor-pointer ${
              activeTool === "circle"
                ? "bg-[#171717] text-[#FFFFFF]"
                : "text-[#737373] hover:text-[#171717] hover:bg-[#F2F2F2]"
            }`}
          >
            <Circle className="w-4 h-4" />
          </button>

          <button
            type="button"
            title="Rectangle"
            onClick={() => setActiveTool("rectangle")}
            className={`p-2 rounded-[8px] transition-colors cursor-pointer ${
              activeTool === "rectangle"
                ? "bg-[#171717] text-[#FFFFFF]"
                : "text-[#737373] hover:text-[#171717] hover:bg-[#F2F2F2]"
            }`}
          >
            <Square className="w-4 h-4" />
          </button>

          <button
            type="button"
            title="Arrow"
            onClick={() => setActiveTool("arrow")}
            className={`p-2 rounded-[8px] transition-colors cursor-pointer ${
              activeTool === "arrow"
                ? "bg-[#171717] text-[#FFFFFF]"
                : "text-[#737373] hover:text-[#171717] hover:bg-[#F2F2F2]"
            }`}
          >
            <ArrowUpRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            title="Freehand Draw"
            onClick={() => setActiveTool("freehand")}
            className={`p-2 rounded-[8px] transition-colors cursor-pointer ${
              activeTool === "freehand"
                ? "bg-[#171717] text-[#FFFFFF]"
                : "text-[#737373] hover:text-[#171717] hover:bg-[#F2F2F2]"
            }`}
          >
            <Pencil className="w-4 h-4" />
          </button>

          <div className="w-6 h-[1px] bg-[#E5E5E5] my-1" />

          <button
            type="button"
            title="Undo"
            onClick={handleUndo}
            disabled={history.length === 0}
            className="p-2 rounded-[8px] text-[#737373] hover:text-[#171717] hover:bg-[#F2F2F2] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Undo2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            title="Clear all"
            onClick={handleClear}
            disabled={annotations.length === 0}
            className="p-2 rounded-[8px] text-[#737373] hover:text-[#C2413B] hover:bg-[#F2F2F2] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Center Live Canvas with Annotation Overlay & Drag Drop */}
        <div className="flex-1 relative flex flex-col p-3 bg-[#F5F5F5] overflow-hidden">
          <div
            ref={canvasRef}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragOver(false);
            }}
            onDrop={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragOver(false);
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                await handleProcessFile(e.dataTransfer.files[0]);
              }
            }}
            className="relative flex-1 w-full rounded-[10px] overflow-hidden border border-[#E5E5E5] bg-[#FFFFFF] select-none"
          >
            {/* Layer 1: The Live Artifact Viewer */}
            <div
              className={`absolute inset-0 overflow-hidden flex items-center justify-center ${
                artifact ? "pointer-events-none" : "pointer-events-auto"
              }`}
            >
              <ArtifactViewer
                artifact={artifact}
                onOpenAssetPicker={onOpenAssetPicker}
                onOpenSettings={onOpenSettings}
                onFileSelected={handleProcessFile}
                className="w-full h-full"
              />
            </div>

            {/* Layer 2: Dedicated Transparent Drawing Surface on TOP (Active only when artifact is loaded!) */}
            {artifact && (
              <div
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                className="absolute inset-0 z-10 cursor-crosshair select-none"
              />
            )}

            {/* Layer 4: Drag and Drop Highlight Overlay */}
            {isDragOver && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-teal-500/10 border-2 border-dashed border-teal-500 rounded-[10px] backdrop-blur-[1px] pointer-events-none select-none">
                <div className="w-12 h-12 rounded-full bg-teal-500 text-white flex items-center justify-center shadow-lg mb-2">
                  <FolderOpen className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-teal-900">Drop image or slide here</p>
                <p className="text-xs text-teal-700">Instantly loads into canvas for circling and AI editing</p>
              </div>
            )}

            {/* Layer 3: Rendered Existing Annotations Overlay */}
            {canvasRef.current &&
              annotations.map((ann, idx) => {
                const viewport = getViewportDimensions();
                const denorm = denormalizeBounds(ann.bounds, viewport);

                return (
                  <div
                    key={ann.id}
                    style={{
                      position: "absolute",
                      left: denorm.x,
                      top: denorm.y,
                      width: denorm.width,
                      height: denorm.height,
                    }}
                    className="pointer-events-none z-20"
                  >
                    {ann.type === "circle" ? (
                      <div className="w-full h-full rounded-full border-2 border-dashed border-[#E14C45] bg-[#E14C45]/5 relative">
                        <span className="absolute -top-3 -left-3 w-5 h-5 rounded-full bg-[#E14C45] text-[#FFFFFF] text-[10px] font-bold flex items-center justify-center shadow-sm">
                          {idx + 1}
                        </span>
                      </div>
                    ) : ann.type === "rectangle" ? (
                      <div className="w-full h-full rounded-[6px] border-2 border-dashed border-[#E14C45] bg-[#E14C45]/5 relative">
                        <span className="absolute -top-3 -left-3 w-5 h-5 rounded-full bg-[#E14C45] text-[#FFFFFF] text-[10px] font-bold flex items-center justify-center shadow-sm">
                          {idx + 1}
                        </span>
                      </div>
                    ) : (
                      <div className="w-full h-full border border-[#E14C45] relative">
                        <span className="absolute -top-3 -left-3 w-5 h-5 rounded-full bg-[#E14C45] text-[#FFFFFF] text-[10px] font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}

            {/* Layer 4: Active Drawing Feedback */}
            {isDrawing && currentRect && (
              <div
                style={{
                  position: "absolute",
                  left: currentRect.x,
                  top: currentRect.y,
                  width: currentRect.width,
                  height: currentRect.height,
                }}
                className={`border-2 border-[#E14C45] bg-[#E14C45]/10 pointer-events-none z-30 ${
                  activeTool === "circle" ? "rounded-full" : "rounded-[6px]"
                }`}
              />
            )}

            {/* Layer 5: Active AI Revision HUD & Scanner (Visual Proof of Real-Time Modification) */}
            {isRevising && (
              <div className="absolute inset-0 z-25 pointer-events-none flex flex-col justify-between overflow-hidden">
                {/* Animated Laser Scanning Line sweeping across the rendered preview */}
                <div className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-[#2dd4bf] to-transparent shadow-[0_0_12px_#2dd4bf,0_0_24px_#14b8a6] animate-laser-scan pointer-events-none" />

                {/* Top Glassmorphic AI Live Processing HUD */}
                <div className="m-3 p-3 rounded-[12px] bg-[#090d16]/85 backdrop-blur-md border border-[#1e293b] text-white shadow-2xl flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#2dd4bf] animate-ping" />
                      <span className="text-xs font-bold tracking-wide uppercase text-[#2dd4bf] flex items-center gap-1.5">
                        AI Agent Actively Modifying Source File
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-mono text-[#94a3b8]">
                      <span className="px-1.5 py-0.5 rounded bg-[#1e293b] text-[#5eead4]">
                        {parseModelOption(selectedModelOption).model}
                      </span>
                      <span className="text-[#38bdf8] font-bold">Elapsed: {revisionSeconds.toFixed(1)}s</span>
                    </div>
                  </div>

                  {/* Step by Step Execution Indicators */}
                  <div className="grid grid-cols-3 gap-2 pt-1 border-t border-[#1e293b]/60 text-[11px]">
                    <div className="flex items-center gap-1.5 text-[#34d399]">
                      <span>[✓]</span>
                      <span className="truncate">Visual Markup Captured</span>
                    </div>
                    <div
                      className={`flex items-center gap-1.5 transition-colors ${
                        revisionStage >= 2 ? "text-[#38bdf8] font-semibold" : "text-[#64748b]"
                      }`}
                    >
                      <span>{revisionStage >= 2 ? "[●]" : "[○]"}</span>
                      <span className="truncate">
                        {revisionStage >= 2 ? "Synthesizing AST & Code..." : "Waiting for synthesis..."}
                      </span>
                    </div>
                    <div
                      className={`flex items-center gap-1.5 transition-colors ${
                        revisionStage >= 3 ? "text-[#a78bfa] font-semibold" : "text-[#64748b]"
                      }`}
                    >
                      <span>{revisionStage >= 3 ? "[●]" : "[○]"}</span>
                      <span className="truncate">
                        {revisionStage >= 3 ? "Validating & Backup..." : "Syntax verification"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Subtle Canvas Border Glow */}
                <div className="absolute inset-0 border-2 border-[#2dd4bf]/40 rounded-[10px] pointer-events-none animate-pulse-glow" />
              </div>
            )}

            {/* Layer 6: Revision Success Banner (Live Hot-Reload Confirmation) */}
            {revisionSuccessBanner && (
              <div className="absolute top-3 inset-x-3 z-30 p-2.5 rounded-[10px] bg-[#042f2e]/95 backdrop-blur-md border border-[#14b8a6] text-[#ccfbf1] shadow-xl flex items-center justify-between text-xs animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#14b8a6] text-[#042f2e] flex items-center justify-center font-bold text-[11px]">
                    ✓
                  </span>
                  <div>
                    <span className="font-bold text-[#ffffff]">Revision {revisionSuccessBanner.rev} Applied Successfully!</span>
                    <span className="text-[#5eead4] ml-2 text-[11px]">
                      Synthesized by {parseModelOption(selectedModelOption).model} in {revisionSuccessBanner.duration.toFixed(1)}s
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[#99f6e4]/70">Auto-backup created</span>
                  <button
                    type="button"
                    onClick={() => setRevisionSuccessBanner(null)}
                    className="text-[#99f6e4] hover:text-[#ffffff] text-sm font-bold px-1 cursor-pointer"
                  >
                    ×
                  </button>
                </div>
              </div>
            )}

            {/* Layer 7: Error Banner (Instant Notification on Failure) */}
            {submitError && (
              <div className="absolute top-3 inset-x-3 z-30 p-2.5 rounded-[10px] bg-[#450a0a]/95 backdrop-blur-md border border-[#dc2626] text-[#fecaca] shadow-xl flex items-center justify-between text-xs animate-in fade-in duration-200">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white">[!] AI Revision Failed:</span>
                  <span className="text-[11px] text-[#fca5a5]">{submitError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSubmitError(null)}
                  className="text-[#fecaca] hover:text-white text-sm font-bold px-1.5 py-0.5 rounded hover:bg-white/10 cursor-pointer"
                >
                  ×
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Inspector Sidebar (280px) */}
        <div className="w-72 flex flex-col bg-[#FAFAFA] border-l border-[#E5E5E5] p-3 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[#171717] tracking-tight">Review</span>
            <span className="text-[11px] text-[#737373]">{annotations.length} marked</span>
          </div>

          {/* Annotations List */}
          <div className="flex-1 space-y-2 overflow-y-auto mb-3">
            {isRevising ? (
              <div className="p-3 rounded-[10px] bg-[#090d16] border border-[#1e293b] text-white flex flex-col gap-2.5 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#2dd4bf] uppercase tracking-wider flex items-center gap-1.5">
                    <RefreshCw className="w-3 h-3 animate-spin text-[#2dd4bf]" /> Active AI Job
                  </span>
                  <span className="text-[10px] font-mono text-[#38bdf8] font-bold">{revisionSeconds.toFixed(1)}s</span>
                </div>

                <div className="text-[11px] text-[#cbd5e1] space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[#64748b]">Target:</span>
                    <span className="font-mono text-[#f1f5f9] truncate max-w-[150px]">{artifact?.entrypoint.split("/").pop()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#64748b]">Revision:</span>
                    <span className="font-mono text-[#38bdf8]">Rev {artifact?.revision ?? 1} ➔ Rev {(artifact?.revision ?? 1) + 1}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#64748b]">Model:</span>
                    <span className="font-mono text-[#a78bfa]">{parseModelOption(selectedModelOption).model}</span>
                  </div>
                </div>

                {submittedAnnotations.length > 0 && (
                  <div className="pt-2 border-t border-[#1e293b] text-[11px]">
                    <span className="text-[#64748b] block mb-1">Applying Changes:</span>
                    <div className="space-y-1 max-h-36 overflow-y-auto">
                      {submittedAnnotations.map((ann, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-xs text-[#e2e8f0] bg-[#1e293b]/60 p-1.5 rounded">
                          <span className="w-3.5 h-3.5 rounded-full bg-[#E14C45] text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                            {i + 1}
                          </span>
                          <span className="line-clamp-2 text-[11px]">{ann.instruction}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {submittedGeneralInstruction && (
                  <div className="text-[11px] bg-[#1e293b]/40 p-1.5 rounded border border-[#334155]">
                    <span className="text-[#94a3b8]">General Note: </span>
                    <span className="text-[#f1f5f9]">{submittedGeneralInstruction}</span>
                  </div>
                )}

                <div className="w-full bg-[#1e293b] rounded-full h-1.5 overflow-hidden mt-1">
                  <div
                    className="bg-gradient-to-r from-[#14b8a6] via-[#38bdf8] to-[#a78bfa] h-full transition-all duration-300"
                    style={{
                      width: revisionStage === 1 ? "30%" : revisionStage === 2 ? "75%" : "95%",
                    }}
                  />
                </div>
              </div>
            ) : annotations.length === 0 ? (
              <div className="p-3 text-center border border-dashed border-[#E5E5E5] rounded-[8px] text-[11px] text-[#737373]">
                Circle or draw on the canvas to add specific visual corrections.
              </div>
            ) : (
              annotations.map((ann, idx) => (
                <div
                  key={ann.id}
                  className="p-2.5 bg-[#FFFFFF] border border-[#E5E5E5] rounded-[8px] space-y-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.02)]"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-[#E14C45] text-[#FFFFFF] text-[10px] font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <span className="text-[11px] font-medium text-[#171717] capitalize">
                        {ann.type}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteAnnotation(ann.id)}
                      className="text-[#A3A3A3] hover:text-[#C2413B] text-[10px] cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                  <input
                    type="text"
                    value={ann.instruction}
                    onChange={(e) => updateAnnotationText(ann.id, e.target.value)}
                    placeholder="Describe what needs to change..."
                    className="w-full px-2 py-1 bg-[#FAFAFA] border border-[#E5E5E5] rounded-[6px] text-xs text-[#171717] focus:outline-none focus:ring-1 focus:ring-[#171717]"
                  />
                </div>
              ))
            )}
          </div>

          {/* AI Model Selector */}
          <div className="pt-2 border-t border-[#E5E5E5]">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-semibold text-[#525252] flex items-center gap-1.5">
                <span>AI Model</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#171717]/5 text-[#525252] font-mono border border-[#E5E5E5]">
                  v3.8+
                </span>
              </label>
            </div>
            <select
              value={selectedModelOption}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedModelOption(val);
                try {
                  localStorage.setItem("visualloop_preferred_model", val);
                } catch {}
              }}
              className="w-full px-2.5 py-1.5 bg-[#FFFFFF] border border-[#E5E5E5] rounded-[8px] text-xs text-[#171717] focus:outline-none focus:ring-1 focus:ring-[#171717] cursor-pointer shadow-sm"
            >
              <optgroup label="Google Gemini">
                <option value="gemini:gemini-3.8-flash">Gemini 3.8 Flash (Smartest &amp; Fast)</option>
                <option value="gemini:gemini-3-flash-preview">Gemini 3 Flash Preview</option>
                <option value="gemini:gemini-3.1-flash-lite">Gemini 3.1 Flash-Lite (High Speed)</option>
                <option value="gemini:gemini-3.1-pro-preview">Gemini 3.1 Pro Preview (Deep Reasoning)</option>
                <option value="gemini:gemini-4-argon">Gemini 4 Argon (Next Gen)</option>
                <option value="gemini:gemini-2.5-pro">Gemini 2.5 Pro</option>
              </optgroup>
              <optgroup label="OpenAI / ChatGPT">
                <option value="openai:gpt-4o">GPT-4o (Omni Flagship)</option>
                <option value="openai:gpt-4.5-preview">GPT-4.5 Preview</option>
                <option value="openai:o3-mini">o3 Mini (Reasoning)</option>
                <option value="openai:o1">o1 (Full Reasoning)</option>
                <option value="openai:gpt-4o-mini">GPT-4o Mini</option>
                <option value="openai:chatgpt-4o-latest">ChatGPT 4o Latest</option>
              </optgroup>
              <optgroup label="Anthropic Claude">
                <option value="anthropic:claude-3-7-sonnet-20250219">Claude 3.7 Sonnet (Hybrid Reasoning)</option>
                <option value="anthropic:claude-3-5-sonnet-20241022">Claude 3.5 Sonnet v2</option>
                <option value="anthropic:claude-3-5-haiku-20241022">Claude 3.5 Haiku</option>
                <option value="anthropic:claude-3-opus-20240229">Claude 3 Opus</option>
              </optgroup>
              <optgroup label="Custom / Compatible (Local &amp; Open Models)">
                <option value="openai-compatible:deepseek-r1">DeepSeek R1 (Open Reasoning)</option>
                <option value="openai-compatible:deepseek-v3">DeepSeek V3 (Coding MoE)</option>
                <option value="openai-compatible:qwen2.5-coder:32b">Qwen 2.5 Coder 32B</option>
                <option value="openai-compatible:llama-3.3-70b">Llama 3.3 70B</option>
                <option value="openai-compatible:mistral-large-latest">Mistral Large Latest</option>
                <option value="openai-compatible:local-model">Custom Local Model (Ollama / vLLM)</option>
              </optgroup>
            </select>
          </div>

          {/* General Instruction Field */}
          <div className="pt-2 border-t border-[#E5E5E5]">
            <label className="block text-[11px] font-semibold text-[#525252] mb-1">
              General Note (optional)
            </label>
            <textarea
              rows={3}
              value={generalInstruction}
              onChange={(e) => setGeneralInstruction(e.target.value)}
              placeholder="E.g., Keep font sizes readable on mobile..."
              className="w-full p-2 bg-[#FFFFFF] border border-[#E5E5E5] rounded-[8px] text-xs text-[#171717] placeholder:text-[#A3A3A3] focus:outline-none focus:ring-1 focus:ring-[#171717] resize-none"
            />
          </div>

          {/* Error Message if submit failed */}
          {submitError && (
            <div className="mt-2 p-2 rounded-[6px] bg-[#C2413B]/10 border border-[#C2413B]/20 text-[11px] text-[#C2413B]">
              {submitError}
            </div>
          )}

          {/* Success Notification */}
          {submitSuccessMessage && (
            <div className="mt-2 p-2 rounded-[6px] bg-[#166534]/10 border border-[#166534]/20 text-[11px] text-[#166534] flex items-center justify-between">
              <span className="font-medium">{submitSuccessMessage}</span>
              <button
                type="button"
                onClick={() => setSubmitSuccessMessage(null)}
                className="text-[#166534] hover:text-[#14532D] text-xs font-bold ml-1"
              >
                ×
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 44px Clean Action Bar */}
      <div className="h-[44px] px-4 flex items-center justify-between border-t border-[#E5E5E5] bg-[#FFFFFF]">
        <button
          type="button"
          onClick={handleClear}
          disabled={annotations.length === 0 && !generalInstruction}
          className="text-xs text-[#737373] hover:text-[#171717] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        >
          Discard draft
        </button>

        <div className="flex items-center gap-3">
          <span className="text-[11px] text-[#737373]">
            {annotations.length} area{annotations.length === 1 ? "" : "s"} selected
          </span>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-[8px] bg-[#171717] hover:bg-[#303030] text-[#FFFFFF] text-xs font-semibold shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Send feedback</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
