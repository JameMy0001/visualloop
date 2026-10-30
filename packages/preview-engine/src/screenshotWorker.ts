import { Viewport, Annotation, denormalizeBounds } from "@visualloop/protocol";
import { encodeRgbRaster } from "./pngEncoder.js";
import { isFontPixelActive } from "./bitmapFont.js";

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
  type: "rect" | "circle" | "ellipse" | "line" | "path" | "text";
  x: number;
  y: number;
  width: number;
  height: number;
  x2?: number;
  y2?: number;
  segments?: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  text?: string;
  fontSize?: number;
  scale?: number;
  fill?: [number, number, number];
  stroke?: [number, number, number];
  strokeWidth?: number;
}

function distToSegmentSq(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  if (l2 === 0) return (px - x1) * (px - x1) + (py - y1) * (py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * (x2 - x1);
  const projY = y1 + t * (y2 - y1);
  return (px - projX) * (px - projX) + (py - projY) * (py - projY);
}

function parsePathSegments(d: string): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  const segments: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  const commands = d.match(/([a-df-z])([^a-df-z]*)/gi) || [];
  let curX = 0;
  let curY = 0;
  let startX = 0;
  let startY = 0;

  for (const cmd of commands) {
    const type = cmd[0];
    const nums = (cmd.slice(1).trim().match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    if (type === "M") {
      if (nums.length >= 2) {
        curX = nums[0];
        curY = nums[1];
        startX = curX;
        startY = curY;
      }
    } else if (type === "m") {
      if (nums.length >= 2) {
        curX += nums[0];
        curY += nums[1];
        startX = curX;
        startY = curY;
      }
    } else if (type === "L") {
      for (let i = 0; i < nums.length; i += 2) {
        const nextX = nums[i];
        const nextY = nums[i + 1] ?? curY;
        segments.push({ x1: curX, y1: curY, x2: nextX, y2: nextY });
        curX = nextX;
        curY = nextY;
      }
    } else if (type === "l") {
      for (let i = 0; i < nums.length; i += 2) {
        const nextX = curX + nums[i];
        const nextY = curY + (nums[i + 1] ?? 0);
        segments.push({ x1: curX, y1: curY, x2: nextX, y2: nextY });
        curX = nextX;
        curY = nextY;
      }
    } else if (type === "H") {
      for (const nx of nums) {
        segments.push({ x1: curX, y1: curY, x2: nx, y2: curY });
        curX = nx;
      }
    } else if (type === "h") {
      for (const dx of nums) {
        segments.push({ x1: curX, y1: curY, x2: curX + dx, y2: curY });
        curX += dx;
      }
    } else if (type === "V") {
      for (const ny of nums) {
        segments.push({ x1: curX, y1: curY, x2: curX, y2: ny });
        curY = ny;
      }
    } else if (type === "v") {
      for (const dy of nums) {
        segments.push({ x1: curX, y1: curY, x2: curX, y2: curY + dy });
        curY += dy;
      }
    } else if (type === "Z" || type === "z") {
      segments.push({ x1: curX, y1: curY, x2: startX, y2: startY });
      curX = startX;
      curY = startY;
    }
  }
  return segments;
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

  // Match ellipse elements
  const ellipseRegex = /<ellipse\b([^>]*)\/?>/gi;
  while ((match = ellipseRegex.exec(svg)) !== null) {
    const attrs = match[1];
    const cxMatch = attrs.match(/cx=["']?(-?\d+(?:\.\d+)?)/i);
    const cyMatch = attrs.match(/cy=["']?(-?\d+(?:\.\d+)?)/i);
    const rxMatch = attrs.match(/rx=["']?(\d+(?:\.\d+)?)/i);
    const ryMatch = attrs.match(/ry=["']?(\d+(?:\.\d+)?)/i);
    const fillMatch = attrs.match(/fill=["']?([^"'>\s]+)/i);
    const strokeMatch = attrs.match(/stroke=["']?([^"'>\s]+)/i);

    if (cxMatch && cyMatch && rxMatch && ryMatch) {
      const cx = parseFloat(cxMatch[1]);
      const cy = parseFloat(cyMatch[1]);
      const rx = parseFloat(rxMatch[1]);
      const ry = parseFloat(ryMatch[1]);
      shapes.push({
        type: "ellipse",
        x: cx - rx,
        y: cy - ry,
        width: rx * 2,
        height: ry * 2,
        fill: parseColor(fillMatch ? fillMatch[1] : "#E5E5E5"),
        stroke: parseColor(strokeMatch ? strokeMatch[1] : undefined),
      });
    }
  }

  // Match line elements
  const lineRegex = /<line\b([^>]*)\/?>/gi;
  while ((match = lineRegex.exec(svg)) !== null) {
    const attrs = match[1];
    const x1Match = attrs.match(/x1=["']?(-?\d+(?:\.\d+)?)/i);
    const y1Match = attrs.match(/y1=["']?(-?\d+(?:\.\d+)?)/i);
    const x2Match = attrs.match(/x2=["']?(-?\d+(?:\.\d+)?)/i);
    const y2Match = attrs.match(/y2=["']?(-?\d+(?:\.\d+)?)/i);
    const strokeMatch = attrs.match(/stroke=["']?([^"'>\s]+)/i);
    const strokeWidthMatch = attrs.match(/stroke-width=["']?(\d+(?:\.\d+)?)/i);

    if (x1Match && y1Match && x2Match && y2Match) {
      shapes.push({
        type: "line",
        x: parseFloat(x1Match[1]),
        y: parseFloat(y1Match[1]),
        x2: parseFloat(x2Match[1]),
        y2: parseFloat(y2Match[1]),
        width: Math.abs(parseFloat(x2Match[1]) - parseFloat(x1Match[1])),
        height: Math.abs(parseFloat(y2Match[1]) - parseFloat(y1Match[1])),
        stroke: parseColor(strokeMatch ? strokeMatch[1] : "#000000"),
        strokeWidth: strokeWidthMatch ? parseFloat(strokeWidthMatch[1]) : 2,
      });
    }
  }

  // Match path elements
  const pathRegex = /<path\b([^>]*)\/?>/gi;
  while ((match = pathRegex.exec(svg)) !== null) {
    const attrs = match[1];
    const dMatch = attrs.match(/\bd=["']([^"']+)["']/i);
    const strokeMatch = attrs.match(/stroke=["']?([^"'>\s]+)/i);
    const strokeWidthMatch = attrs.match(/stroke-width=["']?(\d+(?:\.\d+)?)/i);

    if (dMatch) {
      const segments = parsePathSegments(dMatch[1]);
      shapes.push({
        type: "path",
        x: 0,
        y: 0,
        width: vpWidth,
        height: vpHeight,
        segments,
        stroke: parseColor(strokeMatch ? strokeMatch[1] : "#000000"),
        strokeWidth: strokeWidthMatch ? parseFloat(strokeWidthMatch[1]) : 2,
      });
    }
  }

  // Match text elements
  const textRegex = /<text\b([^>]*)>(.*?)<\/text>/gis;
  while ((match = textRegex.exec(svg)) !== null) {
    const attrs = match[1];
    const rawContent = match[2].replace(/<[^>]+>/g, "").trim();
    if (!rawContent) continue;

    const xMatch = attrs.match(/\bx=["']?(-?\d+(?:\.\d+)?)/i);
    const yMatch = attrs.match(/\by=["']?(-?\d+(?:\.\d+)?)/i);
    const fontSizeMatch = attrs.match(/font-size=["']?(\d+(?:\.\d+)?)/i);
    const fillMatch = attrs.match(/fill=["']?([^"'>\s]+)/i);
    const anchorMatch = attrs.match(/text-anchor=["']?([^"'>\s]+)/i);

    const fontSize = fontSizeMatch ? parseFloat(fontSizeMatch[1]) : 14;
    const scale = Math.max(1, Math.round(fontSize / 7));
    const charWidth = 6 * scale;
    let x = xMatch ? parseFloat(xMatch[1]) : 0;
    const y = yMatch ? parseFloat(yMatch[1]) : 14;

    const anchor = anchorMatch ? anchorMatch[1].toLowerCase() : "start";
    if (anchor === "middle") {
      x -= (rawContent.length * charWidth) / 2;
    } else if (anchor === "end") {
      x -= rawContent.length * charWidth;
    }

    shapes.push({
      type: "text",
      x,
      y,
      width: rawContent.length * charWidth,
      height: 7 * scale,
      text: rawContent,
      fontSize,
      scale,
      fill: parseColor(fillMatch ? fillMatch[1] : "#000000"),
    });
  }

  return shapes;
}

function renderBasePixel(px: number, py: number, shapes: ShapeItem[]): [number, number, number] {
  let r = 255;
  let g = 255;
  let b = 255;

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
    } else if (shape.type === "ellipse") {
      const cx = shape.x + shape.width / 2;
      const cy = shape.y + shape.height / 2;
      const rx = shape.width / 2;
      const ry = shape.height / 2;
      const nx = (px - cx) / Math.max(1, rx);
      const ny = (py - cy) / Math.max(1, ry);
      if (nx * nx + ny * ny <= 1) {
        if (shape.fill) [r, g, b] = shape.fill;
      }
    } else if (shape.type === "line") {
      const sw = shape.strokeWidth || 2;
      if (distToSegmentSq(px, py, shape.x, shape.y, shape.x2!, shape.y2!) <= (sw * sw) / 4) {
        if (shape.stroke) [r, g, b] = shape.stroke;
      }
    } else if (shape.type === "path") {
      const sw = shape.strokeWidth || 2;
      const radiusSq = (sw * sw) / 4;
      if (shape.segments) {
        for (const seg of shape.segments) {
          if (distToSegmentSq(px, py, seg.x1, seg.y1, seg.x2, seg.y2) <= radiusSq) {
            if (shape.stroke) [r, g, b] = shape.stroke;
            break;
          }
        }
      }
    } else if (shape.type === "text" && shape.text) {
      const scale = shape.scale || 1;
      const charWidth = 6 * scale;
      const charHeight = 7 * scale;
      const text = shape.text;
      const totalWidth = text.length * charWidth;
      const startX = shape.x;
      const startY = shape.y - charHeight;

      if (px >= startX && px < startX + totalWidth && py >= startY && py < startY + charHeight) {
        const charIdx = Math.floor((px - startX) / charWidth);
        if (charIdx >= 0 && charIdx < text.length) {
          const char = text[charIdx];
          const col = Math.floor(((px - startX) % charWidth) / scale);
          const row = Math.floor((py - startY) / scale);
          if (isFontPixelActive(char, col, row)) {
            if (shape.fill) [r, g, b] = shape.fill;
          }
        }
      }
    }
  }

  return [r, g, b];
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
      return renderBasePixel(px, py, shapes);
    });

    // Rasterize annotated image with visual markers
    const annotPngBuffer = encodeRgbRaster(width, height, (px, py) => {
      const [r, g, b] = renderBasePixel(px, py, shapes);

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
