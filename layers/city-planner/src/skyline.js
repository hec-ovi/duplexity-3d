// What stands beyond the streets you can walk.
//
// A level that ends at the edge of its last block reads as a diorama. So a ring of towers stands out
// past the boundary: too far to reach, tall enough to close the sky, and marked `distant` so nothing
// tries to put a door on one or count it as a place.
//
// A handful of them are MEGASTRUCTURES: four or five times anything on the ground, tapering as they
// climb, standing over the whole city from wherever you are in it. A skyline of same-sized boxes
// reads as a fence; one or two things that dwarf everything else is what gives a city its scale.

const RING = 4; // how many rows deep the ring stands
const GAP = 26; // metres between one tower and the next
const MARGIN = 30; // how far past the boundary the first row starts
const MEGA = { count: 4, height: [300, 620], width: [110, 210], taper: [0.28, 0.62] };

/**
 * @param {number} extent  the width of the walkable ground
 * @param {object} rng     seeded, so a city's skyline is the same every time it loads
 */
export function skylineFor(extent, rng) {
  const towers = [];
  const half = extent / 2;
  const outer = half + MARGIN + RING * GAP;

  for (let x = -outer; x <= outer; x += GAP) {
    for (let z = -outer; z <= outer; z += GAP) {
      const beyond = Math.max(Math.abs(x), Math.abs(z)) > half + MARGIN;
      if (!beyond || !rng.chance(0.72)) continue;
      // The further out, the taller: the city climbs away from you rather than fencing you in.
      const away = (Math.max(Math.abs(x), Math.abs(z)) - half) / (outer - half);
      const height = rng.range(30, 70) + away * 110;
      const width = rng.range(10, 20);
      towers.push({
        id: `far-${towers.length}`,
        position: [x + rng.range(-5, 5), 0, z + rng.range(-5, 5)],
        size: [width, height, rng.range(10, 20)],
        // Most of them lean in as they rise; a few stand straight, so the ring is not one shape.
        taper: rng.chance(0.7) ? rng.range(0.55, 0.9) : 1,
        floors: Math.max(6, Math.round(height / 3.2)),
      });
    }
  }

  // The megastructures, spaced round the city so one is in view from anywhere in it.
  const ring = outer + rng.range(80, 200);
  for (let i = 0; i < MEGA.count; i++) {
    const turn = (i / MEGA.count) * Math.PI * 2 + rng.range(-0.4, 0.4);
    const away = ring * rng.range(0.85, 1.35);
    const height = rng.range(...MEGA.height);
    const width = rng.range(...MEGA.width);
    towers.push({
      id: `mega-${i}`,
      position: [Math.cos(turn) * away, 0, Math.sin(turn) * away],
      size: [width, height, width * rng.range(0.7, 1.3)],
      taper: rng.range(...MEGA.taper), // a ziggurat or a spindle, never a slab
      floors: Math.round(height / 3.2),
    });
  }
  return towers;
}
