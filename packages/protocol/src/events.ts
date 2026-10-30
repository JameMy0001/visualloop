import { z } from "zod";
import { SessionHandleSchema } from "./session.js";
import { ArtifactPublicationSchema, ArtifactRevisionRecordSchema } from "./artifact.js";
import { FeedbackSubmissionSchema, DeliveryReceiptSchema } from "./feedback.js";
import { WindowStateSchema } from "./window.js";

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
      revision: z.number(),
      entrypoint: z.string(),
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
]);

export type ServerEvent = z.infer<typeof ServerEventSchema>;
