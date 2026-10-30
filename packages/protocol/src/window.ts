import { z } from "zod";

export const WindowStateSchema = z.enum([
  "hidden",
  "mini_idle",
  "mini_rendering",
  "mini_waiting",
  "expanded",
  "submitting",
  "error",
]);

export type WindowState = z.infer<typeof WindowStateSchema>;

export const WindowModeSchema = z.enum(["mini", "expanded", "hidden"]);
export type WindowMode = z.infer<typeof WindowModeSchema>;

export const WindowPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export type WindowPosition = z.infer<typeof WindowPositionSchema>;

export const WindowSizeSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
});

export type WindowSize = z.infer<typeof WindowSizeSchema>;

export const WindowConfigSchema = z.object({
  mode: WindowModeSchema,
  state: WindowStateSchema,
  alwaysOnTop: z.boolean().default(true),
  clickThrough: z.boolean().default(false),
  opacity: z.number().min(0).max(1).default(0.8),
  position: WindowPositionSchema.optional(),
  size: WindowSizeSchema,
  miniSize: WindowSizeSchema.default({ width: 360, height: 240 }),
  expandedSize: WindowSizeSchema.default({ width: 1024, height: 768 }),
});

export type WindowConfig = z.infer<typeof WindowConfigSchema>;
