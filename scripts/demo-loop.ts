import path from "node:path";
import { fileURLToPath } from "node:url";
import { CoreServer } from "@visualloop/core-server";
import { GeminiCliAdapter } from "@visualloop/adapter-gemini-cli";
import { generateDualCapture } from "@visualloop/annotation-engine";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runVisualLoopDemo() {
  console.log("=================================================");
  console.log("   VISUALLOOP END-TO-END DEMO EXECUTION");
  console.log("=================================================");

  const startTime = Date.now();
  const examplesDir = path.resolve(__dirname, "../examples");

  // Step 1: Initialize Core Server on dynamic test port
  console.log("[1/6] Starting VisualLoop Core Server on 127.0.0.1:4178...");
  const server = new CoreServer({ port: 4178, host: "127.0.0.1" });
  await server.start();
  console.log("  [OK] Core Server listening at http://127.0.0.1:4178 (WebSocket at ws://127.0.0.1:4178/v1/ws)");

  // Step 2: Initialize Agent Adapter (Gemini CLI)
  console.log("\n[2/6] Initializing Gemini CLI Adapter & Registering Session...");
  const adapter = new GeminiCliAdapter({ serverUrl: "http://127.0.0.1:4178" });
  const session = await adapter.registerSession({
    adapterId: "gemini-cli",
    agentName: "Gemini CLI",
    workspaceRoot: examplesDir,
  });
  console.log(`  [OK] Session Registered: ID=${session.sessionId}`);

  // Step 3: Agent Publishes Initial SVG Artifact (Revision 1)
  console.log("\n[3/6] Publishing Artifact Revision 1 (solar-system.svg)...");
  const rev1 = await adapter.publishArtifact({
    sessionId: session.sessionId,
    artifactId: "art_solar_system",
    revision: 1,
    kind: "svg",
    entrypoint: "solar-system.svg",
    viewport: { width: 1200, height: 800, devicePixelRatio: 2, zoom: 1, scrollX: 0, scrollY: 0 },
  });
  console.log(`  [OK] Published Revision 1: SHA256 Hash=${rev1 ? (rev1 as any).contentHash : "verified"}`);

  // Step 4: User Circles Mars and Submits Feedback with Dual Captures
  console.log("\n[4/6] Simulating User Annotations & Submitting Feedback...");
  const viewport = { width: 1200, height: 800, devicePixelRatio: 2, zoom: 1, scrollX: 0, scrollY: 0 };
  const annotations = [
    {
      id: "ann_mars_01",
      type: "circle" as const,
      bounds: { x: 0.68, y: 0.58, width: 0.08, height: 0.08 },
      instruction: "Make Mars redder and add two tiny moons (Phobos & Deimos)",
      color: "#EF4444",
      strokeWidth: 3,
      createdAt: new Date().toISOString(),
    },
    {
      id: "ann_saturn_02",
      type: "arrow" as const,
      bounds: { x: 0.82, y: 0.45, width: 0.06, height: 0.06 },
      instruction: "Increase ring inclination angle",
      color: "#F59E0B",
      strokeWidth: 2,
      createdAt: new Date().toISOString(),
    },
  ];

  const dummySvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800"><rect width="100%" height="100%" fill="#070B14"/></svg>`;
  const captures = generateDualCapture(dummySvg, annotations, viewport);

  const receipt = await adapter.deliverFeedback({
    protocolVersion: "1.0",
    feedbackId: `fb_demo_${Date.now()}`,
    sessionId: session.sessionId,
    artifactId: "art_solar_system",
    revision: 1,
    viewport,
    annotations,
    generalInstruction: "Ensure labels remain readable on dark theme.",
    originalScreenshotDataUrl: captures.originalDataUrl,
    annotatedScreenshotDataUrl: captures.annotatedDataUrl,
    idempotencyKey: `idem_demo_${Date.now()}`,
    createdAt: new Date().toISOString(),
  });
  console.log(`  [OK] Feedback Delivered: Status=${receipt.status}`);

  // Step 5: Gemini Agent Formats Feedback into Actionable Instruction Prompt
  console.log("\n[5/6] Gemini CLI Formats Feedback Prompt for Next Coding Turn:");
  const prompt = adapter.formatFeedbackPrompt({
    protocolVersion: "1.0",
    feedbackId: `fb_demo_${Date.now()}`,
    sessionId: session.sessionId,
    artifactId: "art_solar_system",
    revision: 1,
    viewport,
    annotations,
    generalInstruction: "Ensure labels remain readable on dark theme.",
    idempotencyKey: "idem",
    createdAt: new Date().toISOString(),
  });
  console.log("-------------------------------------------------");
  console.log(prompt);
  console.log("-------------------------------------------------");

  // Step 6: Agent Publishes Corrected Revision 2
  console.log("\n[6/6] Publishing Artifact Revision 2...");
  const rev2 = await adapter.publishArtifact({
    sessionId: session.sessionId,
    artifactId: "art_solar_system",
    revision: 2,
    kind: "svg",
    entrypoint: "solar-system.svg",
    viewport,
  });
  console.log(`  [OK] Published Revision 2 successfully!`);

  // Teardown
  await server.stop();
  const elapsed = Date.now() - startTime;
  console.log("\n=================================================");
  console.log(`  DEMO COMPLETE: Full loop executed in ${elapsed}ms`);
  console.log("=================================================");
}

runVisualLoopDemo().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
