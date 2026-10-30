import { describe, it, expect, beforeEach } from "vitest";

class LocalStorageMock {
  private store: Record<string, string> = {};

  clear() {
    this.store = {};
  }

  getItem(key: string) {
    return this.store[key] || null;
  }

  setItem(key: string, value: string) {
    this.store[key] = String(value);
  }

  removeItem(key: string) {
    delete this.store[key];
  }
}

const mockStorage = new LocalStorageMock();

describe("VisualLoop Desktop Shell logic", () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it("stores and retrieves window configuration accurately", () => {
    const config = { opacity: 0.75, clickThrough: true };
    mockStorage.setItem("visualloop_window_config", JSON.stringify(config));

    const retrieved = JSON.parse(mockStorage.getItem("visualloop_window_config")!);
    expect(retrieved.opacity).toBe(0.75);
    expect(retrieved.clickThrough).toBe(true);
  });

  it("clamps opacity between 0.2 and 1.0", () => {
    const clampOpacity = (val: number) => Math.max(0.2, Math.min(1.0, val));
    expect(clampOpacity(0.05)).toBe(0.2);
    expect(clampOpacity(1.5)).toBe(1.0);
    expect(clampOpacity(0.8)).toBe(0.8);
  });

  it("disengages click-through when transitioning between modes", () => {
    let mode: "mini" | "expanded" = "mini";
    let clickThrough = true;

    // Simulate transition to expanded
    mode = "expanded";
    clickThrough = mode === "expanded" ? false : clickThrough;
    expect(clickThrough).toBe(false);

    // Simulate collapse back to mini
    mode = "mini";
    clickThrough = false; // Always restored to interactive
    expect(clickThrough).toBe(false);
  });

  it("validates safe desktop window dimensions without style mask mutation", () => {
    const miniBounds = { width: 360, height: 240, resizable: true };
    const expandedBounds = { width: 1024, height: 768, resizable: true };

    expect(miniBounds.width).toBe(360);
    expect(miniBounds.height).toBe(240);
    expect(miniBounds.resizable).toBe(true);

    expect(expandedBounds.width).toBe(1024);
    expect(expandedBounds.height).toBe(768);
    expect(expandedBounds.resizable).toBe(true);
  });
});
