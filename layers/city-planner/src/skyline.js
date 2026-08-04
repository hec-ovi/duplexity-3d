// What stands beyond the streets you can walk.
//
// A level that ends at the edge of its last block reads as a diorama. So a ring of towers stands out
// past the boundary: too far to reach, tall enough to close the sky, and marked `distant` so nothing
// tries to put a door on one or count it as a place.

const RING = 3; // how many rows deep the ring stands
const GAP = 26; // metres between one tower and the next
const MARGIN = 30; // how far past the boundary the first row starts

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
      const height = rng.range(30, 70) + away * 60;
      const width = rng.range(10, 20);
      towers.push({
        id: `far-${towers.length}`,
        position: [x + rng.range(-5, 5), 0, z + rng.range(-5, 5)],
        size: [width, height, rng.range(10, 20)],
        floors: Math.max(6, Math.round(height / 3.2)),
      });
    }
  }
  return towers;
}
