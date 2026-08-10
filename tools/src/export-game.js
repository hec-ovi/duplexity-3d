// tools - write a world out.
//
// Two things come out of one world, and the first is enough on its own:
//
//   the city   city.json + assets/  - what stands where, and the files it stands. Any engine reads it
//   the game   index.html + the engine + world.json - a folder you serve and play
//
// Nothing here knows how a city is generated: it copies what `World.build()` already wrote.

import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const APP = join(REPO, "app");

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * @param {import("./worlds.js").World} world
 * @param {object} [opts]
 * @param {string} [opts.out]      where to write it. Default `dist/<name>`
 * @param {boolean} [opts.dataOnly] only the assets and the coordinates: no page, no engine
 * @returns {Promise<object>} what was written
 */
export async function exportGame(world, { out, dataOnly = false } = {}) {
  if (!existsSync(world.worldPath)) {
    throw fail("NOT_BUILT", `"${world.name}" has not been built yet: run \`world build ${world.name}\``);
  }
  const target = resolve(out ?? join(REPO, "dist", world.name));
  mkdirSync(target, { recursive: true });

  // The engine first: it may clear the folder it builds into.
  let page = null;
  if (!dataOnly) {
    const { build } = await import("vite");
    await build({
      root: APP,
      logLevel: "warn",
      build: {
        outDir: target,
        emptyOutDir: true,
        // The engine's own files go in `game/`, so the world's `assets/` stays the world's.
        assetsDir: "game",
      },
    });
    page = join(target, "index.html");
  }

  cpSync(world.cityPath, join(target, "city.json"));
  cpSync(world.worldPath, join(target, "world.json"));
  if (existsSync(world.assetsDir)) cpSync(world.assetsDir, join(target, "assets"), { recursive: true });

  if (!dataOnly) {
    // A page opened off the filesystem cannot fetch its own world, so say how to serve it.
    writeFileSync(
      join(target, "README.md"),
      `# ${world.name}\n\nServe this folder and open it:\n\n    npx serve .\n\n` +
        `\`world.json\` is the game (the level, the people in it, the files it needs). \`city.json\` is the\n` +
        `city on its own: what stands where, and which file each building is. \`assets/\` holds those files.\n`
    );
  }

  return {
    world: world.name,
    out: target,
    ...(page ? { page, serve: `npx serve ${target}` } : {}),
    city: join(target, "city.json"),
    game: join(target, "world.json"),
    assets: join(target, "assets"),
  };
}
