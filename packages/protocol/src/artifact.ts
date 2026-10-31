import { z } from "zod";

export const ArtifactKindSchema = z.enum(["svg", "html", "image", "slide", "pdf"]);
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;

export const WorkspaceAssetSchema = z.object({
  entrypoint: z.string(),
  filename: z.string(),
  kind: ArtifactKindSchema,
  sizeBytes: z.number(),
  modifiedAt: z.string(),
  preview: z.string().optional(),
});

export type WorkspaceAsset = z.infer<typeof WorkspaceAssetSchema>;

export const ViewportSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  devicePixelRatio: z.number().positive().default(1),
  zoom: z.number().positive().default(1),
  scrollX: z.number().default(0),
  scrollY: z.number().default(0),
});

export type Viewport = z.infer<typeof ViewportSchema>;

export const ArtifactPublicationSchema = z.object({
  sessionId: z.string().min(1),
  artifactId: z.string().min(1),
  revision: z.number().int().nonnegative().default(1),
  kind: ArtifactKindSchema,
  entrypoint: z.string().min(1),
  title: z.string().optional(),
  viewport: ViewportSchema.optional(),
  content: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type ArtifactPublication = z.infer<typeof ArtifactPublicationSchema>;

export const ArtifactRevisionRecordSchema = z.object({
  artifactId: z.string().min(1),
  sessionId: z.string().min(1),
  revision: z.number().int().nonnegative(),
  kind: ArtifactKindSchema,
  entrypoint: z.string().min(1),
  contentHash: z.string().min(1),
  viewport: ViewportSchema,
  createdAt: z.string().datetime(),
});

export type ArtifactRevisionRecord = z.infer<typeof ArtifactRevisionRecordSchema>;
