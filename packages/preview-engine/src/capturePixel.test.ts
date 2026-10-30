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

  it("accurately rasterizes text, path, line, and ellipse elements in SVG", async () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
        <rect width="100" height="100" fill="#FFFFFF" />
        <line x1="10" y1="10" x2="90" y2="10" stroke="#3B82F6" stroke-width="4" />
        <path d="M 10 30 L 90 30" stroke="#EAB308" stroke-width="4" />
        <ellipse cx="50" cy="50" rx="30" ry="10" fill="#E14C45" />
        <text x="20" y="80" font-size="14" fill="#171717">VL</text>
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

    const buf = Buffer.from(result.originalPngBase64, "base64");
    const decoded = decodePngPixels(buf);

    // Line at y=10 should be blue (#3B82F6 -> [59, 130, 246])
    const linePixel = decoded.getPixel(50, 10);
    expect(linePixel).toEqual([59, 130, 246]);

    // Path at y=30 should be yellow (#EAB308 -> [234, 179, 8])
    const pathPixel = decoded.getPixel(50, 30);
    expect(pathPixel).toEqual([234, 179, 8]);

    // Ellipse center at (50, 50) should be red (#E14C45 -> [225, 76, 69])
    const ellipsePixel = decoded.getPixel(50, 50);
    expect(ellipsePixel).toEqual([225, 76, 69]);

    // Text "VL" rendered around y=80 with fill #171717 -> [23, 23, 23]
    // Scan text box (x: 20..40, y: 66..80) to ensure text pixels are rendered
    let foundTextPixel = false;
    for (let x = 20; x <= 40; x++) {
      for (let y = 66; y <= 80; y++) {
        const p = decoded.getPixel(x, y);
        if (p[0] === 23 && p[1] === 23 && p[2] === 23) {
          foundTextPixel = true;
          break;
        }
      }
      if (foundTextPixel) break;
    }
    expect(foundTextPixel).toBe(true);
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
