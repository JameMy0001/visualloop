import {
  Annotation,
  Viewport,
  denormalizeBounds,
  denormalizePoint,
} from "@visualloop/protocol";

export interface DualCaptureResult {
  originalSvg: string;
  annotatedSvg: string;
  originalDataUrl: string;
  annotatedDataUrl: string;
}

/**
 * Generates an SVG string representation of the annotation layer
 * overlayed directly on top of the original SVG or viewport content.
 */
export function generateCompositeAnnotatedSvg(
  originalSvg: string,
  annotations: Annotation[],
  viewport: Viewport
): string {
  const vpWidth = viewport.width;
  const vpHeight = viewport.height;

  const annotationMarkup = annotations
    .map((ann, idx) => {
      const bounds = denormalizeBounds(ann.bounds, { width: vpWidth, height: vpHeight });
      const strokeWidth = ann.strokeWidth || 3;
      const color = ann.color || "#EF4444";
      const badgeRadius = 12;

      let shapeMarkup = "";

      if (ann.type === "circle" || ann.type === "ellipse") {
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        const rx = bounds.width / 2;
        const ry = bounds.height / 2;

        shapeMarkup = `
          <ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}"
            fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-dasharray="6 4" />
          <circle cx="${(cx - rx).toFixed(1)}" cy="${(cy - ry).toFixed(1)}" r="${badgeRadius}" fill="${color}" />
          <text x="${(cx - rx).toFixed(1)}" y="${(cy - ry + 4).toFixed(1)}" fill="#ffffff" font-size="11" font-family="system-ui, sans-serif" font-weight="bold" text-anchor="middle">${idx + 1}</text>
        `;
      } else if (ann.type === "arrow") {
        const start = denormalizePoint({ x: ann.bounds.x, y: ann.bounds.y }, { width: vpWidth, height: vpHeight });
        const end = denormalizePoint(
          { x: ann.bounds.x + ann.bounds.width, y: ann.bounds.y + ann.bounds.height },
          { width: vpWidth, height: vpHeight }
        );

        shapeMarkup = `
          <line x1="${start.x.toFixed(1)}" y1="${start.y.toFixed(1)}" x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(1)}"
            stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" marker-end="url(#arrowhead_${ann.id})" />
          <circle cx="${start.x.toFixed(1)}" cy="${start.y.toFixed(1)}" r="${badgeRadius}" fill="${color}" />
          <text x="${start.x.toFixed(1)}" y="${(start.y + 4).toFixed(1)}" fill="#ffffff" font-size="11" font-family="system-ui, sans-serif" font-weight="bold" text-anchor="middle">${idx + 1}</text>
        `;
      } else if (ann.type === "freehand" && ann.points && ann.points.length > 1) {
        const denormPoints = ann.points.map((p) =>
          denormalizePoint(p, { width: vpWidth, height: vpHeight })
        );
        const polyPoints = denormPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

        shapeMarkup = `
          <polyline points="${polyPoints}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />
          <circle cx="${denormPoints[0].x.toFixed(1)}" cy="${denormPoints[0].y.toFixed(1)}" r="${badgeRadius}" fill="${color}" />
          <text x="${denormPoints[0].x.toFixed(1)}" y="${(denormPoints[0].y + 4).toFixed(1)}" fill="#ffffff" font-size="11" font-family="system-ui, sans-serif" font-weight="bold" text-anchor="middle">${idx + 1}</text>
        `;
      } else {
        // Default: Rectangle
        shapeMarkup = `
          <rect x="${bounds.x.toFixed(1)}" y="${bounds.y.toFixed(1)}" width="${bounds.width.toFixed(1)}" height="${bounds.height.toFixed(1)}"
            rx="6" fill="rgba(255,255,255,0.06)" stroke="${color}" stroke-width="${strokeWidth}" stroke-dasharray="6 4" />
          <circle cx="${bounds.x.toFixed(1)}" cy="${bounds.y.toFixed(1)}" r="${badgeRadius}" fill="${color}" />
          <text x="${bounds.x.toFixed(1)}" y="${(bounds.y + 4).toFixed(1)}" fill="#ffffff" font-size="11" font-family="system-ui, sans-serif" font-weight="bold" text-anchor="middle">${idx + 1}</text>
        `;
      }

      return `<!-- Annotation #${idx + 1} -->\n<g id="visualloop_ann_${ann.id}">\n${shapeMarkup}\n</g>`;
    })
    .join("\n");

  const compositeLayer = `
  <!-- VisualLoop Composite Annotations Layer -->
  <g id="visualloop-annotations-overlay">
${annotationMarkup}
  </g>
</svg>`;

  const closingIndex = originalSvg.lastIndexOf("</svg>");
  if (closingIndex !== -1) {
    return originalSvg.slice(0, closingIndex) + compositeLayer;
  }

  return originalSvg;
}

/**
 * Converts an SVG string into an SVG Data URL.
 */
export function svgToDataUrl(svgString: string): string {
  const base64 = typeof Buffer !== "undefined"
    ? Buffer.from(svgString, "utf-8").toString("base64")
    : btoa(unescape(encodeURIComponent(svgString)));
  return `data:image/svg+xml;base64,${base64}`;
}

/**
 * Generates both original and annotated capture representations.
 */
export function generateDualCapture(
  originalSvg: string,
  annotations: Annotation[],
  viewport: Viewport
): DualCaptureResult {
  const annotatedSvg = generateCompositeAnnotatedSvg(originalSvg, annotations, viewport);
  return {
    originalSvg,
    annotatedSvg,
    originalDataUrl: svgToDataUrl(originalSvg),
    annotatedDataUrl: svgToDataUrl(annotatedSvg),
  };
}
