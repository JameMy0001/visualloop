import { describe, it, expect } from "vitest";
import path from "node:path";
import { validateArtifactPath, SecurityPathError } from "./pathSecurity.js";

describe("Path Security & Boundary Enforcement", () => {
  const workspaceRoot = path.resolve(__dirname, "../../../examples");

  it("permits valid artifact files inside the workspace", () => {
    const verified = validateArtifactPath(workspaceRoot, "solar-system.svg");
    expect(verified).toContain("solar-system.svg");
    expect(verified.startsWith(workspaceRoot)).toBe(true);
  });

  it("blocks directory traversal attempts (..)", () => {
    expect(() =>
      validateArtifactPath(workspaceRoot, "../../package.json")
    ).toThrow(SecurityPathError);
  });

  it("blocks arbitrary system path lookups (/etc/passwd)", () => {
    expect(() =>
      validateArtifactPath(workspaceRoot, "/etc/passwd")
    ).toThrow(SecurityPathError);
  });

  it("blocks null byte injection attempts", () => {
    expect(() =>
      validateArtifactPath(workspaceRoot, "solar-system.svg\0.html")
    ).toThrow("Null byte injection");
  });

  it("blocks forbidden file extensions (.sh, .exe, .py)", () => {
    expect(() =>
      validateArtifactPath(workspaceRoot, "script.sh")
    ).toThrow("Unsupported artifact file extension");
  });

  it("rejects non-existent artifact files", () => {
    expect(() =>
      validateArtifactPath(workspaceRoot, "non-existent.svg")
    ).toThrow("Artifact file does not exist");
  });
});
