import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import path from "path";

// Separate config from vitest.config.ts on purpose: evals hit the real
// Anthropic API (cost, non-determinism, needs ANTHROPIC_API_KEY) and take
// far longer than the unit suite, so they get their own include glob
// (*.eval.ts, not *.test.ts) and a longer default timeout rather than
// blending into `npm test`.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./src/test/server-only-shim.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["evals/**/*.eval.ts"],
    testTimeout: 45000,
    // Vite deliberately skips .env.local when mode is "test" (its default
    // under vitest) to stop local secrets leaking into test runs by
    // default. Evals are the one deliberate, script-gated exception: they
    // need ANTHROPIC_API_KEY and the Supabase server vars, so load with
    // mode "development" instead to pick up .env.local too.
    env: loadEnv("development", process.cwd(), ""),
  },
});
