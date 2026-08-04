#!/usr/bin/env node
// Fetch the photographed materials the surfaces layer names, from Poly Haven.
//
//   npm run textures            # into app/public/textures
//   node tools/fetch-textures.js --dir some/other/place
//
// Everything fetched is CC0 (public domain): free to use, commercially, without attribution. The
// files are not committed. Without them the project paints its own surfaces on a canvas and runs
// exactly the same, so this is an upgrade, never a requirement.

import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./src/args.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join(ROOT, "layers", "surfaces", "materials", "manifest.json");
const API = "https://api.polyhaven.com/files";
const AGENT = "duplexity-3d (level toolkit; CC0 material fetch)";

// What we take, and what each is called once it lands. AO/roughness/metalness come packed in one
// image, which is exactly how three.js reads them.
const MAPS = { Diffuse: "albedo", nor_gl: "normal", arm: "arm" };

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": AGENT } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

async function fetchFile(url, to) {
  const res = await fetch(url, { headers: { "User-Agent": AGENT } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  writeFileSync(to, Buffer.from(await res.arrayBuffer()));
  return res.headers.get("content-length") ?? "?";
}

const args = parseArgs(process.argv.slice(2));
const outDir = args.dir && args.dir !== true ? args.dir : join(ROOT, "app", "public", "textures");
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const resolution = manifest.resolution ?? "1k";

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const slugs = [...new Set(Object.values(manifest.materials).map((m) => m.slug))];
console.log(`fetching ${slugs.length} CC0 material(s) at ${resolution} from ${manifest.source}`);

let failed = 0;
for (const slug of slugs) {
  const dir = join(outDir, slug);
  mkdirSync(dir, { recursive: true });
  try {
    const files = await fetchJson(`${API}/${slug}`);
    for (const [key, name] of Object.entries(MAPS)) {
      const url = files[key]?.[resolution]?.jpg?.url;
      const to = join(dir, `${name}.jpg`);
      if (!url) continue; // not every material ships every map
      if (existsSync(to) && !args.force) {
        console.log(`  ${slug}/${name}.jpg (already here)`);
        continue;
      }
      const size = await fetchFile(url, to);
      console.log(`  ${slug}/${name}.jpg (${Math.round(Number(size) / 1024)} kB)`);
    }
  } catch (error) {
    failed += 1;
    console.error(`  ${slug}: ${error.message}`);
  }
}

console.log(
  failed
    ? `${failed} material(s) could not be fetched; the painted surfaces stand in for them`
    : `done -> ${outDir}`
);
process.exitCode = failed ? 1 : 0;
