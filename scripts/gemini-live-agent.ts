import fs from "node:fs";
import path from "node:path";
import { GeminiCliAdapter } from "@visualloop/adapter-gemini-cli";

function countLines(str: string): number {
  return str.split("\n").length;
}

async function main() {
  const targetFileArg = process.argv[2] || "examples/solar-system.svg";
  const targetFilePath = path.resolve(process.cwd(), targetFileArg);

  // Security: Protect against escaping the current workspace root
  const workspaceRoot = process.cwd();
  if (!targetFilePath.startsWith(workspaceRoot)) {
    console.error(
      `[Security Error] Target path "${targetFilePath}" is outside current workspace "${workspaceRoot}". Operation aborted.`
    );
    process.exit(1);
  }

  if (!fs.existsSync(targetFilePath)) {
    console.error(`Error: Target file not found at ${targetFilePath}`);
    process.exit(1);
  }

  const ext = path.extname(targetFilePath).toLowerCase();
  const kind: "svg" | "html" = ext === ".svg" ? "svg" : "html";
  const filename = path.basename(targetFilePath);
  const serverUrl = process.env.VISUALLOOP_SERVER_URL || "http://127.0.0.1:4178";
  const secretToken = process.env.VISUALLOOP_SECRET_TOKEN;

  console.log("==================================================");
  console.log("   VISUALLOOP REAL GEMINI AI AGENT RUNNER");
  console.log("==================================================");
  console.log(`Target File:  ${targetFilePath} (${kind.toUpperCase()})`);
  console.log(`Workspace:    ${workspaceRoot}`);
  console.log(`Core Server:  ${serverUrl}`);
  console.log(
    `Gemini Key:   ${
      process.env.GEMINI_API_KEY
        ? "CONFIGURED (Live Model Active)"
        : "NOT SET (Running in Interactive/Review Mode)"
    }`
  );
  console.log("--------------------------------------------------");

  const adapter = new GeminiCliAdapter({ serverUrl, secretToken });

  // 1. Register Session
  console.log("[1/3] Registering Agent Session with VisualLoop Core Server...");
  let session;
  try {
    session = await adapter.registerSession({
      adapterId: "gemini-cli",
      agentName: "Gemini CLI Agent",
      workspaceRoot: path.dirname(targetFilePath),
    });
    console.log(`  [OK] Session Registered: ${session.sessionId}`);
  } catch (err: any) {
    console.error(`  [FAIL] Could not connect to VisualLoop Core Server at ${serverUrl}.`);
    console.error(
      `  Please ensure VisualLoop is running (e.g. 'pnpm start' or 'pnpm --filter @visualloop/core-server start').`
    );
    process.exit(1);
  }

  // 2. Publish Initial Revision 1
  console.log(`\n[2/3] Publishing Revision 1 of ${filename} to VisualLoop...`);
  let currentRevision = 1;
  const initialContent = fs.readFileSync(targetFilePath, "utf-8");
  const rev1 = await adapter.publishArtifact({
    sessionId: session.sessionId,
    artifactId: `art_${path.basename(filename, ext).replace(/[^a-zA-Z0-9_-]/g, "_")}`,
    revision: currentRevision,
    kind,
    entrypoint: filename,
    viewport: { width: 1024, height: 768, devicePixelRatio: 2, zoom: 1, scrollX: 0, scrollY: 0 },
  });
  console.log(
    `  [OK] Revision 1 live in VisualLoop desktop overlay! (Hash: ${(rev1 as any).contentHash?.slice(0, 10)}...)`
  );

  // 3. Watch for Feedback
  console.log("\n[3/3] Watching for user annotations in VisualLoop...");
  console.log(">>> OPEN VISUALLOOP DESKTOP APP, CIRCLE AN ELEMENT, AND PRESS 'SUBMIT FEEDBACK' <<<");
  console.log("Press Ctrl+C to terminate.\n");

  adapter.watchFeedback(session.sessionId, async (feedback) => {
    console.log("\n==================================================");
    console.log(`[FEEDBACK RECEIVED] ID: ${feedback.feedbackId}`);
    console.log(`Total Annotations: ${feedback.annotations.length}`);
    if (feedback.generalInstruction) {
      console.log(`General Direction: "${feedback.generalInstruction}"`);
    }
    feedback.annotations.forEach((ann, idx) => {
      console.log(`  #${idx + 1} [${ann.type}]: "${ann.instruction}"`);
    });

    const currentCode = fs.readFileSync(targetFilePath, "utf-8");

    if (process.env.GEMINI_API_KEY) {
      console.log("\n[AI Active] Calling Gemini AI Model with annotations and screenshot...");
      const backupPath = `${targetFilePath}.bak`;
      const tempPath = `${targetFilePath}.tmp.${Date.now()}`;

      try {
        const { revisedCode, modelUsed } = await adapter.generateRevisionWithGemini({
          sourceCode: currentCode,
          feedback,
          model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        });

        // 1. Create safety backup
        fs.writeFileSync(backupPath, currentCode, "utf-8");
        console.log(`  [Safety] Created backup: ${path.basename(backupPath)}`);

        // 2. Write to staged temp file
        fs.writeFileSync(tempPath, revisedCode, "utf-8");

        // 3. Diff inspection
        const oldLines = countLines(currentCode);
        const newLines = countLines(revisedCode);
        console.log(
          `  [Diff] Source lines: ${oldLines} -> ${newLines} (${newLines >= oldLines ? "+" : ""}${newLines - oldLines})`
        );

        // 4. Atomic swap
        fs.renameSync(tempPath, targetFilePath);
        currentRevision += 1;
        console.log(`  [OK] Gemini (${modelUsed}) atomically modified ${filename} on disk.`);

        // 5. Publish Revision N+1
        const nextRev = await adapter.publishArtifact({
          sessionId: session.sessionId,
          artifactId: feedback.artifactId,
          revision: currentRevision,
          kind,
          entrypoint: filename,
          viewport: feedback.viewport,
        });
        console.log(
          `  [OK] Published Revision ${currentRevision} to VisualLoop! (Hash: ${(nextRev as any).contentHash?.slice(0, 10)}...)`
        );
        console.log(">>> VisualLoop preview updated automatically! <<<\n");
      } catch (err: any) {
        console.error("  [FAIL] Error during Gemini AI code generation:", err.message);

        // Clean up temp file if present
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }

        // Automatic rollback from backup if file was corrupted
        if (fs.existsSync(backupPath)) {
          fs.copyFileSync(backupPath, targetFilePath);
          console.log(`  [Rollback] Restored original content from ${path.basename(backupPath)}`);
        }

        throw err; // Let watchFeedback keep it queued for retry
      }
    } else {
      console.log("\n[Prompt Generated for Agent]");
      console.log("--------------------------------------------------");
      console.log(adapter.formatFeedbackPrompt(feedback));
      console.log("--------------------------------------------------");
      console.log("Notice: Set GEMINI_API_KEY to enable automatic AI code editing.\n");
    }
  });
}

main().catch((err) => {
  console.error("Agent runner error:", err);
  process.exit(1);
});
