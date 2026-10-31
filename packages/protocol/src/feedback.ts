import { z } from "zod";
import { ViewportSchema } from "./artifact.js";

export const FeedbackStatusSchema = z.enum([
  "draft",
  "submitted",
  "queued",
  "delivered",
  "acknowledged",
  "revision_published",
  "failed",
  "cancelled",
]);

export type FeedbackStatus = z.infer<typeof FeedbackStatusSchema>;

export const NormalizedBoundsSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
});

export type NormalizedBounds = z.infer<typeof NormalizedBoundsSchema>;

export const NormalizedPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

export type NormalizedPoint = z.infer<typeof NormalizedPointSchema>;

export const AnnotationTypeSchema = z.enum([
  "circle",
  "ellipse",
  "rectangle",
  "arrow",
  "freehand",
  "text",
]);

export type AnnotationType = z.infer<typeof AnnotationTypeSchema>;

export const AnnotationSchema = z.object({
  id: z.string().min(1),
  type: AnnotationTypeSchema,
  bounds: NormalizedBoundsSchema,
  points: z.array(NormalizedPointSchema).optional(),
  instruction: z.string().default(""),
  color: z.string().default("#EF4444"),
  strokeWidth: z.number().positive().default(2),
  createdAt: z.string().datetime(),
});

export type Annotation = z.infer<typeof AnnotationSchema>;

export const FeedbackSubmissionSchema = z
  .object({
    protocolVersion: z.literal("1.0").default("1.0"),
    feedbackId: z.string().min(1),
    sessionId: z.string().min(1),
    artifactId: z.string().min(1),
    revision: z.number().int().nonnegative(),
    viewport: ViewportSchema,
    annotations: z.array(AnnotationSchema).default([]),
    generalInstruction: z.string().optional(),
    preferredModel: z.string().optional(),
    preferredProvider: z.string().optional(),
    originalScreenshotPath: z.string().optional(),
    annotatedScreenshotPath: z.string().optional(),
    originalScreenshotDataUrl: z.string().optional(),
    annotatedScreenshotDataUrl: z.string().optional(),
    idempotencyKey: z.string().min(1),
    createdAt: z.string().datetime(),
  })
  .refine(
    (data) =>
      data.annotations.length > 0 ||
      (typeof data.generalInstruction === "string" && data.generalInstruction.trim().length > 0),
    {
      message: "Feedback must contain at least one visual annotation or a general instruction.",
    }
  );

export type FeedbackSubmission = z.infer<typeof FeedbackSubmissionSchema>;

export const DeliveryReceiptSchema = z.object({
  feedbackId: z.string().min(1),
  sessionId: z.string().min(1),
  status: FeedbackStatusSchema,
  deliveredAt: z.string().datetime(),
  adapterMessage: z.string().optional(),
  retryAfterMs: z.number().int().positive().optional(),
});

export type DeliveryReceipt = z.infer<typeof DeliveryReceiptSchema>;
