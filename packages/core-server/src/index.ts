import {
  SessionRegistration,
  SessionHandle,
  ArtifactPublication,
  FeedbackSubmission,
  DeliveryReceipt,
} from "@visualloop/protocol";

export interface CoreServerOptions {
  port?: number;
  host?: string;
  secretToken?: string;
}

export class CoreServer {
  private port: number;
  private host: string;

  constructor(options: CoreServerOptions = {}) {
    this.port = options.port ?? 4178;
    this.host = options.host ?? "127.0.0.1";
  }

  public getAddress(): string {
    return `http://${this.host}:${this.port}`;
  }
}
