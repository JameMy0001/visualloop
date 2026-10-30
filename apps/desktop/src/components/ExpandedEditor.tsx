import React, { useState, useRef, useCallback } from "react";
import {
  Circle,
  Square,
  ArrowUpRight,
  Pencil,
  Type,
  Undo2,
  Trash2,
  Send,
  Minimize2,
  CheckCircle2,
  Copy,
  Info,
} from "lucide-react";
import {
  Annotation,
  AnnotationType,
  FeedbackSubmission,
  normalizeBounds,
  denormalizeBounds,
  normalizePoint,
} from "@visualloop/protocol";
import { generateDualCapture, DualCaptureResult } from "@visualloop/annotation-engine";
import { DemoArtifactViewer } from "./DemoArtifactViewer";
import { WindowControls } from "./WindowControls";

interface ExpandedEditorProps {
  onShrink: () => void;
  onClose: () => void;
  onSubmitFeedback: (submission: FeedbackSubmission) => void;
}

export const ExpandedEditor: React.FC<ExpandedEditorProps> = ({
  onShrink,
  onClose,
  onSubmitFeedback,
}) => {
  const [activeTool, setActiveTool] = useState<AnnotationType>("circle");
  const [selectedColor, setSelectedColor] = useState<string>("#EF4444");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [history, setHistory] = useState<Annotation[][]>([]);
  const [generalInstruction, setGeneralInstruction] = useState<string>("");
  const [submittedJson, setSubmittedJson] = useState<string | null>(null);
  const [dualCapture, setDualCapture] = useState<DualCaptureResult | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);

  const canvasRef = useRef<HTMLDivElement>(null);
  const colors = ["#EF4444", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6"];

  const getViewportDimensions = () => {
    if (!canvasRef.current) return { width: 800, height: 600 };
    const rect = canvasRef.current.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
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
        strokeWidth: 3,
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

  const handleUndo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory(history.slice(0, -1));
    setAnnotations(prev);
  };

  const handleClear = () => {
    if (annotations.length === 0) return;
    setHistory((prev) => [...prev, annotations]);
    setAnnotations([]);
  };

  const handleUpdateInstruction = (id: string, text: string) => {
    setAnnotations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, instruction: text } : a))
    );
  };

  const handleDeleteAnnotation = (id: string) => {
    setHistory((prev) => [...prev, annotations]);
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSubmit = () => {
    const viewport = getViewportDimensions();
    const finalAnnotations = annotations.length > 0 ? annotations : [
      {
        id: `ann_default_${Date.now()}`,
        type: "rectangle" as const,
        bounds: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
        instruction: generalInstruction || "Review general visual presentation",
        color: "#3B82F6",
        strokeWidth: 2,
        createdAt: new Date().toISOString(),
      }
    ];

    // Minimal SVG capture baseline
    const baseSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.round(viewport.width)} ${Math.round(viewport.height)}"><rect width="100%" height="100%" fill="#070B14"/></svg>`;
    const dual = generateDualCapture(baseSvg, finalAnnotations, {
      width: Math.round(viewport.width),
      height: Math.round(viewport.height),
      devicePixelRatio: window.devicePixelRatio || 1,
      zoom: 1,
      scrollX: 0,
      scrollY: 0,
    });
    setDualCapture(dual);

    const submission: FeedbackSubmission = {
      protocolVersion: "1.0",
      feedbackId: `fb_${Date.now()}`,
      sessionId: "session_gemini_active",
      artifactId: "art_solar_system",
      revision: 1,
      viewport: {
        width: Math.round(viewport.width),
        height: Math.round(viewport.height),
        devicePixelRatio: window.devicePixelRatio || 1,
        zoom: 1,
        scrollX: 0,
        scrollY: 0,
      },
      annotations: finalAnnotations,
      generalInstruction: generalInstruction || undefined,
      originalScreenshotDataUrl: dual.originalDataUrl,
      annotatedScreenshotDataUrl: dual.annotatedDataUrl,
      idempotencyKey: `idem_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };

    setSubmittedJson(JSON.stringify(submission, null, 2));
    onSubmitFeedback(submission);
  };

  const copyJson = () => {
    if (submittedJson) {
      navigator.clipboard.writeText(submittedJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-950 text-slate-100 border border-slate-700/80 rounded-xl overflow-hidden shadow-2xl">
      {/* Titlebar */}
      <WindowControls
        mode="expanded"
        state="expanded"
        clickThrough={false}
        onToggleExpand={onShrink}
        onClose={onClose}
      />

      {/* Editor Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Toolbar */}
        <div className="w-16 flex flex-col items-center py-4 gap-4 bg-slate-900 border-r border-slate-800">
          <div className="flex flex-col gap-2">
            <button
              title="Circle / Highlight"
              onClick={() => setActiveTool("circle")}
              className={`p-2.5 rounded-lg transition-all ${
                activeTool === "circle"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-500/25"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              <Circle className="w-5 h-5" />
            </button>

            <button
              title="Rectangle"
              onClick={() => setActiveTool("rectangle")}
              className={`p-2.5 rounded-lg transition-all ${
                activeTool === "rectangle"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-500/25"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              <Square className="w-5 h-5" />
            </button>

            <button
              title="Arrow"
              onClick={() => setActiveTool("arrow")}
              className={`p-2.5 rounded-lg transition-all ${
                activeTool === "arrow"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-500/25"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              <ArrowUpRight className="w-5 h-5" />
            </button>

            <button
              title="Freehand Sketch"
              onClick={() => setActiveTool("freehand")}
              className={`p-2.5 rounded-lg transition-all ${
                activeTool === "freehand"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-500/25"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              <Pencil className="w-5 h-5" />
            </button>
          </div>

          <div className="w-8 h-[1px] bg-slate-800" />

          {/* Color Selector */}
          <div className="flex flex-col gap-2">
            {colors.map((c) => (
              <button
                key={c}
                onClick={() => setSelectedColor(c)}
                style={{ backgroundColor: c }}
                className={`w-6 h-6 rounded-full transition-transform ${
                  selectedColor === c ? "scale-125 ring-2 ring-white ring-offset-2 ring-offset-slate-900" : "opacity-75 hover:opacity-100"
                }`}
              />
            ))}
          </div>

          <div className="w-8 h-[1px] bg-slate-800 mt-auto" />

          {/* Undo and Clear */}
          <div className="flex flex-col gap-2">
            <button
              title="Undo"
              onClick={handleUndo}
              disabled={history.length === 0}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              title="Clear All"
              onClick={handleClear}
              disabled={annotations.length === 0}
              className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-30 disabled:pointer-events-none"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Center Canvas with Drawing Overlay */}
        <div className="flex-1 flex flex-col bg-slate-950 p-4 overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-200">
                Artifact Canvas (Interactive Drawing)
              </span>
              <span className="text-xs text-slate-500">
                • Click and drag over elements to annotate
              </span>
            </div>
            <div className="text-xs font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
              Normalized Space: [0.0 - 1.0]
            </div>
          </div>

          <div
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            className="relative flex-1 w-full rounded-xl overflow-hidden border border-slate-800 cursor-crosshair select-none bg-[#070B14]"
          >
            {/* The base artifact viewer */}
            <DemoArtifactViewer showSwitcher={false} className="w-full h-full pointer-events-none" />

            {/* Render Existing Annotations */}
            {canvasRef.current &&
              annotations.map((ann, idx) => {
                const viewport = getViewportDimensions();
                const denorm = denormalizeBounds(ann.bounds, viewport);

                return (
                  <div
                    key={ann.id}
                    style={{
                      position: "absolute",
                      left: `${denorm.x}px`,
                      top: `${denorm.y}px`,
                      width: `${denorm.width}px`,
                      height: `${denorm.height}px`,
                      borderColor: ann.color,
                      borderWidth: `${ann.strokeWidth}px`,
                      borderRadius: ann.type === "circle" ? "9999px" : "6px",
                      pointerEvents: "none",
                    }}
                    className="border-dashed bg-white/5 flex items-start justify-start p-1"
                  >
                    <span
                      style={{ backgroundColor: ann.color }}
                      className="text-[10px] font-bold text-white px-1.5 py-0.2 rounded-full shadow-sm"
                    >
                      #{idx + 1}
                    </span>
                  </div>
                );
              })}

            {/* Render In-Progress Active Drawing */}
            {isDrawing && currentRect && (
              <div
                style={{
                  position: "absolute",
                  left: `${currentRect.x}px`,
                  top: `${currentRect.y}px`,
                  width: `${currentRect.width}px`,
                  height: `${currentRect.height}px`,
                  borderColor: selectedColor,
                  borderRadius: activeTool === "circle" ? "9999px" : "6px",
                  pointerEvents: "none",
                }}
                className="border-2 border-dashed bg-white/10"
              />
            )}

            {/* In-progress freehand points */}
            {isDrawing && currentPoints.length > 1 && (
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                <polyline
                  points={currentPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke={selectedColor}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
        </div>

        {/* Right Sidebar: Instructions & Submission */}
        <div className="w-80 flex flex-col bg-slate-900 border-l border-slate-800 p-4 overflow-y-auto">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
            <h3 className="text-sm font-semibold text-slate-100">
              Structured Feedback
            </h3>
            <span className="text-xs font-mono text-blue-400 bg-blue-950/60 border border-blue-800 px-2 py-0.5 rounded">
              {annotations.length} marked
            </span>
          </div>

          {/* Annotation items list */}
          <div className="flex-1 space-y-3 overflow-y-auto pr-1">
            {annotations.length === 0 ? (
              <div className="p-4 text-center rounded-lg border border-dashed border-slate-800 text-slate-500 text-xs">
                <Info className="w-6 h-6 mx-auto mb-2 opacity-50" />
                Select a tool on the left and draw a circle or box around the region you want changed.
              </div>
            ) : (
              annotations.map((ann, idx) => (
                <div
                  key={ann.id}
                  className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/60 flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        style={{ backgroundColor: ann.color }}
                        className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded-full"
                      >
                        #{idx + 1}
                      </span>
                      <span className="text-xs font-medium uppercase text-slate-300">
                        {ann.type}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteAnnotation(ann.id)}
                      className="text-slate-500 hover:text-red-400 p-0.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="text-[10px] font-mono text-slate-400">
                    x:{ann.bounds.x.toFixed(2)} y:{ann.bounds.y.toFixed(2)} w:{ann.bounds.width.toFixed(2)} h:{ann.bounds.height.toFixed(2)}
                  </div>

                  <textarea
                    rows={2}
                    placeholder="Enter instructions for this area..."
                    value={ann.instruction}
                    onChange={(e) => handleUpdateInstruction(ann.id, e.target.value)}
                    className="w-full text-xs p-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
                  />
                </div>
              ))
            )}

            <div className="pt-2">
              <label className="block text-xs font-medium text-slate-300 mb-1">
                General Instructions (Optional)
              </label>
              <textarea
                rows={3}
                placeholder="Overall direction for agent revision..."
                value={generalInstruction}
                onChange={(e) => setGeneralInstruction(e.target.value)}
                className="w-full text-xs p-2 rounded bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>
          </div>

          {/* Submission Action */}
          <div className="pt-4 border-t border-slate-800 flex flex-col gap-2">
            <button
              onClick={handleSubmit}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-lg shadow-blue-500/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Send className="w-4 h-4" />
              <span>Submit to Agent Session</span>
            </button>

            <button
              onClick={onShrink}
              className="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
            >
              <Minimize2 className="w-3.5 h-3.5" />
              <span>Return to Mini Window</span>
            </button>
          </div>
        </div>
      </div>

      {/* JSON Payload Confirmation Modal */}
      {submittedJson && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 z-50">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-xl p-5 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="w-5 h-5" />
                <h4 className="font-semibold text-sm text-slate-100">
                  Feedback Payload Generated
                </h4>
              </div>
              <button
                onClick={() => setSubmittedJson(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>
                Validated against <code className="text-blue-400 font-mono">@visualloop/protocol</code> schema
              </span>
              {dualCapture && (
                <span className="text-emerald-400 font-medium">Dual Captures Generated</span>
              )}
            </div>

            {dualCapture && (
              <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 flex items-center gap-3">
                <div
                  className="w-28 h-20 bg-slate-900 rounded border border-slate-700 overflow-hidden flex items-center justify-center p-1"
                  dangerouslySetInnerHTML={{ __html: dualCapture.annotatedSvg }}
                />
                <div className="flex-1 text-[11px] text-slate-400">
                  <div className="text-slate-200 font-semibold mb-0.5">Annotated Screenshot Attached</div>
                  <div>Composite SVG/PNG generated with numbered markers and highlighted regions.</div>
                </div>
              </div>
            )}

            <pre className="text-[11px] font-mono bg-slate-950 p-3 rounded-lg border border-slate-800 overflow-x-auto max-h-48 text-slate-300">
              {submittedJson}
            </pre>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={copyJson}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copied ? "Copied!" : "Copy JSON"}</span>
              </button>
              <button
                onClick={() => {
                  setSubmittedJson(null);
                  onShrink();
                }}
                className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white transition-colors"
              >
                Done (Back to Mini)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
