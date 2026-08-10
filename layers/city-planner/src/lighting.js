// Where the light stands. A lamp on each side of every block, and the glow off the front of every
// place you can walk into.
//
// This is placement only: how tall a lamp is, what colour it burns and how many are lit at once are
// decisions the renderer makes.

const LAMP_INSET = 1.6; // metres in from the pavement edge, so a lamp stands on it, not in the road
const SIGN_STANDOFF = 0.6; // how far a sign hangs off the face it is fixed to

/**
 * @param {Array} pavements `{ id, center, size }` per block that has premises on it
 * @param {Array} doors     `{ id, blockId, position, face }` per front door
 * @returns {Array} room lights (schema: persistence/room.json `lights`)
 */
export function placeLights(pavements, doors) {
  const lights = [];

  for (const pavement of pavements) {
    const { x, z } = pavement.center;
    const halfW = pavement.size.w / 2 - LAMP_INSET;
    const halfD = pavement.size.d / 2 - LAMP_INSET;
    const corners = [
      [x, z - halfD],
      [x, z + halfD],
      [x - halfW, z],
      [x + halfW, z],
    ];
    corners.forEach(([lx, lz], i) => {
      lights.push({ id: `lamp-${pavement.id.split("-")[1]}-${i}`, kind: "street_lamp", position: [lx, 0, lz] });
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
