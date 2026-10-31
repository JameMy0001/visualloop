import { z } from "zod";

export const AgentCapabilitiesSchema = z.object({
  supportsDirectInjection: z.boolean().default(false),
  supportsFilePolling: z.boolean().default(true),
  supportsStreaming: z.boolean().default(false),
  acceptedArtifactKinds: z.array(z.enum(["svg", "html", "react", "canvas", "image", "slide", "pdf"])).default(["svg", "html", "image"]),
});

export type AgentCapabilities = z.infer<typeof AgentCapabilitiesSchema>;

export const SessionRegistrationSchema = z.object({
  adapterId: z.string().min(1),
  agentName: z.string().min(1),
  workspaceRoot: z.string().min(1),
  capabilities: AgentCapabilitiesSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type SessionRegistration = z.infer<typeof SessionRegistrationSchema>;

export const SessionHandleSchema = z.object({
  sessionId: z.string().min(1),
  adapterId: z.string().min(1),
  workspaceRoot: z.string().min(1),
  capabilities: AgentCapabilitiesSchema,
  createdAt: z.string().datetime(),
  lastActiveAt: z.string().datetime(),
});

export type SessionHandle = z.infer<typeof SessionHandleSchema>;
