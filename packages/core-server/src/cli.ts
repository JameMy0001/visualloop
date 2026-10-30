#!/usr/bin/env node
import { CoreServer } from "./server.js";

function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      console.log(`
VisualLoop Core Server CLI

Usage:
  visualloop-server [options]

Options:
  --port, -p <number>    Port to listen on (default: 4178 or $PORT)
  --host, -H <string>    Host address to bind (default: 127.0.0.1 or $HOST)
  --token, -t <string>   Secret authentication token (default: $VISUALLOOP_SECRET_TOKEN)
  --help, -h             Show this help message
`);
      process.exit(0);
    }
    if ((arg === "--port" || arg === "-p") && args[i + 1]) {
      result.port = args[++i];
    } else if ((arg === "--host" || arg === "-H") && args[i + 1]) {
      result.host = args[++i];
    } else if ((arg === "--token" || arg === "-t") && args[i + 1]) {
      result.token = args[++i];
    }
  }
  return result;
}

const cliArgs = parseArgs(process.argv.slice(2));

const port = Number(
  cliArgs.port || process.env.PORT || process.env.VISUALLOOP_PORT || 4178
);
const host =
  cliArgs.host || process.env.HOST || process.env.VISUALLOOP_HOST || "127.0.0.1";
const secretToken = cliArgs.token || process.env.VISUALLOOP_SECRET_TOKEN;

const server = new CoreServer({ port, host, secretToken });

async function run() {
  const address = await server.start();
  console.log(`[VisualLoop Core] Server active at ${address}`);
  console.log(`[VisualLoop Core] Health check endpoint: ${address}/v1/health`);
  if (secretToken) {
    console.log("[VisualLoop Core] Secret token authentication: ENABLED");
  }

  const handleShutdown = async (signal: string) => {
    console.log(`\n[VisualLoop Core] Caught ${signal}, terminating gracefully...`);
    try {
      await server.stop();
      console.log("[VisualLoop Core] Server closed cleanly.");
      process.exit(0);
    } catch (err) {
      console.error("[VisualLoop Core] Error closing server:", err);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
}

run().catch((err) => {
  console.error("[VisualLoop Core] Failed to start:", err);
  process.exit(1);
});
