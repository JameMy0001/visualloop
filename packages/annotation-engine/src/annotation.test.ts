import { describe, it, expect } from "vitest";
import {
  calculateArrowGeometry,
  calculateFreehandBounds,
  isPointInBounds,
  AnnotationHistoryManager,
  generateDualCapture,
} from "./index.js";
import { Annotation } from "@visualloop/protocol";

describe("Annotation Engine Geometry & Dual Capture", () => {
  it("calculates arrow geometry angles and head coordinates", () => {
    const start = { x: 0.1, y: 0.1 };
    const end = { x: 0.4, y: 0.5 };
    const arrow = calculateArrowGeometry(start, end, 0.05);

    expect(arrow.start).toEqual(start);
    expect(arrow.end).toEqual(end);
    expect(arrow.arrowHeadLeft.x).toBeGreaterThan(0);
    expect(arrow.arrowHeadRight.x).toBeGreaterThan(0);
    expect(arrow.angleRad).toBeCloseTo(Math.atan2(0.4, 0.3));
  });

  it("calculates minimal bounding box for freehand sketched points", () => {
    const points = [
      { x: 0.2, y: 0.3 },
      { x: 0.5, y: 0.6 },
      { x: 0.1, y: 0.2 },
      { x: 0.4, y: 0.8 },
    ];
    const bounds = calculateFreehandBounds(points);
    expect(bounds.x).toBe(0.1);
    expect(bounds.y).toBe(0.2);
    expect(bounds.width).toBeCloseTo(0.4); // 0.5 - 0.1
    expect(bounds.height).toBeCloseTo(0.6); // 0.8 - 0.2
  });

  it("performs accurate hit testing with point in bounds", () => {
    const bounds = { x: 0.2, y: 0.2, width: 0.4, height: 0.3 };
    expect(isPointInBounds({ x: 0.3, y: 0.3 }, bounds)).toBe(true);
    expect(isPointInBounds({ x: 0.1, y: 0.1 }, bounds, 0)).toBe(false);
    expect(isPointInBounds({ x: 0.19, y: 0.2 }, bounds, 0.02)).toBe(true); // within tolerance
  });

  it("manages undo/redo stacks correctly", () => {
    const manager = new AnnotationHistoryManager(10);
    const ann1: Annotation = {
      id: "a1",
      type: "circle",
      bounds: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      instruction: "First circle",
      color: "#EF4444",
      strokeWidth: 2,
      createdAt: new Date().toISOString(),
    };
    const ann2: Annotation = {
      id: "a2",
      type: "rectangle",
      bounds: { x: 0.4, y: 0.4, width: 0.2, height: 0.2 },
      instruction: "Second rect",
      color: "#3B82F6",
      strokeWidth: 2,
      createdAt: new Date().toISOString(),
    };

    manager.push([]); // state 0
    manager.push([ann1]); // state 1

    expect(manager.canUndo()).toBe(true);
    expect(manager.canRedo()).toBe(false);

    // Undo to state 0
    const undone = manager.undo([ann1, ann2]);
    expect(undone).toEqual([ann1]);
    expect(manager.canRedo()).toBe(true);

    // Redo back
    const redone = manager.redo([ann1]);
    expect(redone).toEqual([ann1, ann2]);
  });

  it("generates dual captures: original and composite annotated SVG with badges", () => {
    const originalSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 800"><circle cx="500" cy="400" r="50"/></svg>`;
    const annotations: Annotation[] = [
      {
        id: "ann_test",
        type: "circle",
        bounds: { x: 0.45, y: 0.35, width: 0.1, height: 0.1 },
        instruction: "Make circle twice as large",
        color: "#EF4444",
        strokeWidth: 3,
        createdAt: new Date().toISOString(),
      },
    ];

    const dual = generateDualCapture(originalSvg, annotations, {
      width: 1000,
      height: 800,
      devicePixelRatio: 1,
      zoom: 1,
      scrollX: 0,
      scrollY: 0,
    });

    expect(dual.originalDataUrl).toContain("data:image/svg+xml;base64");
    expect(dual.annotatedDataUrl).toContain("data:image/svg+xml;base64");
    expect(dual.annotatedSvg).toContain("visualloop-annotations-overlay");
    expect(dual.annotatedSvg).toContain("Make circle twice as large" ? "ann_test" : "");
    expect(dual.annotatedSvg).toContain("<ellipse");
  });
});
