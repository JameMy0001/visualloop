import { describe, it, expect } from "vitest";
import { screenshotWorker } from "./screenshotWorker.js";
import { decodePngPixels } from "./pngEncoder.js";
import { Annotation } from "@visualloop/protocol";

describe("Capture Fidelity & Pixel-Based Verification", () => {
  it("renders authentic SVG pixels matching element colors and coordinates", async () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
        <rect width="100" height="100" fill="#171717" />
        <circle cx="50" cy="50" r="20" fill="#E14C45" />
      </svg>
    `;

    const result = await screenshotWorker.capture({
      htmlOrSvgContent: svg,
      kind: "svg",
      viewport: {
        width: 100,
        height: 100,
        devicePixelRatio: 1,
        zoom: 1,
        scrollX: 0,
        scrollY: 0,
      },
    });

    expect(result.originalPngBase64).toBeDefined();
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);

    const buf = Buffer.from(result.originalPngBase64, "base64");
    const decoded = decodePngPixels(buf);

    expect(decoded.width).toBe(100);
    expect(decoded.height).toBe(100);

    // Corner pixel should match #171717 -> rgb(23, 23, 23)
    const cornerPixel = decoded.getPixel(5, 5);
    expect(cornerPixel).toEqual([23, 23, 23]);

    // Center pixel should match #E14C45 -> rgb(225, 76, 69)
    const centerPixel = decoded.getPixel(50, 50);
    expect(centerPixel).toEqual([225, 76, 69]);
  });

  it("accurately overlays annotation badges and strokes at normalized coordinates", async () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
        <rect width="200" height="200" fill="#FFFFFF" />
      </svg>
    `;

    const annotation: Annotation = {
      id: "ann_pixel_test",
      type: "circle",
      bounds: { x: 0.2, y: 0.2, width: 0.4, height: 0.4 }, // center at x=80, y=80, rx=40, ry=40
      instruction: "Review circled element",
      color: "#E14C45",
      strokeWidth: 3,
      createdAt: new Date().toISOString(),
    };

    const result = await screenshotWorker.capture({
      htmlOrSvgContent: svg,
      kind: "svg",
      viewport: {
        width: 200,
        height: 200,
        devicePixelRatio: 1,
        zoom: 1,
        scrollX: 0,
        scrollY: 0,
      },
      annotations: [annotation],
    });

    const annotBuf = Buffer.from(result.annotatedPngBase64, "base64");
    const decoded = decodePngPixels(annotBuf);

    // Badge indicator at cx - rx, cy - ry -> (80 - 40, 80 - 40) = (40, 40)
    const badgePixel = decoded.getPixel(40, 40);
    expect(badgePixel).toEqual([225, 76, 69]);
  });

  it("raises an explicit error on headless HTML capture without DOM instead of fabricating blank images", async () => {
    const rawHtml = "<html><body><h1>Hello VisualLoop</h1></body></html>";

    await expect(
      screenshotWorker.capture({
        htmlOrSvgContent: rawHtml,
        kind: "html",
        viewport: {
          width: 300,
          height: 200,
          devicePixelRatio: 1,
          zoom: 1,
          scrollX: 0,
          scrollY: 0,
        },
      })
    ).rejects.toThrow("Headless pixel capture of arbitrary HTML requires an active browser or WebView");
  });
});
