import { describe, it, expect } from "vitest";
import path from "node:path";
import { loadArtifact } from "./artifactLoader.js";

describe("Artifact Loader & Safe Resolution", () => {
  const workspaceRoot = path.resolve(__dirname, "../../../examples");

  it("loads and sanitizes demo SVG solar system", async () => {
    const artifact = await loadArtifact(workspaceRoot, "solar-system.svg");
    expect(artifact.kind).toBe("svg");
    expect(artifact.content).toContain("<svg");
    expect(artifact.content).toContain("VISUALLOOP DEMO");
    expect(artifact.contentHash).toBeDefined();
    expect(artifact.sizeBytes).toBeGreaterThan(500);
  });

  it("loads and sandboxes demo HTML animated card", async () => {
    const artifact = await loadArtifact(workspaceRoot, "animated-card/index.html");
    expect(artifact.kind).toBe("html");
    expect(artifact.content).toContain("Content-Security-Policy");
    expect(artifact.content).toContain("VisualLoop Agent Card");
    expect(artifact.contentHash).toBeDefined();
    expect(artifact.sizeBytes).toBeGreaterThan(100);
  });
});
