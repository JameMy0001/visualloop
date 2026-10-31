import Fastify, { FastifyInstance } from "fastify";
import fs from "node:fs";
import path from "node:path";
import {
  generateRevisionWithProvider,
  applyRevisionSafely,
  providerConfigFromEnv,
  hasModelCredentials,
  ProviderConfig,
} from "@visualloop/adapter-gemini-cli";
import {
  SessionRegistrationSchema,
  ArtifactPublicationSchema,
  FeedbackSubmissionSchema,
  FeedbackSubmission,
  ProviderConfigSchema,
  ArtifactKind,
  ServerEvent,
} from "@visualloop/protocol";
import { loadArtifact } from "@visualloop/preview-engine";
import { CoreStore } from "./store.js";
import { WebSocketManager } from "./websocket.js";
import { scanWorkspaceAssets } from "./workspaceScanner.js";
import {
  isValidOrigin,
  resolveOrCreateAuthToken,
  resolveCurrentProviderInfo,
  readProviderConfigFile,
  writeProviderConfigFile,
  DEFAULT_PROVIDER_MODELS,
  PROVIDER_ENV_KEYS,
} from "./security.js";

export interface CoreServerConfig {
  port?: number;
  host?: string;
  secretToken?: string;
  requireAuth?: boolean;
  storageFilePath?: string | null;
}

export class CoreServer {
  private fastify: FastifyInstance;
  public store: CoreStore;
  public ws: WebSocketManager;
  private port: number;
  private host: string;
  private secretToken?: string;

  constructor(config: CoreServerConfig = {}) {
    this.port = config.port ?? 4178;
    this.host = config.host ?? "127.0.0.1";

    // Authentication is strictly required by default unless explicitly disabled with requireAuth: false
    const shouldRequireAuth = config.requireAuth !== false;
    if (shouldRequireAuth || config.secretToken) {
      this.secretToken = config.secretToken || resolveOrCreateAuthToken();
    } else {
      this.secretToken = undefined;
    }

    this.fastify = Fastify({
      logger: false,
      bodyLimit: 10 * 1024 * 1024, // 10MB limit
    });

    const storageFilePath =
      config.storageFilePath !== undefined
        ? config.storageFilePath
        : process.env.NODE_ENV === "test" || process.env.VITEST
        ? null
        : undefined;

    this.store = new CoreStore({ storageFilePath });
    this.ws = new WebSocketManager();

    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Global CORS hook for all incoming requests and preflight OPTIONS
    this.fastify.addHook("onRequest", async (request, reply) => {
      const origin = request.headers.origin;
      if (origin && isValidOrigin(origin)) {
        reply.header("Access-Control-Allow-Origin", origin);
        reply.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
        reply.header(
          "Access-Control-Allow-Headers",
          "Content-Type, Authorization, x-visualloop-token, Origin, Accept"
        );
        reply.header("Access-Control-Max-Age", "86400");
      }

      // Handle CORS preflight OPTIONS requests without requiring authentication
      if (request.method === "OPTIONS") {
        if (!origin || isValidOrigin(origin)) {
          return reply.status(204).send();
        } else {
          return reply
            .status(403)
            .send({ error: "Forbidden: Cross-origin request not permitted" });
        }
      }
    });

    // Authentication and origin security hook
    this.fastify.addHook("preHandler", async (request, reply) => {
      // Exclude preflight OPTIONS and health check from token auth so orchestrators can probe readiness
      if (
        request.method === "OPTIONS" ||
        request.url === "/v1/health" ||
        request.url.startsWith("/v1/health?")
      ) {
        return;
      }

      // Strict origin validation for browser clients
      const origin = request.headers.origin;
      if (!isValidOrigin(origin)) {
        return reply
          .status(403)
          .send({ error: "Forbidden: Cross-origin request not permitted" });
      }

      // Secret token check
      if (this.secretToken && request.url.startsWith("/v1/")) {
        const auth = request.headers["x-visualloop-token"] || request.headers.authorization;
        const providedToken =
          typeof auth === "string" && auth.startsWith("Bearer ")
            ? auth.slice(7).trim()
            : auth;
        if (providedToken !== this.secretToken) {
          return reply
            .status(401)
            .send({ error: "Unauthorized: Invalid or missing secret token" });
        }
      }
    });

    // Health check
    this.fastify.get("/v1/health", async () => {
      return {
        status: "ok",
        version: "1.0",
        clientsConnected: this.ws.getClientCount(),
      };
    });

    // Current State Snapshot
    this.fastify.get("/v1/state", async () => {
      return this.store.getSnapshot();
    });

    // Provider Configuration (GET /v1/config/provider)
    this.fastify.get("/v1/config/provider", async () => {
      return resolveCurrentProviderInfo();
    });

    // Provider Configuration (POST /v1/config/provider)
    this.fastify.post("/v1/config/provider", async (request, reply) => {
      try {
        const body = ProviderConfigSchema.parse(request.body);
        const existing = readProviderConfigFile() || { provider: "gemini" as const };

        const providerKeys = { ...(existing.providerKeys || {}) };
        const providerModels = { ...(existing.providerModels || {}) };

        // Handle API key updates
        if (body.apiKey === "__CLEAR__") {
          delete providerKeys[body.provider];
        } else if (body.apiKey && body.apiKey.trim().length > 0 && !body.apiKey.includes("•")) {
          providerKeys[body.provider] = body.apiKey.trim();
        }

        const modelToSave =
          body.model && body.model.trim().length > 0
            ? body.model.trim()
            : providerModels[body.provider] || DEFAULT_PROVIDER_MODELS[body.provider] || "gemini-3.8-flash";
        providerModels[body.provider] = modelToSave;

        const updatedConfig = {
          provider: body.provider,
          model: modelToSave,
          apiKey: providerKeys[body.provider] || "",
          baseUrl: body.baseUrl !== undefined ? body.baseUrl : existing.baseUrl,
          providerKeys,
          providerModels,
        };

        writeProviderConfigFile(updatedConfig);
        const updatedInfo = resolveCurrentProviderInfo();

        this.ws.broadcast({
          type: "provider.updated",
          timestamp: new Date().toISOString(),
          payload: updatedInfo,
        });

        return reply.status(200).send({
          success: true,
          ...updatedInfo,
        });
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    });

    // 1. Session Registration
    this.fastify.post("/v1/sessions", async (request, reply) => {
      try {
        const parsed = SessionRegistrationSchema.parse(request.body);
        const handle = this.store.registerSession(parsed);

        // Broadcast event
        const event: ServerEvent = {
          type: "session.registered",
          timestamp: new Date().toISOString(),
          payload: handle,
        };
        this.ws.broadcast(event);

        return reply.status(201).send(handle);
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    });

    this.fastify.get("/v1/sessions/:id", async (request, reply) => {
      const { id } = request.params as { id: string };
      const session = this.store.getSession(id);
      if (!session) {
        return reply.status(404).send({ error: "Session not found" });
      }
      return reply.send(session);
    });

    // 2. Artifact Publication
    this.fastify.post("/v1/artifacts", async (request, reply) => {
      try {
        const publication = ArtifactPublicationSchema.parse(request.body);
        const session = this.store.getSession(publication.sessionId);
        if (!session) {
          return reply.status(401).send({ error: "Invalid session ID" });
        }

        // Validate and load artifact via preview-engine security boundary
        const loaded = await loadArtifact(
          session.workspaceRoot,
          publication.entrypoint,
          publication.kind
        );

        // Save revision and content
        const revision = this.store.publishArtifact(publication, loaded.contentHash, loaded.content);

        // Broadcast real-time events
        this.ws.broadcast({
          type: "artifact.published",
          timestamp: new Date().toISOString(),
          payload: publication,
        });

        this.ws.broadcast({
          type: "preview.ready",
          timestamp: new Date().toISOString(),
          payload: {
            sessionId: publication.sessionId,
            artifactId: publication.artifactId,
            revision: revision.revision,
            kind: publication.kind,
            title: publication.title,
            entrypoint: publication.entrypoint,
            content: loaded.content,
          },
        });

        this.ws.broadcast({
          type: "revision.published",
          timestamp: new Date().toISOString(),
          payload: revision,
        });

        return reply.status(201).send({
          ...revision,
          sanitizedContent: loaded.content,
        });
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    });

    this.fastify.get("/v1/artifacts/:id/revisions", async (request, reply) => {
      const { id } = request.params as { id: string };
      const revisions = this.store.getRevisions(id);
      return reply.send({ artifactId: id, revisions });
    });

    // 2.1 Workspace Assets Discovery & Selection
    this.fastify.get("/v1/workspace/assets", async (request, reply) => {
      const query = request.query as { workspaceRoot?: string; limit?: string };
      let root = query.workspaceRoot;
      if (!root || !root.trim()) {
        const snap = this.store.getSnapshot();
        const active = snap.sessions.find((s) => s.sessionId === snap.activeSessionId);
        root = active?.workspaceRoot || process.cwd();
      }
      const limit = query.limit ? Number(query.limit) : 200;
      const result = scanWorkspaceAssets(root, limit);
      return reply.send(result);
    });

    this.fastify.post("/v1/workspace/select-asset", async (request, reply) => {
      try {
        const body = request.body as { entrypoint: string; workspaceRoot?: string };
        if (!body || !body.entrypoint) {
          return reply.status(400).send({ error: "Missing 'entrypoint' in request body" });
        }

        let entrypoint = body.entrypoint;
        let root = body.workspaceRoot;

        if (path.isAbsolute(entrypoint)) {
          const resolvedPath = path.resolve(entrypoint);
          if (!root || !resolvedPath.startsWith(path.resolve(root))) {
            root = path.dirname(resolvedPath);
            entrypoint = path.basename(resolvedPath);
          } else {
            entrypoint = path.relative(path.resolve(root), resolvedPath);
          }
        } else if (!root || !root.trim()) {
          const snap = this.store.getSnapshot();
          const active = snap.sessions.find((s) => s.sessionId === snap.activeSessionId);
          root = active?.workspaceRoot || process.cwd();
        }

        const ext = path.extname(entrypoint).toLowerCase();
        const isImage = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"].includes(ext);
        const isSvg = ext === ".svg";
        const kind: ArtifactKind = isImage ? "image" : isSvg ? "svg" : "html";

        // Find or create session for this workspace
        let session = this.store.getSnapshot().sessions.find((s) => s.workspaceRoot === root);
        if (!session) {
          session = this.store.registerSession({
            adapterId: "workspace-explorer",
            agentName: "Workspace Explorer",
            workspaceRoot: root,
          });
        }

        // Validate and load artifact via preview-engine
        const loaded = await loadArtifact(root, entrypoint, kind);
        const artifactId = `art_${path.basename(entrypoint, ext).replace(/[^a-zA-Z0-9_-]/g, "_")}`;

        const publication = {
          sessionId: session.sessionId,
          artifactId,
          revision: 1,
          kind: loaded.kind,
          entrypoint,
          title: path.basename(entrypoint),
          viewport: { width: 1024, height: 768, devicePixelRatio: 2, zoom: 1, scrollX: 0, scrollY: 0 },
        };

        const revision = this.store.publishArtifact(publication, loaded.contentHash, loaded.content);

        // Broadcast real-time events to all connected clients
        this.ws.broadcast({
          type: "artifact.published",
          timestamp: new Date().toISOString(),
          payload: publication,
        });

        this.ws.broadcast({
          type: "preview.ready",
          timestamp: new Date().toISOString(),
          payload: {
            sessionId: publication.sessionId,
            artifactId: publication.artifactId,
            revision: revision.revision,
            kind: publication.kind,
            title: publication.title,
            entrypoint: publication.entrypoint,
            content: loaded.content,
          },
        });

        this.ws.broadcast({
          type: "revision.published",
          timestamp: new Date().toISOString(),
          payload: revision,
        });

        return reply.status(200).send({
          success: true,
          publication,
          revision,
        });
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    });

    this.fastify.post("/v1/workspace/upload-asset", async (request, reply) => {
      try {
        const body = request.body as {
          filename: string;
          content: string;
          kind?: ArtifactKind;
          workspaceRoot?: string;
        };
        if (!body || !body.filename || !body.content) {
          return reply.status(400).send({ error: "Missing filename or content in request body" });
        }

        const rawFilename = body.filename.trim();
        if (
          !rawFilename ||
          rawFilename.includes("..") ||
          rawFilename.includes("/") ||
          rawFilename.includes("\\") ||
          rawFilename.includes("\0")
        ) {
          return reply.status(400).send({ error: "Invalid filename: path traversal characters rejected" });
        }

        const safeFilename = path.basename(rawFilename);
        const ext = path.extname(safeFilename).toLowerCase();
        const allowedExtensions = [
          ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp",
          ".svg", ".html", ".htm", ".pdf"
        ];
        if (!allowedExtensions.includes(ext)) {
          return reply.status(400).send({
            error: `Unsupported file extension "${ext}". Allowed: ${allowedExtensions.join(", ")}`,
          });
        }

        const isImage = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"].includes(ext);
        const isSvg = ext === ".svg";
        const isPdf = ext === ".pdf";
        const kind: ArtifactKind = body.kind || (isImage ? "image" : isSvg ? "svg" : isPdf ? "pdf" : "html");

        let root = body.workspaceRoot;
        if (!root || !root.trim()) {
          const snap = this.store.getSnapshot();
          const active = snap.sessions.find((s) => s.sessionId === snap.activeSessionId);
          root = active?.workspaceRoot || process.cwd();
        }

        const uploadDir = path.resolve(root, ".visualloop_uploads");
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        const filePath = path.resolve(uploadDir, safeFilename);

        if (!filePath.startsWith(uploadDir + path.sep)) {
          return reply.status(400).send({ error: "Path traversal violation: file must reside strictly inside upload directory" });
        }

        if ((isImage || isPdf) && body.content.startsWith("data:")) {
          const base64Data = body.content.split(",")[1];
          fs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));
        } else {
          fs.writeFileSync(filePath, body.content, "utf-8");
        }

        const relativeEntrypoint = path.relative(root, filePath);
        const loaded = await loadArtifact(root, relativeEntrypoint, kind);

        let session = this.store.getSnapshot().sessions.find((s) => s.workspaceRoot === root);
        if (!session) {
          session = this.store.registerSession({
            adapterId: "workspace-explorer",
            agentName: "Workspace Explorer",
            workspaceRoot: root,
          });
        }

        const artifactId = `art_${path.basename(body.filename, ext).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
        const publication = {
          sessionId: session.sessionId,
          artifactId,
          revision: 1,
          kind: loaded.kind,
          entrypoint: relativeEntrypoint,
          title: body.filename,
          viewport: { width: 1024, height: 768, devicePixelRatio: 2, zoom: 1, scrollX: 0, scrollY: 0 },
        };

        const revision = this.store.publishArtifact(publication, loaded.contentHash, loaded.content);

        this.ws.broadcast({
          type: "artifact.published",
          timestamp: new Date().toISOString(),
          payload: publication,
        });

        this.ws.broadcast({
          type: "preview.ready",
          timestamp: new Date().toISOString(),
          payload: {
            sessionId: publication.sessionId,
            artifactId: publication.artifactId,
            revision: revision.revision,
            kind: publication.kind,
            title: publication.title,
            entrypoint: publication.entrypoint,
            content: loaded.content,
          },
        });

        this.ws.broadcast({
          type: "revision.published",
          timestamp: new Date().toISOString(),
          payload: revision,
        });

        return reply.status(200).send({
          success: true,
          publication,
          revision,
        });
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    });

    // 3. Feedback Submission
    this.fastify.post("/v1/feedback", async (request, reply) => {
      try {
        const submission = FeedbackSubmissionSchema.parse(request.body);
        const result = this.store.submitFeedback(submission);

        if (!result.duplicate) {
          this.ws.broadcast({
            type: "feedback.submitted",
            timestamp: new Date().toISOString(),
            payload: submission,
          });

          // Trigger automated AI revision runner in background if credentials exist
          this.processFeedbackWithAI(submission).catch((err) => {
            console.warn("[CoreServer] Background AI processing failed:", err.message);
          });
        }

        return reply.status(201).send({
          feedbackId: submission.feedbackId,
          status: "submitted",
          duplicate: result.duplicate,
        });
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    });

    this.fastify.get("/v1/feedback/pending", async (request, reply) => {
      const { sessionId } = request.query as { sessionId?: string };
      const targetSessionId = sessionId || this.store.getSnapshot().activeSessionId;
      if (!targetSessionId) {
        return reply.status(400).send({ error: "sessionId query parameter required or active session needed" });
      }

      const pending = this.store.getPendingFeedback(targetSessionId);
      return reply.send({ sessionId: targetSessionId, pending, count: pending.length });
    });

    this.fastify.get("/v1/feedback/latest", async (request, reply) => {
      const { sessionId } = request.query as { sessionId?: string };
      const targetSessionId = sessionId || this.store.getSnapshot().activeSessionId;
      if (!targetSessionId) {
        return reply.status(400).send({ error: "sessionId query parameter required or active session needed" });
      }

      // Return next pending in queue, or latest recorded feedback
      const feedback =
        this.store.getNextPendingFeedback(targetSessionId) || this.store.getLatestFeedback(targetSessionId);
      if (!feedback) {
        return reply.status(404).send({ error: "No feedback found for session" });
      }

      return reply.send(feedback);
    });

    this.fastify.post("/v1/feedback/:id/ack", async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const receipt = this.store.acknowledgeFeedback(id);

        this.ws.broadcast({
          type: "feedback.delivered",
          timestamp: new Date().toISOString(),
          payload: receipt,
        });

        return reply.send(receipt);
      } catch (err: any) {
        return reply.status(404).send({ error: err.message });
      }
    });
  }

  public async start(): Promise<string> {
    await this.fastify.listen({ port: this.port, host: this.host });
    this.ws.initialize(this.fastify.server, this.secretToken, () => this.store.getSnapshot());
    return `http://${this.host}:${this.port}`;
  }

  public async stop(): Promise<void> {
    this.ws.close();
    await this.fastify.close();
  }

  public getAddress(): string {
    return `http://${this.host}:${this.port}`;
  }

  public async processFeedbackWithAI(submission: FeedbackSubmission): Promise<boolean> {
    try {
      const snap = this.store.getSnapshot();
      const session =
        this.store.getSession(submission.sessionId) ||
        snap.sessions.find((s) => s.sessionId === snap.activeSessionId);
      if (!session) {
        const errMsg = "Session not found for feedback submission";
        console.info("[CoreServer] processFeedbackWithAI:", errMsg);
        this.ws.broadcast({
          type: "feedback.failed",
          timestamp: new Date().toISOString(),
          payload: { feedbackId: submission.feedbackId, error: errMsg, recoverable: false },
        });
        return false;
      }

      const active = snap.activeArtifact;
      if (!active || active.artifactId !== submission.artifactId) {
        const errMsg = "Active artifact mismatch or artifact not loaded";
        console.info("[CoreServer] processFeedbackWithAI:", errMsg, {
          activeId: active?.artifactId,
          submissionId: submission.artifactId,
        });
        this.ws.broadcast({
          type: "feedback.failed",
          timestamp: new Date().toISOString(),
          payload: { feedbackId: submission.feedbackId, error: errMsg, recoverable: false },
        });
        return false;
      }

      // Only attempt automated source-code revision on SVG and HTML code
      if (active.kind !== "svg" && active.kind !== "html") {
        const errMsg = `Direct source-code revision only supports SVG and HTML artifacts (selected: ${active.kind})`;
        console.info("[CoreServer] processFeedbackWithAI:", errMsg);
        this.ws.broadcast({
          type: "feedback.failed",
          timestamp: new Date().toISOString(),
          payload: { feedbackId: submission.feedbackId, error: errMsg, recoverable: false },
        });
        return false;
      }

      const targetFilePath = path.resolve(session.workspaceRoot, active.entrypoint);
      if (!fs.existsSync(targetFilePath)) {
        const errMsg = `Target file not found at ${targetFilePath}`;
        console.info("[CoreServer] processFeedbackWithAI:", errMsg);
        this.ws.broadcast({
          type: "feedback.failed",
          timestamp: new Date().toISOString(),
          payload: { feedbackId: submission.feedbackId, error: errMsg, recoverable: false },
        });
        return false;
      }

      const fileConfig = readProviderConfigFile() || { provider: "gemini" as const };
      const effectiveProvider = (
        submission.preferredProvider ||
        process.env.VISUALLOOP_AI_PROVIDER ||
        fileConfig.provider ||
        "gemini"
      ).trim().toLowerCase();

      const effectiveModel =
        submission.preferredModel ||
        process.env.VISUALLOOP_AI_MODEL ||
        fileConfig.providerModels?.[effectiveProvider] ||
        (fileConfig.provider === effectiveProvider ? fileConfig.model : undefined) ||
        DEFAULT_PROVIDER_MODELS[effectiveProvider] ||
        "gemini-3.8-flash";

      const envKey = process.env[PROVIDER_ENV_KEYS[effectiveProvider]] || process.env.VISUALLOOP_AI_API_KEY;
      const fileKey =
        fileConfig.providerKeys?.[effectiveProvider] ||
        (fileConfig.provider === effectiveProvider ? fileConfig.apiKey : undefined);
      const activeKey = envKey || fileKey;

      const effectiveConfig: ProviderConfig = {
        provider: effectiveProvider,
        model: effectiveModel,
        apiKey: activeKey,
        baseUrl: process.env.OPENAI_COMPATIBLE_BASE_URL || fileConfig.baseUrl || undefined,
      };

      if (!hasModelCredentials(effectiveConfig)) {
        const errMsg = `No API key configured for provider "${effectiveConfig.provider}". Please set VISUALLOOP_AI_API_KEY, ${PROVIDER_ENV_KEYS[effectiveConfig.provider]}, or configure it in Settings.`;
        console.warn("[CoreServer] processFeedbackWithAI:", errMsg);
        this.ws.broadcast({
          type: "feedback.failed",
          timestamp: new Date().toISOString(),
          payload: {
            feedbackId: submission.feedbackId,
            error: errMsg,
            recoverable: false,
          },
        });
        return false;
      }

      const nextRevNumber = (active.revision || 1) + 1;
      this.ws.broadcast({
        type: "preview.rendering",
        timestamp: new Date().toISOString(),
        payload: {
          artifactId: active.artifactId,
          revision: nextRevNumber,
        },
      });

      const currentCode = fs.readFileSync(targetFilePath, "utf-8");
      const annotationsList = submission.annotations
        .map((a, i) => `#${i + 1} [${a.type}]: ${a.instruction}`)
        .join("\n");

      const prompt = [
        "You are an expert designer and software engineer. Return ONLY the complete updated valid source code.",
        "CURRENT CODE:",
        currentCode,
        "VISUAL FEEDBACK FROM SCREEN ANNOTATIONS:",
        annotationsList || "User indicated visual changes on rendered output.",
        submission.generalInstruction ? `General requirement: ${submission.generalInstruction}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      const providerResult = await generateRevisionWithProvider(
        {
          prompt,
          screenshotDataUrl: submission.annotatedScreenshotDataUrl,
        },
        effectiveConfig
      );

      const safeResult = applyRevisionSafely({
        targetFilePath,
        revisedCode: providerResult.source,
        revision: nextRevNumber,
        workspaceRoot: session.workspaceRoot,
      });

      if (!safeResult.success) {
        const errMsg = safeResult.error || "Revision validation rejected model output";
        console.warn("[CoreServer] Safe revision check rejected model output:", errMsg);
        this.ws.broadcast({
          type: "feedback.failed",
          timestamp: new Date().toISOString(),
          payload: {
            feedbackId: submission.feedbackId,
            error: errMsg,
            recoverable: false,
          },
        });
        return false;
      }

      const loaded = await loadArtifact(session.workspaceRoot, active.entrypoint, active.kind);
      const publication = {
        sessionId: session.sessionId,
        artifactId: active.artifactId,
        revision: nextRevNumber,
        kind: active.kind,
        entrypoint: active.entrypoint,
        title: active.title || path.basename(active.entrypoint),
        viewport: submission.viewport || {
          width: 1024,
          height: 768,
          devicePixelRatio: 2,
          zoom: 1,
          scrollX: 0,
          scrollY: 0,
        },
      };

      const revision = this.store.publishArtifact(publication, loaded.contentHash, loaded.content);

      this.ws.broadcast({
        type: "artifact.published",
        timestamp: new Date().toISOString(),
        payload: publication,
      });

      this.ws.broadcast({
        type: "preview.ready",
        timestamp: new Date().toISOString(),
        payload: {
          sessionId: publication.sessionId,
          artifactId: publication.artifactId,
          revision: revision.revision,
          kind: publication.kind,
          title: publication.title,
          entrypoint: publication.entrypoint,
          content: loaded.content,
        },
      });

      this.ws.broadcast({
        type: "revision.published",
        timestamp: new Date().toISOString(),
        payload: revision,
      });

      this.store.acknowledgeFeedback(submission.feedbackId);
      this.ws.broadcast({
        type: "feedback.delivered",
        timestamp: new Date().toISOString(),
        payload: {
          feedbackId: submission.feedbackId,
          sessionId: session.sessionId,
          status: "acknowledged",
          deliveredAt: new Date().toISOString(),
          adapterMessage: `AI revised with ${effectiveConfig.provider}/${effectiveConfig.model}`,
        },
      });

      console.info(
        `[CoreServer] Automatically published revision ${nextRevNumber} for ${active.entrypoint}`
      );
      return true;
    } catch (err: any) {
      const errMsg = err?.message || "Unknown error during AI revision";
      console.warn("[CoreServer] AI revision error:", errMsg);
      this.ws.broadcast({
        type: "feedback.failed",
        timestamp: new Date().toISOString(),
        payload: {
          feedbackId: submission.feedbackId,
          error: errMsg,
          recoverable: false,
        },
      });
      return false;
    }
  }

  public getSecretToken(): string | undefined {
    return this.secretToken;
  }
}
