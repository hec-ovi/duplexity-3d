// Where the light stands. A lamp on each side of every block, and the glow off the front of every
// place you can walk into.
//
// This is placement only: how tall a lamp is, what colour it burns and how many are lit at once are
// decisions the renderer makes.

import { BLOCK } from "./lattice.js";

const LAMP_INSET = 1.6; // metres in from the pavement edge, so a lamp stands on it, not in the road
const SIGN_STANDOFF = 0.6; // how far a sign hangs off the face it is fixed to

/**
 * @param {Array} cells      the lattice
 * @param {Set<number>} used which blocks have premises on them
 * @param {Array} doors      `{ id, blockId, position, face }` per front door
 * @returns {Array} room lights (schema: persistence/room.json `lights`)
 */
export function placeLights(cells, used, doors) {
  const lights = [];
  const half = BLOCK / 2 - LAMP_INSET;

  for (const index of [...used].sort((a, b) => a - b)) {
    const { x, z } = cells[index].center;
    const corners = [
      [x, z - half],
      [x, z + half],
      [x - half, z],
      [x + half, z],
    ];
    corners.forEach(([lx, lz], i) => {
      lights.push({ id: `lamp-${index}-${i}`, kind: "street_lamp", position: [lx, 0, lz] });
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
  }

  return lights;
}
