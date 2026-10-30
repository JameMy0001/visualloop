import path from "node:path";
import fs from "node:fs";

export class SecurityPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecurityPathError";
  }
}

const ALLOWED_EXTENSIONS = new Set([".svg", ".html", ".htm", ".css", ".js"]);

/**
 * Validates that an artifact path belongs to an explicitly allowed workspace root.
 * Rejects path traversal, null byte injections, unauthorized file extensions,
 * and symlink escapes outside the workspace boundary.
 */
export function validateArtifactPath(workspaceRoot: string, entrypoint: string): string {
  if (!workspaceRoot || typeof workspaceRoot !== "string") {
    throw new SecurityPathError("Invalid workspace root specified.");
  }

  if (!entrypoint || typeof entrypoint !== "string") {
    throw new SecurityPathError("Invalid artifact entrypoint specified.");
  }

  // Reject null byte injection
  if (entrypoint.includes("\0") || workspaceRoot.includes("\0")) {
    throw new SecurityPathError("Null byte injection detected in path.");
  }

  // Canonicalize workspace root
  const canonicalRoot = path.resolve(workspaceRoot);
  if (!fs.existsSync(canonicalRoot) || !fs.statSync(canonicalRoot).isDirectory()) {
    throw new SecurityPathError(`Workspace directory does not exist: ${canonicalRoot}`);
  }

  // Resolve target absolute path
  const targetPath = path.isAbsolute(entrypoint)
    ? path.resolve(entrypoint)
    : path.resolve(canonicalRoot, entrypoint);

  // Check extension
  const ext = path.extname(targetPath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new SecurityPathError(
      `Unsupported artifact file extension: '${ext}'. Allowed: ${Array.from(ALLOWED_EXTENSIONS).join(", ")}`
    );
  }

  // Ensure target exists
  if (!fs.existsSync(targetPath)) {
    throw new SecurityPathError(`Artifact file does not exist: ${targetPath}`);
  }

  // Resolve symlinks to detect escapes
  const realTargetPath = fs.realpathSync(targetPath);
  const realRootPath = fs.realpathSync(canonicalRoot);

  // Target must start with workspace root path
  const relative = path.relative(realRootPath, realTargetPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new SecurityPathError(
      `Security violation: Target artifact escape detected (${realTargetPath} is outside ${realRootPath})`
    );
  }

  return realTargetPath;
}
