import Fastify, { FastifyInstance } from "fastify";
import {
  SessionRegistrationSchema,
  ArtifactPublicationSchema,
  FeedbackSubmissionSchema,
  ProviderConfigSchema,
  ServerEvent,
} from "@visualloop/protocol";
import { loadArtifact } from "@visualloop/preview-engine";
import { CoreStore } from "./store.js";
import { WebSocketManager } from "./websocket.js";
import {
  isValidOrigin,
  resolveOrCreateAuthToken,
  resolveCurrentProviderInfo,
  readProviderConfigFile,
  writeProviderConfigFile,
  DEFAULT_PROVIDER_MODELS,
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
    // Authentication and origin security hook
    this.fastify.addHook("preHandler", async (request, reply) => {
      // Exclude health check from token auth so orchestrators can probe readiness
      if (request.url === "/v1/health" || request.url.startsWith("/v1/health?")) {
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
            : providerModels[body.provider] || DEFAULT_PROVIDER_MODELS[body.provider] || "gemini-2.5-pro";
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
      if (!sessionId) {
        return reply.status(400).send({ error: "sessionId query parameter required" });
      }

      const pending = this.store.getPendingFeedback(sessionId);
      return reply.send({ sessionId, pending, count: pending.length });
    });

    this.fastify.get("/v1/feedback/latest", async (request, reply) => {
      const { sessionId } = request.query as { sessionId?: string };
      if (!sessionId) {
        return reply.status(400).send({ error: "sessionId query parameter required" });
      }

      // Return next pending in queue, or latest recorded feedback
      const feedback =
        this.store.getNextPendingFeedback(sessionId) || this.store.getLatestFeedback(sessionId);
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

  public getSecretToken(): string | undefined {
    return this.secretToken;
  }
}
