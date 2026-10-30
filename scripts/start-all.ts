import { spawn, ChildProcess } from "node:child_process";
import path from "node:path";
import http from "node:http";

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

async function waitForServer(port = 4178, maxWaitMs = 10000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (await checkHealth(port)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function main() {
  console.log("==================================================");
  console.log("   VISUALLOOP UNIFIED LAUNCHER");
  console.log("==================================================");

  let serverProcess: ChildProcess | null = null;
  const isServerRunning = await checkHealth(4178);

  if (isServerRunning) {
    console.log("[OK] Core Server is already running on port 4178.");
  } else {
    console.log("[1/2] Spawning VisualLoop Core Server on port 4178...");
    serverProcess = spawn("pnpm", ["--filter", "@visualloop/core-server", "start"], {
      stdio: "inherit",
      shell: true,
    });

    const ready = await waitForServer(4178);
    if (!ready) {
      console.error("[FAIL] Core Server failed to start within 10 seconds.");
      if (serverProcess) serverProcess.kill();
      process.exit(1);
    }
    console.log("[OK] Core Server started and ready at http://127.0.0.1:4178");
  }

  console.log("[2/2] Spawning VisualLoop Desktop Shell...");
  const desktopProcess = spawn("pnpm", ["--filter", "@visualloop/desktop", "dev"], {
    stdio: "inherit",
    shell: true,
  });

  const cleanup = () => {
    console.log("\nShutting down VisualLoop...");
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
