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

  const isImage = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"].includes(ext);
  const isSvg = ext === ".svg";
  const isHtml = [".html", ".htm"].includes(ext);

  const kind: ArtifactKind =
    explicitKind || (isSvg ? "svg" : isImage ? "image" : isHtml ? "html" : "html");

  const rawBuffer = fs.readFileSync(verifiedPath);
  const contentHash = crypto.createHash("sha256").update(rawBuffer).digest("hex");

  let content = "";
  let rawContent = "";

  if (kind === "image") {
    const mime =
      ext === ".png"
        ? "image/png"
        : ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : ext === ".webp"
        ? "image/webp"
        : ext === ".gif"
        ? "image/gif"
        : "image/png";
    content = `data:${mime};base64,${rawBuffer.toString("base64")}`;
    rawContent = content;
  } else if (kind === "svg") {
    rawContent = rawBuffer.toString("utf-8");
    content = sanitizeSvg(rawContent);
  } else {
    rawContent = rawBuffer.toString("utf-8");
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
