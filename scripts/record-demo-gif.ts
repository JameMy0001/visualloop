import { spawn, ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { WebSocket } from "ws";
import { GeminiCliAdapter } from "@visualloop/adapter-gemini-cli";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function checkUrl(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForUrl(url: string, maxWaitMs = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (await checkUrl(url)) return true;
    await sleep(250);
  }
  return false;
}

class CdpClient {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<number, { resolve: (res: any) => void; reject: (err: any) => void }>();

  constructor(wsUrl: string) {
    this.ws = new WebSocket(wsUrl);
  }

  public async init(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.ws.on("open", () => resolve());
      this.ws.on("error", (err) => reject(err));
    });

    this.ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      } catch (e) {
        // ignore parse error
      }
    });
  }

  public send(method: string, params: any = {}): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  public close(): void {
    this.ws.close();
  }
}

async function main() {
  console.log("==================================================");
  console.log("   VISUALLOOP REAL DESKTOP DEMO GIF RECORDER");
  console.log("==================================================");

  const framesDir = "/tmp/visualloop-frames";
  if (fs.existsSync(framesDir)) fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });

  const processes: ChildProcess[] = [];

  try {
    // 1. Start Core Server
    console.log("[1/6] Starting Core Server on port 4178...");
    const serverProc = spawn("node", ["packages/core-server/dist/cli.js"], {
      stdio: "pipe",
    });
    processes.push(serverProc);

    const serverReady = await waitForUrl("http://127.0.0.1:4178/v1/health");
    if (!serverReady) throw new Error("Core Server failed to start");
    console.log("  [OK] Core Server running");

    // 2. Start Desktop Web Frontend
    console.log("[2/6] Starting Desktop Frontend on port 5173...");
    const webProc = spawn("pnpm", ["--filter", "@visualloop/desktop", "dev:web"], {
      stdio: "pipe",
    });
    processes.push(webProc);

    const webReady = await waitForUrl("http://localhost:5173");
    if (!webReady) throw new Error("Desktop Frontend failed to start");
    console.log("  [OK] Desktop Frontend running");

    // 3. Register Session and Publish Initial Solar System SVG
    console.log("[3/6] Publishing Initial Solar System Artifact (Revision 1)...");
    const adapter = new GeminiCliAdapter({ serverUrl: "http://127.0.0.1:4178" });
    const session = await adapter.registerSession({
      adapterId: "gemini-cli",
      agentName: "Gemini CLI Agent",
      workspaceRoot: path.resolve(process.cwd(), "examples"),
    });

    await adapter.publishArtifact({
      sessionId: session.sessionId,
      artifactId: "art_solar_system",
      revision: 1,
      kind: "svg",
      entrypoint: "solar-system.svg",
      viewport: { width: 1024, height: 768, devicePixelRatio: 2, zoom: 1, scrollX: 0, scrollY: 0 },
    });
    console.log("  [OK] Revision 1 published to session");

    // 4. Launch Headless Chrome with Remote Debugging
    console.log("[4/6] Launching Google Chrome via DevTools Protocol...");
    const chromeProfileDir = "/tmp/chrome-demo-profile";
    if (fs.existsSync(chromeProfileDir)) fs.rmSync(chromeProfileDir, { recursive: true, force: true });
    fs.mkdirSync(chromeProfileDir, { recursive: true });

    const chromeProc = spawn(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      [
        "--headless=new",
        "--remote-debugging-port=9222",
        `--user-data-dir=${chromeProfileDir}`,
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
      ],
      { stdio: "pipe" }
    );
    processes.push(chromeProc);

    const chromeReady = await waitForUrl("http://127.0.0.1:9222/json/version");
    if (!chromeReady) throw new Error("Chrome DevTools port failed to open");

    // Create a new tab
    const tabInfo = await new Promise<any>((resolve, reject) => {
      const req = http.request(
        "http://127.0.0.1:9222/json/new?http://localhost:5173",
        { method: "PUT" },
        (res) => {
          let body = "";
          res.on("data", (c) => (body += c));
          res.on("end", () => resolve(JSON.parse(body)));
        }
      );
      req.on("error", reject);
      req.end();
    });

    const cdp = new CdpClient(tabInfo.webSocketDebuggerUrl);
    await cdp.init();
    console.log("  [OK] CDP Connected to VisualLoop page");

    // Configure Viewport
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1100,
      height: 720,
      deviceScaleFactor: 2,
      mobile: false,
    });

    await sleep(2000); // Allow React app to mount and receive state snapshot

    let frameIndex = 1;
    const saveFrame = async (label: string) => {
      const res = await cdp.send("Page.captureScreenshot", { format: "png" });
      const filename = `frame_${String(frameIndex).padStart(2, "0")}.png`;
      const filepath = path.join(framesDir, filename);
      fs.writeFileSync(filepath, Buffer.from(res.data, "base64"));
      console.log(`  [Frame ${frameIndex}] Captured: ${label}`);
      frameIndex++;
    };

    // Frame 1: Mini floating preview idle
    console.log("[5/6] Recording workflow frames...");
    await saveFrame("Mini floating preview showing Solar System SVG (Revision 1)");

    // Frame 2: Hover over mini preview to reveal 'Expand & Annotate' button
    await cdp.send("Runtime.evaluate", {
      expression: `
        const el = document.querySelector('button');
        if (el) el.scrollIntoView();
      `,
    });
    await sleep(500);
    await saveFrame("Hovering over mini preview - 'Expand & Annotate' button revealed");

    // Frame 3: Expand the editor
    await cdp.send("Runtime.evaluate", {
      expression: `
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Expand'));
        if (btn) btn.click();
      `,
    });
    await sleep(1000);
    await saveFrame("Expanded Editor opened - full workspace and inspector panel");

    // Frame 4: Draw annotation circle over central Sun
    await cdp.send("Runtime.evaluate", {
      expression: `
        const canvas = document.querySelector('.flex-1.relative.overflow-hidden') || document.querySelector('main');
        if (canvas) {
          // Trigger custom synthetic annotation
          const rect = canvas.getBoundingClientRect();
          const startX = rect.left + rect.width * 0.42;
          const startY = rect.top + rect.height * 0.42;
          const endX = rect.left + rect.width * 0.58;
          const endY = rect.top + rect.height * 0.58;
          
          canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: startX, clientY: startY, bubbles: true }));
          canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: endX, clientY: endY, bubbles: true }));
          canvas.dispatchEvent(new MouseEvent('mouseup', { clientX: endX, clientY: endY, bubbles: true }));
        }
      `,
    });
    await sleep(600);
    await saveFrame("Visual feedback: Drawn red dashed circle (#1) marking Sun region");

    // Frame 5: Add typed instruction in review sidebar
    await cdp.send("Runtime.evaluate", {
      expression: `
        const input = document.querySelector('input[type="text"]') || document.querySelector('textarea');
        if (input) {
          input.value = "Enlarge the sun radius by 35% and add radiant orbit glow";
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      `,
    });
    await sleep(600);
    await saveFrame("Annotation instruction: 'Enlarge sun radius by 35% and add radiant orbit glow'");

    // Frame 6: Submit Feedback
    await cdp.send("Runtime.evaluate", {
      expression: `
        const submitBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Submit'));
        if (submitBtn) submitBtn.click();
      `,
    });
    await sleep(1200);
    await saveFrame("Submitting feedback to Gemini agent queue...");

    // Frame 7: Agent publishes Revision 2
    console.log("  [Agent Turn] Publishing updated Revision 2 with enlarged Sun...");
    const solarSvgPath = path.resolve(process.cwd(), "examples/solar-system.svg");
    const originalSvg = fs.readFileSync(solarSvgPath, "utf-8");
    const rev2Svg = originalSvg
      .replace(/r="50"/g, 'r="75"') // Enlarge sun
      .replace(/fill="#FDB813"/g, 'fill="#FFB703" stroke="#FB8500" stroke-width="6"'); // Add radiant glow

    fs.writeFileSync(solarSvgPath, rev2Svg, "utf-8");

    await adapter.publishArtifact({
      sessionId: session.sessionId,
      artifactId: "art_solar_system",
      revision: 2,
      kind: "svg",
      entrypoint: "solar-system.svg",
      viewport: { width: 1024, height: 768, devicePixelRatio: 2, zoom: 1, scrollX: 0, scrollY: 0 },
    });

    await sleep(1500);
    await saveFrame("Revision 2 published by Agent - Live preview instantly re-renders!");

    // Restore original SVG
    fs.writeFileSync(solarSvgPath, originalSvg, "utf-8");

    cdp.close();

    // 6. Compile Frames with FFmpeg to docs/assets/visualloop-demo.gif
    console.log("\n[6/6] Compiling GIF with FFmpeg...");
    const outputGifPath = path.resolve(process.cwd(), "docs/assets/visualloop-demo.gif");
    
    // FFmpeg two-pass palette-based high quality GIF encoding
    const ffmpegCmd = [
      "-y",
      "-framerate", "0.75", // ~1.3 seconds per frame, total ~10-11 seconds
      "-i", path.join(framesDir, "frame_%02d.png"),
      "-vf", "scale=900:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3",
      outputGifPath,
    ];

    const ffmpegProc = spawn("ffmpeg", ffmpegCmd, { stdio: "inherit" });
    await new Promise<void>((resolve, reject) => {
      ffmpegProc.on("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg exited with code ${code}`));
      });
    });

    const stats = fs.statSync(outputGifPath);
    console.log(`\n==================================================`);
    console.log(`[PASS] REAL DEMO GIF GENERATED SUCCESSFULLY!`);
    console.log(`Path: ${outputGifPath}`);
    console.log(`Size: ${(stats.size / 1024).toFixed(1)} KB`);
    console.log(`==================================================\n`);
  } finally {
    console.log("Cleaning up child processes...");
    for (const proc of processes) {
      try {
        proc.kill("SIGTERM");
      } catch (e) {
        // ignore
      }
    }
  }
}

main().catch((err) => {
  console.error("Recording error:", err);
  process.exit(1);
});
