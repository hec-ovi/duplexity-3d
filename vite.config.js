import { defineConfig } from "vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Dev/build config for the Phase 2 playable slice. `npm run dev` serves the composition root in
// app/, which is the ONE place allowed to wire multiple layers together (it lives outside layers/,
// so the isolation checker does not scan it). Tests use vitest.config.js, not this file.
const repoRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: resolve(repoRoot, "app"),
  // The app imports layer sources and the shared fixture from outside app/, so allow fs access up
  // to the repo root (and node_modules resolves by walking up from app/).
  server: { fs: { allow: [repoRoot] }, open: true },
  build: { outDir: resolve(repoRoot, "dist/runtime-demo"), emptyOutDir: true },
});
