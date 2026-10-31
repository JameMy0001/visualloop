import fs from "node:fs";
import path from "node:path";
import { WorkspaceAsset, ArtifactKind } from "@visualloop/protocol";

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".github",
  ".vscode",
  ".cache",
  ".next",
  ".turbo",
  "dist",
  "build",
  "target",
  ".visualloop",
  ".visualloop_backups",
  ".venv",
  "venv",
  "__pycache__",
]);

const EXTENSION_MAP: Record<string, ArtifactKind> = {
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".webp": "image",
  ".gif": "image",
  ".bmp": "image",
  ".svg": "svg",
  ".html": "html",
  ".htm": "html",
  ".pdf": "pdf",
};

export interface WorkspaceScanResult {
  workspaceRoot: string;
  totalAssets: number;
  assets: WorkspaceAsset[];
}

export function scanWorkspaceAssets(
  workspaceRoot: string,
  maxFiles = 200,
  maxDepth = 5
): WorkspaceScanResult {
  const root = path.resolve(workspaceRoot);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    return { workspaceRoot: root, totalAssets: 0, assets: [] };
  }

  const assets: WorkspaceAsset[] = [];

  function traverse(currentDir: string, depth: number) {
    if (depth > maxDepth || assets.length >= maxFiles) return;

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (assets.length >= maxFiles) break;

      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
          traverse(fullPath, depth + 1);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        const kind = EXTENSION_MAP[ext];

        if (kind) {
          try {
            const stat = fs.statSync(fullPath);
            const entrypoint = path.relative(root, fullPath);

            let preview: string | undefined = undefined;

            // Generate lightweight preview for images (< 2MB)
            if (kind === "image" && stat.size <= 2 * 1024 * 1024) {
              const mime =
                ext === ".png"
                  ? "image/png"
                  : ext === ".jpg" || ext === ".jpeg"
                  ? "image/jpeg"
                  : ext === ".webp"
                  ? "image/webp"
                  : "image/png";
              const buf = fs.readFileSync(fullPath);
              preview = `data:${mime};base64,${buf.toString("base64")}`;
            } else if (kind === "svg" && stat.size <= 200 * 1024) {
              preview = fs.readFileSync(fullPath, "utf-8");
            }

            assets.push({
              entrypoint,
              filename: entry.name,
              kind,
              sizeBytes: stat.size,
              modifiedAt: stat.mtime.toISOString(),
              preview,
            });
          } catch {
            // Ignore unreadable files
          }
        }
      }
    }
  }

  traverse(root, 1);

  // Sort newest first
  assets.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

  return {
    workspaceRoot: root,
    totalAssets: assets.length,
    assets,
  };
}
