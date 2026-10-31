import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Validates Origin header using strict URL parsing and exact hostname verification.
 * Prevents bypasses like 'http://attacker-localhost.com', 'http://tauri.localhost.attacker.com',
 * or 'tauri://attacker.com'. Prefix matching is strictly prohibited.
 */
export function isValidOrigin(origin?: string): boolean {
  if (!origin) return true; // Direct non-browser CLI or curl requests have no origin header
  if (origin === "null") return true; // Sandboxed iframes (without allow-same-origin) send origin "null"

  try {
    const parsed = new URL(origin);

    // Exact Tauri 2 scheme & host (macOS / Linux: tauri://localhost, Windows: http://tauri.localhost)
    if (parsed.protocol === "tauri:" && parsed.hostname.toLowerCase() === "localhost") {
      return true;
    }
    if (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.hostname.toLowerCase() === "tauri.localhost"
    ) {
      return true;
    }

    // Only allow http or https protocols for local dev / browser UI
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();
    // Exact hostname validation only - no substring or prefix matching
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

export const DEFAULT_PROVIDER_MODELS: Record<string, string> = {
  gemini: "gemini-3.8-flash",
  openai: "gpt-4o",
  anthropic: "claude-3-7-sonnet-20250219",
  "openai-compatible": "local-model",
};

export const PROVIDER_ENV_KEYS: Record<string, string> = {
  gemini: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  "openai-compatible": "OPENAI_API_KEY",
};

export interface StoredProviderConfig {
  provider: "gemini" | "openai" | "anthropic" | "openai-compatible";
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  providerKeys?: Record<string, string>;
  providerModels?: Record<string, string>;
}

export function getProviderConfigFilePath(customHome?: string): string {
  const home = customHome || process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, ".visualloop", "provider_config.json");
}

export function maskApiKey(apiKey?: string): string {
  if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length === 0) {
    return "";
  }
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) {
    return "••••••••";
  }
  return `${trimmed.slice(0, 4)}••••••••${trimmed.slice(-4)}`;
}

export function readProviderConfigFile(customPath?: string): StoredProviderConfig | null {
  const filePath = customPath || getProviderConfigFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content);
    }
  } catch {
    // Return null on missing or malformed file
  }
  return null;
}

export function writeProviderConfigFile(
  config: StoredProviderConfig,
  customPath?: string
): void {
  const filePath = customPath || getProviderConfigFilePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
}

export function resolveCurrentProviderInfo(customConfigPath?: string) {
  const fileConfig = readProviderConfigFile(customConfigPath) || { provider: "gemini" as const };
  const providerRaw = (process.env.VISUALLOOP_AI_PROVIDER || fileConfig.provider || "gemini").trim().toLowerCase();
  const validProviders = ["gemini", "openai", "anthropic", "openai-compatible"] as const;
  const provider = validProviders.includes(providerRaw as any)
    ? (providerRaw as (typeof validProviders)[number])
    : "gemini";

  const model =
    process.env.VISUALLOOP_AI_MODEL ||
    (provider === "gemini" ? process.env.GEMINI_MODEL : undefined) ||
    fileConfig.providerModels?.[provider] ||
    (fileConfig.provider === provider ? fileConfig.model : undefined) ||
    DEFAULT_PROVIDER_MODELS[provider] ||
    "gemini-3.8-flash";

  const envKey = process.env[PROVIDER_ENV_KEYS[provider]] || process.env.VISUALLOOP_AI_API_KEY;
  const keyFromFile = fileConfig.providerKeys?.[provider] || (fileConfig.provider === provider ? fileConfig.apiKey : undefined);
  const activeKey = envKey || keyFromFile;

  const hasApiKey = Boolean(activeKey && activeKey.trim().length > 0);
  const maskedApiKey = maskApiKey(activeKey);
  const baseUrl = process.env.OPENAI_COMPATIBLE_BASE_URL || fileConfig.baseUrl || undefined;

  return {
    provider,
    model,
    hasApiKey,
    maskedApiKey,
    baseUrl,
  };
}

