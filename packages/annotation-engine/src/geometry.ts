import { NormalizedBounds, NormalizedPoint } from "@visualloop/protocol";

export interface ArrowGeometry {
  start: NormalizedPoint;
  end: NormalizedPoint;
  arrowHeadLeft: NormalizedPoint;
  arrowHeadRight: NormalizedPoint;
  angleRad: number;
}

/**
 * Calculates arrowhead points given normalized start and end coordinates.
 */
export function calculateArrowGeometry(
  start: NormalizedPoint,
  end: NormalizedPoint,
  headLength: number = 0.025
): ArrowGeometry {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const angle = Math.atan2(dy, dx);
  const headAngle = Math.PI / 6; // 30 degrees

  const leftX = end.x - headLength * Math.cos(angle - headAngle);
  const leftY = end.y - headLength * Math.sin(angle - headAngle);
  const rightX = end.x - headLength * Math.cos(angle + headAngle);
  const rightY = end.y - headLength * Math.sin(angle + headAngle);

  return {
    start,
    end,
    arrowHeadLeft: { x: Math.max(0, Math.min(1, leftX)), y: Math.max(0, Math.min(1, leftY)) },
    arrowHeadRight: { x: Math.max(0, Math.min(1, rightX)), y: Math.max(0, Math.min(1, rightY)) },
    angleRad: angle,
  };
}

/**
 * Calculates the bounding box containing a series of freehand points.
 */
export function calculateFreehandBounds(points: NormalizedPoint[]): NormalizedBounds {
  if (points.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = points[0].x;
  let minY = points[0].y;
  let maxX = points[0].x;
  let maxY = points[0].y;

  for (const pt of points) {
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
  }

  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const width = clamp(maxX - minX);
  const height = clamp(maxY - minY);

  return {
    x: clamp(minX),
    y: clamp(minY),
    width: Math.max(0.01, width),
    height: Math.max(0.01, height),
  };
}

/**
 * Hit test: checks if a normalized point lies inside normalized bounds (with optional tolerance).
 */
export function isPointInBounds(
  point: NormalizedPoint,
  bounds: NormalizedBounds,
  tolerance: number = 0.01
): boolean {
  return (
    point.x >= bounds.x - tolerance &&
    point.x <= bounds.x + bounds.width + tolerance &&
    point.y >= bounds.y - tolerance &&
    point.y <= bounds.y + bounds.height + tolerance
  );
}

/**
 * Calculates letterbox/pillarbox offset and scaling matrix when fitting an artifact into a container.
 */
export function calculateContainMatrix(
  naturalWidth: number,
  naturalHeight: number,
  containerWidth: number,
  containerHeight: number
) {
  const scale = Math.min(containerWidth / naturalWidth, containerHeight / naturalHeight);
  const renderedWidth = naturalWidth * scale;
  const renderedHeight = naturalHeight * scale;
  const offsetX = (containerWidth - renderedWidth) / 2;
  const offsetY = (containerHeight - renderedHeight) / 2;

  return {
    scale,
    renderedWidth,
    renderedHeight,
    offsetX,
    offsetY,
  };
}
