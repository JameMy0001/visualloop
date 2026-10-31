import fs from "node:fs";
import path from "node:path";

/**
 * Optional provider transports for VisualLoop's existing feedback/revision runner.
 * Provider output is UNTRUSTED source: the caller must validate, back up and
 * atomically write it with applyRevisionSafely before acknowledging feedback.
 */
export interface ModelInput { prompt: string; screenshotDataUrl?: string }
export interface ProviderConfig {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
}
export interface ProviderPlugin {
  id: string;
  generate(input: ModelInput, config: ProviderConfig): Promise<string>;
}
export interface ProviderOutput { provider: string; model: string; source: string }

const plugins = new Map<string, ProviderPlugin>();
const defaults: Record<string, string> = {
  gemini: "gemini-3.8-flash",
  openai: "gpt-4.1-mini",
  anthropic: "claude-sonnet-4-5",
};
const keyNames: Record<string, string> = {
  gemini: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  "openai-compatible": "OPENAI_COMPATIBLE_API_KEY",
};

export function providerConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ProviderConfig {
  let fileConfig: any = {};
  try {
    const configPath =
      env.VISUALLOOP_CONFIG_PATH ||
      (env.HOME || env.USERPROFILE
        ? path.join(env.HOME || env.USERPROFILE!, ".visualloop", "provider_config.json")
        : "");
    if (configPath && fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf-8");
      fileConfig = JSON.parse(raw);
    }
  } catch {
    // Ignore config file read errors and proceed to env checks
  }

  const provider = (env.VISUALLOOP_AI_PROVIDER || fileConfig.provider || "gemini").trim().toLowerCase();
  const model =
    env.VISUALLOOP_AI_MODEL ||
    (provider === "gemini" ? env.GEMINI_MODEL : undefined) ||
    fileConfig.providerModels?.[provider] ||
    (fileConfig.provider === provider ? fileConfig.model : undefined) ||
    defaults[provider];

  if (!model) throw new Error("Set VISUALLOOP_AI_MODEL to select a model for " + provider);

  const envKey = env[keyNames[provider] || "VISUALLOOP_AI_API_KEY"];
  const fileKey =
    fileConfig.providerKeys?.[provider] ||
    (fileConfig.provider === provider ? fileConfig.apiKey : undefined);

  return {
    provider,
    model,
    apiKey: envKey || fileKey,
    baseUrl: env.OPENAI_COMPATIBLE_BASE_URL || fileConfig.baseUrl,
  };
}

function localHttp(url: URL): boolean {
  return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}
function compatibleUrl(config: ProviderConfig): string {
  if (!config.baseUrl) throw new Error("OPENAI_COMPATIBLE_BASE_URL is required.");
  const url = new URL(config.baseUrl);
  if (url.username || url.password || url.hash || url.search) throw new Error("Invalid provider base URL.");
  if (url.protocol !== "https:" && !localHttp(url)) throw new Error("Remote provider endpoints require HTTPS.");
  return url.href.replace(/\/+$/, "") + "/chat/completions";
}
export function hasModelCredentials(config: ProviderConfig): boolean {
  if (config.apiKey?.trim()) return true;
  if (config.provider !== "openai-compatible") return false;
  try { return localHttp(new URL(compatibleUrl(config))); } catch { return false; }
}
function requiredKey(config: ProviderConfig): string {
  if (!config.apiKey?.trim()) throw new Error("Missing API key for provider " + config.provider);
  return config.apiKey.trim();
}
function screenshot(url?: string): { mimeType: string; data: string } | undefined {
  if (!url) return undefined;
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(url);
  if (!match) throw new Error("Expected an annotated screenshot as base64 PNG, JPEG, or WebP.");
  return { mimeType: match[1], data: match[2] };
}
async function requestJson(url: string, body: unknown, headers: Record<string, string>, ms = 60000): Promise<any> {
  const result = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(ms),
  });
  // Do not echo server response bodies, which can expose credentials.
  if (!result.ok) throw new Error("Provider returned HTTP " + result.status + ". Check credentials, model, and quota.");
  return result.json();
}
export function registerModelProvider(plugin: ProviderPlugin): void {
  if (!/^[a-z][a-z0-9-]*$/.test(plugin.id) || plugins.has(plugin.id)) {
    throw new Error("Invalid or duplicate model provider ID: " + plugin.id);
  }
  plugins.set(plugin.id, plugin);
}

registerModelProvider({
  id: "gemini",
  async generate(input, config) {
    const parts: any[] = [{ text: input.prompt }];
    const image = screenshot(input.screenshotDataUrl);
    if (image) parts.push({ inlineData: image });
    const data = await requestJson(
      "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(config.model) + ":generateContent",
      { contents: [{ role: "user", parts }] },
      { "x-goog-api-key": requiredKey(config) }, config.timeoutMs
    );
    return (data.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join("\n");
  },
});
registerModelProvider({
  id: "openai",
  async generate(input, config) {
    const content: any[] = [{ type: "input_text", text: input.prompt }];
    if (input.screenshotDataUrl) {
      screenshot(input.screenshotDataUrl);
      content.push({ type: "input_image", image_url: input.screenshotDataUrl });
    }
    const data = await requestJson("https://api.openai.com/v1/responses",
      { model: config.model, input: [{ role: "user", content }], store: false },
      { Authorization: "Bearer " + requiredKey(config) }, config.timeoutMs);
    return (data.output || []).flatMap((item: any) => item.content || [])
      .filter((item: any) => item.type === "output_text").map((item: any) => item.text || "").join("\n")
      || data.output_text || "";
  },
});
registerModelProvider({
  id: "anthropic",
  async generate(input, config) {
    const content: any[] = [{ type: "text", text: input.prompt }];
    const image = screenshot(input.screenshotDataUrl);
    if (image) content.push({ type: "image", source: { type: "base64", media_type: image.mimeType, data: image.data } });
    const data = await requestJson("https://api.anthropic.com/v1/messages",
      { model: config.model, max_tokens: 8192, messages: [{ role: "user", content }] },
      { "x-api-key": requiredKey(config), "anthropic-version": "2023-06-01" }, config.timeoutMs);
    return (data.content || []).filter((item: any) => item.type === "text")
      .map((item: any) => item.text || "").join("\n");
  },
});
registerModelProvider({
  id: "openai-compatible",
  async generate(input, config) {
    const url = compatibleUrl(config);
    const headers: Record<string, string> = {};
    if (config.apiKey?.trim()) headers.Authorization = "Bearer " + config.apiKey.trim();
    else if (!localHttp(new URL(url))) throw new Error("Remote compatible endpoints require an API key.");
    // Not all OpenAI-compatible servers support vision; send text and coordinates.
    const data = await requestJson(url,
      { model: config.model, messages: [{ role: "user", content: input.prompt }] }, headers, config.timeoutMs);
    const content = data.choices?.[0]?.message?.content;
    return typeof content === "string" ? content : Array.isArray(content)
      ? content.filter((p: any) => p.type === "text").map((p: any) => p.text || "").join("\n") : "";
  },
});

export function extractSourceCode(text: string): string {
  const codeBlock = /```(?:svg|xml|html|jsx|tsx|typescript|javascript)?\s*([\s\S]*?)```/i.exec(text);
  return (codeBlock ? codeBlock[1] : text).trim();
}
export async function generateRevisionWithProvider(input: ModelInput, config: ProviderConfig): Promise<ProviderOutput> {
  if (!input.prompt.trim()) throw new Error("Empty revision prompt.");
  const plugin = plugins.get(config.provider);
  if (!plugin) throw new Error("Unknown model provider: " + config.provider);
  const text = (await plugin.generate(input, config)).trim();
  if (!text) throw new Error("Model provider returned empty text.");
  return { provider: config.provider, model: config.model, source: extractSourceCode(text) };
}
