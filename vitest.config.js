import { defineConfig } from "vitest/config";

// Default environment is node (schema + pure-logic contract tests). Files that need a DOM (the
// runtime app shell / interaction tests) opt in per-file with a `// @vitest-environment jsdom`
// docblock. Discovery stays flat: every layer's tests/, the shared harness tests, and the two
// composition roots that have tests - server/ (the HTTP routes, end to end) and tools/ (the level
// generators, composed and then played).
export default defineConfig({
  test: {
    include: [
      "layers/**/tests/**/*.test.js",
      "harness/**/*.test.js",
      "server/**/*.test.js",
      "tools/**/*.test.js",
    ],
    environment: "node",
    globals: false,
  },
});
