import { defineConfig } from "vitest/config";

// Phase 1 = contract tests only: schema validation + stub entry points.
// Later phases add jsdom/component tests for the runtime and ux-shell layers,
// scoped per-folder. Discovery stays flat: every layer's tests/ plus the shared
// harness tests.
export default defineConfig({
  test: {
    include: ["layers/**/tests/**/*.test.js", "harness/**/*.test.js"],
    environment: "node",
    globals: false,
  },
});
