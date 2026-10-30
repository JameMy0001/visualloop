import { describe, it, expect } from "vitest";
import {
  normalizePoint,
  denormalizePoint,
  normalizeBounds,
  denormalizeBounds,
  calculateFitViewport,
} from "./coordinates.js";

describe("Coordinates Normalization", () => {
  const viewport = { width: 800, height: 600 };

  it("normalizes points correctly within [0, 1]", () => {
    const pt = { x: 400, y: 300 };
    const norm = normalizePoint(pt, viewport);
    expect(norm.x).toBe(0.5);
    expect(norm.y).toBe(0.5);
  });

  it("clamps points outside viewport range", () => {
    const pt = { x: -100, y: 900 };
    const norm = normalizePoint(pt, viewport);
    expect(norm.x).toBe(0);
    expect(norm.y).toBe(1);
  });

  it("denormalizes points back accurately", () => {
    const norm = { x: 0.25, y: 0.75 };
    const pt = denormalizePoint(norm, viewport);
    expect(pt.x).toBe(200);
    expect(pt.y).toBe(450);
  });

  it("normalizes and denormalizes bounding boxes", () => {
    const rect = { x: 80, y: 60, width: 240, height: 180 };
    const norm = normalizeBounds(rect, viewport);
    expect(norm.x).toBeCloseTo(0.1);
    expect(norm.y).toBeCloseTo(0.1);
    expect(norm.width).toBeCloseTo(0.3);
    expect(norm.height).toBeCloseTo(0.3);

    const denorm = denormalizeBounds(norm, viewport);
    expect(denorm.x).toBeCloseTo(rect.x);
    expect(denorm.y).toBeCloseTo(rect.y);
    expect(denorm.width).toBeCloseTo(rect.width);
    expect(denorm.height).toBeCloseTo(rect.height);
  });

  it("calculates fit viewport scale preserving aspect ratio", () => {
    const artifact = { width: 1000, height: 500 }; // 2:1 ratio
    const container = { width: 500, height: 500 };

    const fit = calculateFitViewport(artifact, container);
    expect(fit.width).toBe(500);
    expect(fit.height).toBe(250);
    expect(fit.zoom).toBe(0.5);
  });
});
