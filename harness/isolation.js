import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LAYERS_DIR = join(HERE, "..", "layers");

// Both a layer's src/ and its tests/ are scanned: neither may import another layer's src/.
// (Reading another layer's published fixtures/ as example data, or depending on its schema/, is
// contract-sanctioned and NOT a violation. This guard is about code coupling only.)
const SCAN_SCOPES = ["src", "tests"];

function layerNames() {
  try {
    return readdirSync(LAYERS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

function walkJs(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkJs(p));
    else if (/\.(m?js|jsx|ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

// Every way an ES/CJS module can name another module, INCLUDING a bare side-effect import
// (`import "x"`), which has no binding and no `from`/`(`:
//   import ... from "x" | export ... from "x" | import("x") | require("x") | import "x"
const SPEC_RE =
  /(?:\bimport\s+[^;'"]*?\bfrom\s*|\bexport\s+[^;'"]*?\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s*(?=['"]))['"]([^'"]+)['"]/g;

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The one rule, enforced statically: no layer's src/ or tests/ may import another layer's src/.
 * Cross-layer collaboration happens through injected dependencies validated by schema, never a
 * code import. Returns an array of violations (empty means the codebase is clean).
 */
export function findCrossLayerImports() {
  const layers = layerNames();
  const patterns = layers.map((name) => ({
    name,
    re: new RegExp(`(?:^|/)${escapeRe(name)}/src(?:/|$)`),
  }));
  const violations = [];

  for (const layer of layers) {
    for (const scope of SCAN_SCOPES) {
      for (const file of walkJs(join(LAYERS_DIR, layer, scope))) {
        const code = readFileSync(file, "utf8");
        let m;
        SPEC_RE.lastIndex = 0;
        while ((m = SPEC_RE.exec(code))) {
          const spec = m[1];
          for (const { name, re } of patterns) {
            if (name === layer) continue; // a file importing its OWN layer's src is fine
            if (re.test(spec)) {
              violations.push({
                file: relative(join(HERE, ".."), file),
                imports: spec,
                reachesInto: name,
              });
            }
          }
        }
      }
    }
  }
  return violations;
}
