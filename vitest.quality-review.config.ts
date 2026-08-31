import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import path from "path";

// Separate again from both vitest.config.ts and vitest.eval.config.ts:
// the quality-review batch (evals/assist-quality-review.review.ts) makes
// several real LLM calls purely to print output for a human to read — it
// has no pass/fail assertions, so it must never be swept into `npm run
// eval`'s automatic pass/fail run (that would silently add cost and time
// to routine testing for a step that can't actually fail). Deliberately
// named *.review.ts, not *.eval.ts, so vitest.eval.config.ts's own
// include glob (evals/**/*.eval.ts) can never accidentally pick it up
// even if someone runs it against this file directly.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./src/test/server-only-shim.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["evals/assist-quality-review.review.ts"],
    testTimeout: 120000,
    env: loadEnv("development", process.cwd(), ""),
  },
});
