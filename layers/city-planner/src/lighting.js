// Where the light stands. Lamps down each side of every block, a bracket on the odd building face,
// and the glow off the front of every place you can walk into.
//
// This is placement only: how tall a lamp is, what colour it burns and how many are lit at once are
// decisions the renderer makes. What KIND of lamp stands there is decided here, because it is part
// of the street rather than of the render: one street runs on posts, the next on bollards.

import { BLOCK } from "./lattice.js";

const LAMP_INSET = 1.6; // metres in from the pavement edge, so a lamp stands on it, not in the road
const SIGN_STANDOFF = 0.6; // how far a sign hangs off the face it is fixed to
const WALL_LAMP = { height: 0, standoff: 0.4, chance: 0.5 }; // a bracket over a door, on its wall

// What can stand on a pavement. A post is the ordinary one; the rest are what stops a city reading
// as one lamp copied down every street.
const STYLES = ["post", "post", "twin", "bollard", "reach"];

/**
 * @param {Array} cells      the lattice
 * @param {Set<number>} used which blocks have premises on them
 * @param {Array} doors      `{ id, blockId, position, face }` per front door
 * @param {object} [rng]     the seeded generator; without one every lamp is a plain post
 * @returns {Array} room lights (schema: persistence/room.json `lights`)
 */
export function placeLights(cells, used, doors, rng) {
  const lights = [];
  const half = BLOCK / 2 - LAMP_INSET;

  for (const index of [...used].sort((a, b) => a - b)) {
    const { x, z } = cells[index].center;
    // One kind of lamp per block, so a street reads as a street rather than as a sample book.
    const style = rng ? rng.pick(STYLES) : "post";
    const corners = [
      [x, z - half],
      [x, z + half],
      [x - half, z],
      [x + half, z],
    ];
    corners.forEach(([lx, lz], i) => {
      lights.push({ id: `lamp-${index}-${i}`, kind: "street_lamp", style, position: [lx, 0, lz] });
    });
  }

  for (const door of doors) {
    const [dx, , dz] = door.position;
    // Stand it off the face the door is on, so the glow sits in the street rather than in the wall.
    lights.push({
      id: `sign-${door.id}`,
      kind: "sign",
      blockId: door.blockId,
      position: [dx + door.face.dx * SIGN_STANDOFF, 0, dz + door.face.dz * SIGN_STANDOFF],
      facing: Math.atan2(door.face.dx, door.face.dz),
    });
    // Some doors also carry a bracket lamp on the wall beside them: light that comes off a building
    // rather than out of the middle of the road.
    if (rng && !rng.chance(WALL_LAMP.chance)) continue;
    lights.push({
      id: `bracket-${door.id}`,
      kind: "wall_lamp",
      blockId: door.blockId,
      position: [dx + door.face.dx * WALL_LAMP.standoff, 0, dz + door.face.dz * WALL_LAMP.standoff],
      facing: Math.atan2(door.face.dx, door.face.dz),
    });
  }

  return lights;
}
