import { NormalizedBounds, NormalizedPoint } from "./feedback.js";
import { Viewport } from "./artifact.js";

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PixelPoint {
  x: number;
  y: number;
}

/**
 * Normalizes absolute pixel coordinates to [0, 1] relative to the target viewport.
 * Clamps coordinates to ensure they stay strictly within normalized boundaries.
 */
export function normalizePoint(
  point: PixelPoint,
  viewport: { width: number; height: number }
): NormalizedPoint {
  const clamp = (val: number) => Math.max(0, Math.min(1, val));
  return {
    x: clamp(point.x / viewport.width),
    y: clamp(point.y / viewport.height),
  };
}

/**
 * Denormalizes a normalized point [0, 1] back into pixel coordinates for a given viewport.
 */
export function denormalizePoint(
  point: NormalizedPoint,
  viewport: { width: number; height: number }
): PixelPoint {
  return {
    x: point.x * viewport.width,
    y: point.y * viewport.height,
  };
}

/**
 * Normalizes a pixel bounding box into [0, 1] viewport space.
 */
export function normalizeBounds(
  rect: PixelRect,
  viewport: { width: number; height: number }
): NormalizedBounds {
  const clamp = (val: number) => Math.max(0, Math.min(1, val));
  const normX = clamp(rect.x / viewport.width);
  const normY = clamp(rect.y / viewport.height);
  const normW = clamp(rect.width / viewport.width);
  const normH = clamp(rect.height / viewport.height);

  return {
    x: normX,
    y: normY,
    width: Math.min(normW, 1 - normX),
    height: Math.min(normH, 1 - normY),
  };
}

/**
 * Denormalizes a normalized bounding box back into pixel coordinates.
 */
export function denormalizeBounds(
  bounds: NormalizedBounds,
  viewport: { width: number; height: number }
): PixelRect {
  return {
    x: bounds.x * viewport.width,
    y: bounds.y * viewport.height,
    width: bounds.width * viewport.width,
    height: bounds.height * viewport.height,
  };
}

/**
 * Computes rendered viewport scale and offsets when an artifact is fit (contain) inside a container.
 */
export function calculateFitViewport(
  artifactNatural: { width: number; height: number },
  container: { width: number; height: number }
): Viewport {
  const scale = Math.min(
    container.width / artifactNatural.width,
    container.height / artifactNatural.height
  );

  return {
    width: artifactNatural.width * scale,
    height: artifactNatural.height * scale,
    devicePixelRatio: typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
    zoom: scale,
    scrollX: 0,
    scrollY: 0,
  };
}
