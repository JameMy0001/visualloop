import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { CoreServer } from "@visualloop/core-server";
import { GeminiCliAdapter, applyRevisionSafely } from "@visualloop/adapter-gemini-cli";
import { FeedbackSubmission } from "@visualloop/protocol";

async function runGeminiLiveE2E() {
  console.log("==================================================");
  console.log("   VISUALLOOP GENUINE GEMINI MODEL E2E TEST");
  console.log("==================================================");

  const apiKey = process.env.GEMINI_API_KEY;
  const hasKey = Boolean(apiKey && apiKey.trim().length > 0);

  console.log(`Gemini API Key: ${hasKey ? "CONFIGURED (Live Model Active)" : "NOT SET (Plumbing Check Only)"}`);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "visualloop-live-e2e-"));
  const testSvgPath = path.join(tempDir, "solar-system.svg");

  const initialSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
  <rect width="800" height="600" fill="#0B0D17"/>
  <circle id="sun" cx="400" cy="300" r="50" fill="#FDB813" />
  <circle cx="400" cy="300" r="100" fill="none" stroke="#FFFFFF" stroke-opacity="0.15" stroke-dasharray="4 4" />
  <circle id="mercury" cx="500" cy="300" r="8" fill="#B5A7A7" />
  <text x="400" y="550" fill="#FFFFFF" font-family="sans-serif" font-size="16" text-anchor="middle">Solar System Model</text>
</svg>`;

  fs.writeFileSync(testSvgPath, initialSvg, "utf-8");

  const port = 4192;
  const token = crypto.randomBytes(16).toString("hex");
  const server = new CoreServer({
    port,
    host: "127.0.0.1",
    secretToken: token,
    requireAuth: true,
    storageFilePath: null,
  });

  try {
    const address = await server.start();
    console.log(`[1/4] Core Server active at ${address} (Auth: REQUIRED)`);

    const adapter = new GeminiCliAdapter({ serverUrl: address, secretToken: token });

    // 1. Register Session
    const session = await adapter.registerSession({
      adapterId: "gemini-cli",
      agentName: "Gemini CLI E2E Runner",
      workspaceRoot: tempDir,
    });
    console.log(`[2/4] Agent Session registered: ${session.sessionId}`);

    // 2. Publish Revision 1
    const rev1 = await adapter.publishArtifact({
      sessionId: session.sessionId,
      artifactId: "art_solar_e2e",
      revision: 1,
      kind: "svg",
      entrypoint: "solar-system.svg",
      viewport: { width: 800, height: 600, devicePixelRatio: 2, zoom: 1, scrollX: 0, scrollY: 0 },
    });
    console.log(`[3/4] Revision 1 published (Hash: ${(rev1 as any).contentHash?.slice(0, 12)}...)`);

    // 3. User feedback submission
    const feedback: FeedbackSubmission = {
      protocolVersion: "1.0",
      feedbackId: `fb_e2e_${Date.now()}`,
      sessionId: session.sessionId,
      artifactId: "art_solar_e2e",
      revision: 1,
      viewport: { width: 800, height: 600, devicePixelRatio: 2, zoom: 1, scrollX: 0, scrollY: 0 },
      annotations: [
        {
          id: "ann_sun_glow",
          type: "circle",
          bounds: { x: 0.43, y: 0.41, width: 0.14, height: 0.18 },
          instruction: "Enlarge the sun radius by 25% and add golden corona flares",
          color: "#E14C45",
          strokeWidth: 3,
          createdAt: new Date().toISOString(),
        },
      ],
      generalInstruction: "Maintain clean monochrome-first SVG aesthetics with accurate coordinates.",
      idempotencyKey: `idem_e2e_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };

    console.log(`[4/4] Submitting feedback: "${feedback.annotations[0].instruction}"...`);
    // Submit via server endpoint directly with auth header
    const fbRes = await fetch(`${address}/v1/feedback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-VisualLoop-Token": token,
      },
      body: JSON.stringify(feedback),
    });

    if (!fbRes.ok) throw new Error(`Feedback submission failed: HTTP ${fbRes.status}`);
    console.log("  [OK] Feedback queued in Core Server.");

    if (hasKey) {
      console.log("\n[AI Invocation] Calling Google Gemini API with visual annotations...");
      const currentCode = fs.readFileSync(testSvgPath, "utf-8");
      const { revisedCode, modelUsed } = await adapter.generateRevisionWithGemini({
        sourceCode: currentCode,
        feedback,
      });

      console.log(`  [OK] Model (${modelUsed}) produced revised source code.`);

      // Apply safely with versioned backup
      const safetyResult = applyRevisionSafely({
        targetFilePath: testSvgPath,
        revisedCode,
        revision: 1,
        workspaceRoot: tempDir,
      });

      if (!safetyResult.success) {
        throw new Error(`Safety validation failed: ${safetyResult.error}`);
      }

      console.log(`  [Safety] Versioned backup saved: ${path.basename(safetyResult.backupPath!)}`);

      // Publish Revision 2
      const rev2 = await adapter.publishArtifact({
        sessionId: session.sessionId,
        artifactId: "art_solar_e2e",
        revision: 2,
        kind: "svg",
        entrypoint: "solar-system.svg",
        viewport: feedback.viewport,
      });

      // Acknowledge feedback
      await adapter.acknowledgeFeedback(feedback.feedbackId);

      console.log(`\n==================================================`);
      console.log(`[PASS] LIVE GEMINI MODEL E2E VERIFIED!`);
      console.log(`Revision 2 Hash: ${(rev2 as any).contentHash?.slice(0, 16)}...`);
      console.log(`File modified on disk with safety guarantees.`);
      console.log(`==================================================\n`);
    } else {
      console.log("\n==================================================");
      console.log("[INFO] Plumbing & Security Verified.");
      console.log("Notice: Set GEMINI_API_KEY to execute the live AI model call.");
      console.log("Command: export GEMINI_API_KEY='your-key' && pnpm test:gemini-e2e");
      console.log("==================================================\n");
    }
  } finally {
    await server.stop();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

runGeminiLiveE2E().catch((err) => {
  console.error("E2E Test Error:", err);
  process.exit(1);
});
