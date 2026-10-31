import { describe, it, expect, vi, afterEach } from "vitest";
import { generateRevisionWithProvider, providerConfigFromEnv, hasModelCredentials, registerModelProvider } from "./modelProviders.js";
afterEach(() => vi.unstubAllGlobals());

describe("model provider transports (mocked; no external API calls)", () => {
  it("preserves Gemini as the default", () => {
    expect(providerConfigFromEnv({ GEMINI_API_KEY: "key" }).provider).toBe("gemini");
    expect(hasModelCredentials(providerConfigFromEnv({}))).toBe(false);
  });
  it("supports selecting custom provider credentials", () => {
    expect(providerConfigFromEnv({ VISUALLOOP_AI_PROVIDER: "openai", OPENAI_API_KEY: "test" }).apiKey).toBe("test");
  });
  it("rejects HTTP to remote compatible endpoints", async () => {
    await expect(generateRevisionWithProvider({prompt:"fix"}, {
      provider:"openai-compatible", model:"demo", baseUrl:"http://example.com/v1", apiKey:"key"
    })).rejects.toThrow("HTTPS");
  });
  it("rejects missing Gemini keys", async () => {
    await expect(generateRevisionWithProvider({prompt:"fix"}, {provider:"gemini",model:"gemini-2.5-flash"})).rejects.toThrow("API key");
  });
  it("uses the OpenAI Responses endpoint", async () => {
    const fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>({output:[{content:[{type:"output_text",text:"<svg></svg>"}]}]})});
    vi.stubGlobal("fetch",fetchMock);
    const result=await generateRevisionWithProvider({prompt:"fix"},{provider:"openai",model:"example",apiKey:"key"});
    expect(result.source).toBe("<svg></svg>");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.openai.com/v1/responses");
  });
  it("uses Anthropic Messages", async () => {
    const fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>({content:[{type:"text",text:"<svg></svg>"}]})});
    vi.stubGlobal("fetch",fetchMock);
    const result=await generateRevisionWithProvider({prompt:"fix"},{provider:"anthropic",model:"example",apiKey:"key"});
    expect(result.source).toBe("<svg></svg>");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.anthropic.com/v1/messages");
  });
  it("supports local compatible endpoints without an API key", async () => {
    const fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>({choices:[{message:{content:"<svg></svg>"}}]})});
    vi.stubGlobal("fetch",fetchMock);
    const result=await generateRevisionWithProvider({prompt:"fix"},{provider:"openai-compatible",model:"local",baseUrl:"http://127.0.0.1:1234/v1"});
    expect(result.source).toBe("<svg></svg>");
    expect(fetchMock.mock.calls[0][0]).toContain("127.0.0.1:1234/v1/chat/completions");
  });
  it("lets contributors register an implementation", async () => {
    registerModelProvider({id:"test-custom",generate:async()=>"<svg></svg>"});
    expect((await generateRevisionWithProvider({prompt:"fix"},{provider:"test-custom",model:"demo"})).source).toBe("<svg></svg>");
  });

  it("reads saved provider configuration from local file fallback", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "visualloop-test-"));
    const configPath = path.join(tmpDir, "provider_config.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        provider: "anthropic",
        model: "claude-3-7-sonnet-20250219",
        apiKey: "sk-ant-from-file-12345",
      })
    );

    const config = providerConfigFromEnv({
      VISUALLOOP_CONFIG_PATH: configPath,
    });
    expect(config.provider).toBe("anthropic");
    expect(config.model).toBe("claude-3-7-sonnet-20250219");
    expect(config.apiKey).toBe("sk-ant-from-file-12345");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
