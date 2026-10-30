import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Validates Origin header using strict URL parsing and exact hostname verification.
 * Prevents bypasses like 'http://attacker-localhost.com' or 'http://127.0.0.1.attacker.com'.
 */
export function isValidOrigin(origin?: string): boolean {
  if (!origin) return true; // Direct non-browser CLI or curl requests have no origin header
  if (origin === "null") return true; // Sandboxed iframes (without allow-same-origin) send origin "null"

  // Standard Tauri 2 origins
  if (origin === "tauri://localhost" || origin.startsWith("tauri://")) return true;
  if (origin === "http://tauri.localhost" || origin.startsWith("http://tauri.localhost")) return true;

  try {
    const parsed = new URL(origin);
    // Only allow http or https protocols
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();
    // Exact hostname validation only - no substring matching
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

/**
 * Resolves or generates the secure local authentication token.
 * Priority order:
 * 1. Explicitly passed token argument
 * 2. VISUALLOOP_SECRET_TOKEN environment variable
 * 3. Token stored in ~/.visualloop/auth_token (persisted with 0600 mode)
 * 4. Freshly generated crypto token saved to ~/.visualloop/auth_token
 */
export function resolveOrCreateAuthToken(explicitToken?: string): string {
  if (explicitToken && explicitToken.trim().length > 0) {
    return explicitToken.trim();
  }

  if (process.env.VISUALLOOP_SECRET_TOKEN && process.env.VISUALLOOP_SECRET_TOKEN.trim().length > 0) {
    return process.env.VISUALLOOP_SECRET_TOKEN.trim();
  }

  const configDir = path.join(os.homedir(), ".visualloop");
  const tokenFile = path.join(configDir, "auth_token");

  try {
    if (fs.existsSync(tokenFile)) {
      const saved = fs.readFileSync(tokenFile, "utf-8").trim();
      if (saved.length > 0) return saved;
    }

    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    }

    const generated = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(tokenFile, generated, { encoding: "utf-8", mode: 0o600 });
    return generated;
  } catch {
    // Fallback to ephemeral random token if disk write fails
    return crypto.randomBytes(32).toString("hex");
  }
}
