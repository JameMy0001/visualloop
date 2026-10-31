# Model provider adapters

VisualLoop separates **visual feedback capture** (Tauri desktop + core service) from **model execution** (agent runner). The provider registry in `adapters/gemini-cli/src/modelProviders.ts` allows contributors to add model transports without rewriting the preview or feedback protocol.

| VISUALLOOP_AI_PROVIDER | Required credentials | API type | Status |
| --- | --- | --- | --- |
| `gemini` (default) | `GEMINI_API_KEY` | Gemini generateContent | Existing integration |
| `openai` | `OPENAI_API_KEY` | Responses API | Mock transport tested; live E2E unverified |
| `anthropic` | `ANTHROPIC_API_KEY` | Messages API | Mock transport tested; live E2E unverified |
| `openai-compatible` | `OPENAI_COMPATIBLE_BASE_URL`, optionally `OPENAI_COMPATIBLE_API_KEY` for local endpoint | Chat completions-style | Service compatibility varies |

Set `VISUALLOOP_AI_MODEL` to the provider-specific model ID. For backward compatibility the default Gemini model and `GEMINI_MODEL` are recognized.

## Usage

Start the core server and desktop with `pnpm start`. Then in a separate terminal:

```bash
# Gemini, default
export GEMINI_API_KEY="..."
pnpm agent:ai examples/solar-system.svg

# OpenAI
export VISUALLOOP_AI_PROVIDER=openai
export VISUALLOOP_AI_MODEL=YOUR_MODEL_ID
export OPENAI_API_KEY="..."
pnpm agent:ai examples/solar-system.svg

# Anthropic
export VISUALLOOP_AI_PROVIDER=anthropic
export VISUALLOOP_AI_MODEL=YOUR_MODEL_ID
export ANTHROPIC_API_KEY="..."
pnpm agent:ai examples/solar-system.svg

# Local OpenAI-compatible service
export VISUALLOOP_AI_PROVIDER=openai-compatible
export VISUALLOOP_AI_MODEL=YOUR_MODEL_ID
export OPENAI_COMPATIBLE_BASE_URL=http://127.0.0.1:1234/v1
pnpm agent:ai examples/solar-system.svg
```

The older `pnpm agent:gemini` command is retained as an alias. When switching providers, reset any old `VISUALLOOP_AI_PROVIDER` and `VISUALLOOP_AI_MODEL` variables. Hosted compatible services must use HTTPS and a key.

## Contributing a provider

Implement and register the `ProviderPlugin` interface:

```ts
import { registerModelProvider } from "@visualloop/adapter-gemini-cli";
registerModelProvider({
  id: "example",
  async generate(input, config) {
    // Use input.prompt and optional input.screenshotDataUrl.
    // Make authenticated requests with config.apiKey and config.model.
    // Return the complete revised source as plain text.
    throw new Error("Implement your provider transport");
  },
});
```

Register the plugin in the runner before using `VISUALLOOP_AI_PROVIDER=example`. Custom adapters can use `VISUALLOOP_AI_API_KEY` or their own injected credentials. The runner remains responsible for syntax/workspace checks, versioned backups, publication, and acknowledgement. Never store API keys in Git, logs, screenshots or source files.

The built-in provider transports are mocked in unit tests. **Live external model calls, native desktop behavior, pixel fidelity and user-visible revisions still require real end-to-end verification**. A green CI run alone is not evidence that all external providers work with all models.
