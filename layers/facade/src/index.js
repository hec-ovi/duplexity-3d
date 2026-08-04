// facade - dress one building.
//
// Isolation: imports no other layer's src, no three.js, no DOM. It takes the shape of a building and
// returns the small things bolted to it: balconies on the storeys above the street, an awning over a
// shopfront, and the cartel that says what the place is. Everything comes back as plain boxes in the
// building's OWN frame (origin in the middle of its footprint, on the ground) with the way each one
// faces, so a renderer only has to add the building's position and turn them.
//
// Every choice runs through the seed, so a building is dressed the same way every time it is loaded.

import { createRng, hashString } from "./rng.js";
import { nameFor } from "./naming.js";
import { MAX_BALCONY_BAYS, awning, balconies, sign, signHeight, walls, windowBays, windowsOn } from "./parts.js";

const SIGN_COLOURS = ["#e8899f", "#dda368", "#7cc3d4", "#a892c8", "#ddc87e", "#8fd6a6"];
const AWNING_COLOURS = ["#7d4a52", "#4c5b6b", "#6b5a3c", "#3f5c50"];
const BALCONIED = new Set(["apartments", "house"]);
// What a lit window looks like from the street: mostly warm, the odd cold office or bar.
const WINDOW_COLOURS = ["#ffd7a0", "#ffe9c4", "#f6c98a", "#bfe0ff", "#a8f0e0"];
const BAY = 3; // the same rhythm the facade is painted on, so a balcony lands over a window

export class BuildingInvalidError extends Error {
  constructor(reason) {
    super(`building cannot be dressed: ${reason}`);
    this.code = "BUILDING_INVALID";
  }
}

/**
 * @param {object} building
 *   `{ id, size: { w, h, d }, floors, storeyHeight?, program?, door?: { face, along }, seed? }`
 *   `door.face` is one of south|north|west|east and `door.along` is metres from the middle of that
 *   wall, which is where the sign and the awning go.
 * @returns {{ name: string|null, parts: object[] }} schema: schema/facade-parts.json
 */
export function dressFacade(building) {
  const { w, h, d } = building.size ?? {};
  if (!(w > 0 && h > 0 && d > 0)) throw new BuildingInvalidError("no footprint");
  const floors = Math.max(1, building.floors ?? 1);
  const storey = building.storeyHeight ?? h / floors;
  const program = building.program ?? "shop";
  const rng = createRng(hashString(building.seed ?? building.id ?? "facade"));

  const name = nameFor(program, rng);
  const colour = rng.pick(SIGN_COLOURS);
  const faces = walls({ w, d });
  const parts = [];

  // Windows, on every wall of every storey above the shopfront. One object each, its own light on or
  // off, so no two walls of a city read the same.
  const glazedGround = program === "house";
  for (const wall of faces) {
    const bays = windowBays(wall.span);
    for (let storeyIndex = glazedGround ? 0 : 1; storeyIndex < floors; storeyIndex++) {
      parts.push(...windowsOn(wall, storeyIndex * storey, bays, building.litRatio ?? 0.45, rng, WINDOW_COLOURS));
    }
  }

  // Balconies, on the storeys above the street only: nobody hangs one over their own shopfront.
  // Two walls at most and six storeys at most, so a tall block does not turn into a filing cabinet.
  if (BALCONIED.has(program) && floors >= 2) {
    const picked = faces.filter(() => rng.chance(0.5)).slice(0, 2);
    const dressed = picked.length ? picked : [rng.pick(faces)]; // a balconied block always has some
    for (const wall of dressed) {
      const bays = Math.max(1, Math.min(MAX_BALCONY_BAYS, Math.round(wall.span / BAY)));
      for (let storeyIndex = 1; storeyIndex < Math.min(floors, 7); storeyIndex++) {
        parts.push(...balconies(wall, storeyIndex * storey, bays, rng));
      }
    }
  }

  const front = faces.find((wall) => wall.name === building.door?.face);
  if (front) {
    const along = building.door.along ?? 0;
    if (program === "shop") {
      parts.push(awning(front, along, Math.min(front.span - 0.6, 4.2), storey, rng.pick(AWNING_COLOURS)));
    }
    if (name) {
      const width = Math.min(front.span - 0.8, Math.max(2.2, name.length * 0.3));
      parts.push(sign(front, along, signHeight(storey), width, { text: name, colour }));
      // Something tall enough to be seen down the street gets a second one, out at right angles,
      // hung clear above the shopfront so the two never share a wall.
      if (floors >= 3 && rng.chance(0.55)) {
        // Kept on the wall it is fixed to, and under the parapet: a sign hanging off the end of a
        // building, or over the top of it, is a sign nobody built.
        const blade = Math.min(2, width);
        const room = front.span / 2 - blade / 2 - 0.3;
        parts.push(
          sign(front, Math.max(-room, Math.min(room, along + width * 0.7)), Math.min(storey * 1.75, h - 1.4), blade, {
            text: name.split(" ")[0],
            colour,
            blade: true,
          })
        );
      }
    }
  }

  return { name, parts };
}
