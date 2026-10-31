import { z } from "zod";

export const AIProviderSchema = z.enum([
  "gemini",
  "openai",
  "anthropic",
  "openai-compatible",
]);
export type AIProvider = z.infer<typeof AIProviderSchema>;

export const ProviderConfigSchema = z.object({
  provider: AIProviderSchema.default("gemini"),
  model: z.string().min(1).optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
});
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const ProviderInfoSchema = z.object({
  provider: AIProviderSchema,
  model: z.string(),
  hasApiKey: z.boolean(),
  maskedApiKey: z.string(),
  baseUrl: z.string().optional(),
});
export type ProviderInfo = z.infer<typeof ProviderInfoSchema>;
