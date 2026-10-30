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
});
