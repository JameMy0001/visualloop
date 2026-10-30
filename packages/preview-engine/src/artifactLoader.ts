import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { ArtifactKind } from "@visualloop/protocol";
import { validateArtifactPath } from "./pathSecurity.js";
import { sanitizeSvg, generateSandboxedHtml } from "./sanitizer.js";

export interface LoadedArtifact {
  filePath: string;
  kind: ArtifactKind;
  content: string;
  rawContent: string;
  contentHash: string;
  sizeBytes: number;
}

export async function loadArtifact(
  workspaceRoot: string,
  entrypoint: string,
  explicitKind?: ArtifactKind
): Promise<LoadedArtifact> {
  const verifiedPath = validateArtifactPath(workspaceRoot, entrypoint);
  const ext = path.extname(verifiedPath).toLowerCase();

  const kind: ArtifactKind =
    explicitKind || (ext === ".svg" ? "svg" : "html");

  const rawBuffer = fs.readFileSync(verifiedPath);
  const rawContent = rawBuffer.toString("utf-8");
  const contentHash = crypto.createHash("sha256").update(rawBuffer).digest("hex");

  let content = rawContent;
  if (kind === "svg") {
    content = sanitizeSvg(rawContent);
  } else {
    content = generateSandboxedHtml(rawContent, {
      allowInlineScripts: true,
      allowInlineStyles: true,
      cspConnectSrc: "'none'",
    });
  }

  return {
    filePath: verifiedPath,
    kind,
    content,
    rawContent,
    contentHash,
    sizeBytes: rawBuffer.length,
  };
}
