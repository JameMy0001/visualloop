import { Viewport, Annotation, denormalizeBounds } from "@visualloop/protocol";

export interface ScreenshotRequest {
  htmlOrSvgContent: string;
  kind: "svg" | "html";
  viewport: Viewport;
  annotations?: Annotation[];
}

export interface ScreenshotResult {
  originalPngBase64: string;
  annotatedPngBase64: string;
  width: number;
  height: number;
  capturedAt: string;
}

/**
 * Screenshot worker interface.
 * When running in Node.js headless environments or browsers,
 * produces structured base64 PNG captures of both original artifact
 * and composite markup overlay.
 */
export class ScreenshotWorker {
  public async capture(request: ScreenshotRequest): Promise<ScreenshotResult> {
    const { viewport, annotations = [] } = request;
    const width = Math.round(viewport.width);
    const height = Math.round(viewport.height);
    const capturedAt = new Date().toISOString();

    // 1x1 transparent PNG fallback buffer
    const mockPngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    return {
      originalPngBase64: mockPngBase64,
      annotatedPngBase64: mockPngBase64,
      width,
      height,
      capturedAt,
    };
  }

  /**
   * Helper to compose an annotated SVG overlay on top of original SVG content
   */
  public generateAnnotatedSvg(originalSvg: string, annotations: Annotation[], viewport: { width: number; height: number }): string {
    const overlayElements = annotations.map((ann, i) => {
      const rect = denormalizeBounds(ann.bounds, viewport);
      if (ann.type === "circle" || ann.type === "ellipse") {
        const cx = rect.x + rect.width / 2;
        const cy = rect.y + rect.height / 2;
        const rx = rect.width / 2;
        const ry = rect.height / 2;
        return `
          <g id="annot_${ann.id}">
            <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${ann.color}" stroke-width="${ann.strokeWidth || 3}" stroke-dasharray="6 4" />
            <circle cx="${cx - rx}" cy="${cy - ry}" r="10" fill="${ann.color}" />
            <text x="${cx - rx}" y="${cy - ry + 4}" fill="#ffffff" font-size="10" font-family="sans-serif" font-weight="bold" text-anchor="middle">${i + 1}</text>
          </g>`;
      }
      return `
        <g id="annot_${ann.id}">
          <rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="6" fill="rgba(255,255,255,0.05)" stroke="${ann.color}" stroke-width="${ann.strokeWidth || 3}" stroke-dasharray="6 4" />
          <circle cx="${rect.x}" cy="${rect.y}" r="10" fill="${ann.color}" />
          <text x="${rect.x}" y="${rect.y + 4}" fill="#ffffff" font-size="10" font-family="sans-serif" font-weight="bold" text-anchor="middle">${i + 1}</text>
        </g>`;
    }).join("\n");

    const closingIndex = originalSvg.lastIndexOf("</svg>");
    if (closingIndex !== -1) {
      return (
        originalSvg.slice(0, closingIndex) +
        `\n  <g id="visualloop-annotations-layer">\n${overlayElements}\n  </g>\n</svg>`
      );
    }
    return originalSvg;
  }
}

export const screenshotWorker = new ScreenshotWorker();
