import { defineConfig } from "vitest/config";

// Default environment is node (schema + pure-logic contract tests). Files that need a DOM (the
// runtime app shell / interaction tests) opt in per-file with a `// @vitest-environment jsdom`
// docblock. Discovery stays flat: every layer's tests/, the shared harness tests, and the backend
// composition root in server/ (the author-time HTTP route, tested end to end).
export default defineConfig({
  test: {
    include: ["layers/**/tests/**/*.test.js", "harness/**/*.test.js", "server/**/*.test.js"],
    environment: "node",
    globals: false,
  },
});
