import { z } from "zod";
import { SessionHandleSchema } from "./session.js";
import { ArtifactPublicationSchema, ArtifactRevisionRecordSchema } from "./artifact.js";
import { FeedbackSubmissionSchema, DeliveryReceiptSchema } from "./feedback.js";
import { WindowStateSchema } from "./window.js";
import { ProviderInfoSchema } from "./provider.js";

export const EventTypeSchema = z.enum([
  "session.registered",
  "artifact.published",
  "preview.rendering",
  "preview.ready",
  "feedback.submitted",
  "feedback.delivered",
  "feedback.failed",
  "revision.published",
  "window.state_changed",
  "state.snapshot",
  "provider.updated",
]);

export type EventType = z.infer<typeof EventTypeSchema>;

export const ServerEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("session.registered"),
    timestamp: z.string().datetime(),
    payload: SessionHandleSchema,
  }),
  z.object({
    type: z.literal("artifact.published"),
    timestamp: z.string().datetime(),
    payload: ArtifactPublicationSchema,
  }),
  z.object({
    type: z.literal("preview.rendering"),
    timestamp: z.string().datetime(),
    payload: z.object({
      artifactId: z.string(),
      revision: z.number(),
    }),
  }),
  z.object({
    type: z.literal("preview.ready"),
    timestamp: z.string().datetime(),
    payload: z.object({
      artifactId: z.string(),
      sessionId: z.string().optional(),
      revision: z.number(),
      entrypoint: z.string(),
      kind: z.enum(["svg", "html"]).optional(),
      title: z.string().optional(),
      content: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal("feedback.submitted"),
    timestamp: z.string().datetime(),
    payload: FeedbackSubmissionSchema,
  }),
  z.object({
    type: z.literal("feedback.delivered"),
    timestamp: z.string().datetime(),
    payload: DeliveryReceiptSchema,
  }),
  z.object({
    type: z.literal("feedback.failed"),
    timestamp: z.string().datetime(),
    payload: z.object({
      feedbackId: z.string(),
      error: z.string(),
      recoverable: z.boolean(),
    }),
  }),
  z.object({
    type: z.literal("revision.published"),
    timestamp: z.string().datetime(),
    payload: ArtifactRevisionRecordSchema,
  }),
  z.object({
    type: z.literal("window.state_changed"),
    timestamp: z.string().datetime(),
    payload: z.object({
      previousState: WindowStateSchema,
      currentState: WindowStateSchema,
    }),
  }),
  z.object({
    type: z.literal("state.snapshot"),
    timestamp: z.string().datetime(),
    payload: z.object({
      activeSessionId: z.string().nullable().optional(),
      activeArtifact: z
        .object({
          sessionId: z.string(),
          artifactId: z.string(),
          revision: z.number(),
          kind: z.enum(["svg", "html"]),
          title: z.string().optional(),
          entrypoint: z.string(),
          content: z.string().optional(),
        })
        .nullable()
        .optional(),
      sessions: z.array(SessionHandleSchema).optional(),
    }),
  }),
  z.object({
    type: z.literal("provider.updated"),
    timestamp: z.string().datetime(),
    payload: ProviderInfoSchema,
  }),
]);

export type ServerEvent = z.infer<typeof ServerEventSchema>;
