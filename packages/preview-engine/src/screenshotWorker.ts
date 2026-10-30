import { Viewport, Annotation, denormalizeBounds } from "@visualloop/protocol";
import { encodeRgbRaster } from "./pngEncoder.js";

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

interface ShapeItem {
  type: "rect" | "circle" | "ellipse";
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: [number, number, number];
  stroke?: [number, number, number];
  strokeWidth?: number;
}

function parseColor(str?: string): [number, number, number] | undefined {
  if (!str || str === "none" || str === "transparent") return undefined;
  const s = str.trim().toLowerCase();
  if (s.startsWith("#")) {
    if (s.length === 4) {
      const r = parseInt(s[1] + s[1], 16);
      const g = parseInt(s[2] + s[2], 16);
      const b = parseInt(s[3] + s[3], 16);
      return [r, g, b];
    }
    if (s.length >= 7) {
      const r = parseInt(s.slice(1, 3), 16);
      const g = parseInt(s.slice(3, 5), 16);
      const b = parseInt(s.slice(5, 7), 16);
      return [r, g, b];
    }
  }
  const rgbMatch = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    return [parseInt(rgbMatch[1], 10), parseInt(rgbMatch[2], 10), parseInt(rgbMatch[3], 10)];
  }
  if (s === "white") return [255, 255, 255];
  if (s === "black") return [0, 0, 0];
  if (s === "red") return [225, 76, 69];
  if (s === "blue") return [59, 130, 246];
  if (s === "yellow") return [234, 179, 8];
  return undefined;
}

/**
 * Extracts basic geometric shapes from an SVG string for headless pixel rendering.
 */
function extractShapesFromSvg(svg: string, vpWidth: number, vpHeight: number): ShapeItem[] {
  const shapes: ShapeItem[] = [];

  // Match rect elements
  const rectRegex = /<rect\b([^>]*)\/?>/gi;
  let match;
  while ((match = rectRegex.exec(svg)) !== null) {
    const attrs = match[1];
    const widthMatch = attrs.match(/width=["']?(\d+(?:\.\d+)?%?)/i);
    const heightMatch = attrs.match(/height=["']?(\d+(?:\.\d+)?%?)/i);
    const xMatch = attrs.match(/\bx=["']?(-?\d+(?:\.\d+)?)/i);
    const yMatch = attrs.match(/\by=["']?(-?\d+(?:\.\d+)?)/i);
    const fillMatch = attrs.match(/fill=["']?([^"'>\s]+)/i);
    const strokeMatch = attrs.match(/stroke=["']?([^"'>\s]+)/i);

    let w = widthMatch ? parseFloat(widthMatch[1]) : vpWidth;
    let h = heightMatch ? parseFloat(heightMatch[1]) : vpHeight;
    if (widthMatch && widthMatch[1].endsWith("%")) w = (parseFloat(widthMatch[1]) / 100) * vpWidth;
    if (heightMatch && heightMatch[1].endsWith("%")) h = (parseFloat(heightMatch[1]) / 100) * vpHeight;

    const x = xMatch ? parseFloat(xMatch[1]) : 0;
    const y = yMatch ? parseFloat(yMatch[1]) : 0;

    shapes.push({
      type: "rect",
      x,
      y,
      width: w,
      height: h,
      fill: parseColor(fillMatch ? fillMatch[1] : "#FFFFFF"),
      stroke: parseColor(strokeMatch ? strokeMatch[1] : undefined),
    });
  }

  // Match circle elements
  const circleRegex = /<circle\b([^>]*)\/?>/gi;
  while ((match = circleRegex.exec(svg)) !== null) {
    const attrs = match[1];
    const cxMatch = attrs.match(/cx=["']?(-?\d+(?:\.\d+)?)/i);
    const cyMatch = attrs.match(/cy=["']?(-?\d+(?:\.\d+)?)/i);
    const rMatch = attrs.match(/\br=["']?(\d+(?:\.\d+)?)/i);
    const fillMatch = attrs.match(/fill=["']?([^"'>\s]+)/i);
    const strokeMatch = attrs.match(/stroke=["']?([^"'>\s]+)/i);

    if (cxMatch && cyMatch && rMatch) {
      const cx = parseFloat(cxMatch[1]);
      const cy = parseFloat(cyMatch[1]);
      const r = parseFloat(rMatch[1]);
      shapes.push({
        type: "circle",
        x: cx - r,
        y: cy - r,
        width: r * 2,
        height: r * 2,
        fill: parseColor(fillMatch ? fillMatch[1] : "#E5E5E5"),
        stroke: parseColor(strokeMatch ? strokeMatch[1] : undefined),
      });
    }
  }

  return shapes;
}

/**
 * Screenshot worker interface.
 * When running in Node.js headless environments or browsers,
 * produces structured base64 PNG captures of both original artifact
 * and composite markup overlay.
 */
export class ScreenshotWorker {
  public async capture(request: ScreenshotRequest): Promise<ScreenshotResult> {
    const { htmlOrSvgContent, kind, viewport, annotations = [] } = request;
    const width = Math.max(1, Math.round(viewport.width));
    const height = Math.max(1, Math.round(viewport.height));
    const capturedAt = new Date().toISOString();

    // Check if HTML capture is requested without an SVG root
    const trimmed = htmlOrSvgContent.trim();
    const isSvg = kind === "svg" || trimmed.startsWith("<svg") || trimmed.includes("<svg");

    if (!isSvg && typeof document === "undefined") {
      throw new Error(
        "Headless pixel capture of arbitrary HTML requires an active browser or WebView environment. Please perform review capture through the desktop app or provide an SVG representation."
      );
    }

    const shapes = extractShapesFromSvg(htmlOrSvgContent, width, height);

    // Rasterize original image
    const origPngBuffer = encodeRgbRaster(width, height, (px, py) => {
      // Default canvas background
      let r = 255;
      let g = 255;
      let b = 255;

      for (const shape of shapes) {
        if (shape.type === "rect") {
          if (px >= shape.x && px < shape.x + shape.width && py >= shape.y && py < shape.y + shape.height) {
            if (shape.fill) {
              [r, g, b] = shape.fill;
            }
          }
        } else if (shape.type === "circle") {
          const cx = shape.x + shape.width / 2;
          const cy = shape.y + shape.height / 2;
          const rad = shape.width / 2;
          const distSq = (px - cx) * (px - cx) + (py - cy) * (py - cy);
          if (distSq <= rad * rad) {
            if (shape.fill) {
              [r, g, b] = shape.fill;
            }
          }
        }
      }
      return [r, g, b];
    });

    // Rasterize annotated image with visual markers
    const annotPngBuffer = encodeRgbRaster(width, height, (px, py) => {
      // Base pixel
      let [r, g, b] = [255, 255, 255];
      for (const shape of shapes) {
        if (shape.type === "rect") {
          if (px >= shape.x && px < shape.x + shape.width && py >= shape.y && py < shape.y + shape.height) {
            if (shape.fill) [r, g, b] = shape.fill;
          }
        } else if (shape.type === "circle") {
          const cx = shape.x + shape.width / 2;
          const cy = shape.y + shape.height / 2;
          const rad = shape.width / 2;
          if ((px - cx) * (px - cx) + (py - cy) * (py - cy) <= rad * rad) {
            if (shape.fill) [r, g, b] = shape.fill;
          }
        }
      }

      // Overlay annotations
      for (let i = 0; i < annotations.length; i++) {
        const ann = annotations[i];
        const rect = denormalizeBounds(ann.bounds, { width, height });
        const annColor = parseColor(ann.color) || [225, 76, 69]; // #E14C45

        if (ann.type === "circle" || ann.type === "ellipse") {
          const cx = rect.x + rect.width / 2;
          const cy = rect.y + rect.height / 2;
          const rx = rect.width / 2;
          const ry = rect.height / 2;
          const normX = (px - cx) / Math.max(1, rx);
          const normY = (py - cy) / Math.max(1, ry);
          const dist = normX * normX + normY * normY;

          // Dashed border detection
          if (Math.abs(dist - 1) < 0.12) {
            return annColor;
          }
          // Badge indicator top-left
          const badgeCx = cx - rx;
          const badgeCy = cy - ry;
          if ((px - badgeCx) * (px - badgeCx) + (py - badgeCy) * (py - badgeCy) <= 100) {
            return annColor;
          }
        } else {
          // Rectangle bounds
          const stroke = 3;
          const onLeft = px >= rect.x && px <= rect.x + stroke && py >= rect.y && py <= rect.y + rect.height;
          const onRight = px >= rect.x + rect.width - stroke && px <= rect.x + rect.width && py >= rect.y && py <= rect.y + rect.height;
          const onTop = py >= rect.y && py <= rect.y + stroke && px >= rect.x && px <= rect.x + rect.width;
          const onBottom = py >= rect.y + rect.height - stroke && py <= rect.y + rect.height && px >= rect.x && px <= rect.x + rect.width;
          if (onLeft || onRight || onTop || onBottom) {
            return annColor;
          }
          // Badge
          if ((px - rect.x) * (px - rect.x) + (py - rect.y) * (py - rect.y) <= 100) {
            return annColor;
          }
        }
      }

      return [r, g, b];
    });

    return {
      originalPngBase64: origPngBuffer.toString("base64"),
      annotatedPngBase64: annotPngBuffer.toString("base64"),
      width,
      height,
      capturedAt,
    };
  }

  public generateAnnotatedSvg(
    originalSvg: string,
    annotations: Annotation[],
    viewport: { width: number; height: number }
  ): string {
    const overlayElements = annotations
      .map((ann, i) => {
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
      })
      .join("\n");

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
