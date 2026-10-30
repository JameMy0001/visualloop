import { spawn, execSync, ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";

function resolveLocalToken(): string {
  if (process.env.VISUALLOOP_SECRET_TOKEN && process.env.VISUALLOOP_SECRET_TOKEN.trim().length > 0) {
    return process.env.VISUALLOOP_SECRET_TOKEN.trim();
  }
  const configDir = path.join(os.homedir(), ".visualloop");
  const tokenFile = path.join(configDir, "auth_token");
  try {
    if (fs.existsSync(tokenFile)) {
      const saved = fs.readFileSync(tokenFile, "utf-8").trim();
      if (saved.length > 0) return saved;
    }
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    }
    const generated = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(tokenFile, generated, { encoding: "utf-8", mode: 0o600 });
    return generated;
  } catch {
    return crypto.randomBytes(32).toString("hex");
  }
}

function checkHealth(port = 4178): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/v1/health`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(port = 4178, maxWaitMs = 12000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (await checkHealth(port)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function main() {
  const args = process.argv.slice(2);
  const isWebOnly =
    args.includes("--web") ||
    process.env.VISUALLOOP_MODE === "web" ||
    process.env.HEADLESS === "1";

  console.log("==================================================");
  console.log("   VISUALLOOP UNIFIED LAUNCHER");
  console.log("==================================================");
  console.log(`Mode: ${isWebOnly ? "Web Browser (dev:web)" : "Native Desktop (Tauri)"}`);

  // Ensure core-server build exists
  const serverCliPath = path.resolve(
    process.cwd(),
    "packages/core-server/dist/cli.js"
  );
  if (!fs.existsSync(serverCliPath)) {
    console.log("[Build] Building @visualloop/core-server distribution...");
    execSync("pnpm --filter @visualloop/core-server build", {
      stdio: "inherit",
    });
  }

  const localToken = resolveLocalToken();
  const childEnv = {
    ...process.env,
    VISUALLOOP_SECRET_TOKEN: localToken,
    VITE_VISUALLOOP_TOKEN: localToken,
  };

  let serverProcess: ChildProcess | null = null;
  const isServerRunning = await checkHealth(4178);

  if (isServerRunning) {
    console.log("[OK] Core Server is already running on port 4178.");
  } else {
    console.log("[1/2] Spawning VisualLoop Core Server on port 4178...");
    serverProcess = spawn("pnpm", ["--filter", "@visualloop/core-server", "start"], {
      stdio: "inherit",
      shell: true,
      env: childEnv,
    });

    const ready = await waitForServer(4178);
    if (!ready) {
      console.error("[FAIL] Core Server failed to start within 12 seconds.");
      if (serverProcess) serverProcess.kill();
      process.exit(1);
    }
    console.log("[OK] Core Server started and ready at http://127.0.0.1:4178");
  }

  const desktopTarget = isWebOnly ? "dev:web" : "dev";
  console.log(`[2/2] Spawning VisualLoop Frontend (${desktopTarget})...`);
  const desktopProcess = spawn("pnpm", ["--filter", "@visualloop/desktop", desktopTarget], {
    stdio: "inherit",
    shell: true,
    env: childEnv,
  });

  const cleanup = () => {
    console.log("\nShutting down VisualLoop launcher...");
    if (desktopProcess) desktopProcess.kill();
    if (serverProcess) serverProcess.kill();
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  desktopProcess.on("exit", (code) => {
    if (serverProcess) serverProcess.kill();
    process.exit(code || 0);
  });
}

main().catch((err) => {
  console.error("Launcher error:", err);
  process.exit(1);
});
