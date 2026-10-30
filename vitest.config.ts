import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/src-tauri/**"],
  },
  resolve: {
    alias: {
      "@visualloop/protocol": path.resolve(__dirname, "./packages/protocol/src/index.ts"),
      "@visualloop/preview-engine": path.resolve(__dirname, "./packages/preview-engine/src/index.ts"),
      "@visualloop/core-server": path.resolve(__dirname, "./packages/core-server/src/index.ts"),
      "@visualloop/agent-sdk": path.resolve(__dirname, "./packages/agent-sdk/src/index.ts"),
      "@visualloop/adapter-gemini-cli": path.resolve(__dirname, "./adapters/gemini-cli/src/index.ts"),
    },
  },
});
