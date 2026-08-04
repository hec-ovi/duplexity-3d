// What is on the street besides the buildings: things parked at the kerb, things standing on the
// corners, and the line a shuttle runs along.
//
// Placement only, like the lighting: this says a van stands here and how big it is, so it can be
// walked around. What it looks like is the renderer's.

import { BLOCK, STREET, groundSize } from "./lattice.js";

// Everything that can stand on a street, and how much room it takes, in metres.
const PROPS = {
  car: { size: [1.9, 1.5, 4.4], kerb: 1.4 },
  van: { size: [2.2, 2.5, 5.6], kerb: 1.6 },
  bike: { size: [0.7, 1.1, 1.9], kerb: 0.7 },
  bin: { size: [0.9, 1.2, 0.9], kerb: 0.6 },
  bollard: { size: [0.3, 0.9, 0.3], kerb: 0.3 },
  traffic_light: { size: [0.4, 3.6, 0.4], kerb: 0.5 },
};

const PARKED = ["car", "car", "van", "bike", "bin"];
const HALF = BLOCK / 2;

/**
 * Park things along the kerbs of every block that has premises on it, and stand a traffic light on
 * each of its corners.
 *
 * @param {Array} cells       the lattice
 * @param {Set<number>} used  which blocks have premises on them
 * @param {Array} doors       front doors, so nothing is parked across one
 * @param {object} rng
 * @returns {Array<{id,kind,position,size,facing}>}
 */
export function placeProps(cells, used, doors, rng) {
  const props = [];
  const blocked = doors.map(([x, z]) => ({ x, z }));
  const clear = (x, z) => blocked.every((d) => Math.hypot(d.x - x, d.z - z) > 3.5);

  for (const index of [...used].sort((a, b) => a - b)) {
    const { x, z } = cells[index].center;

    // Two kerbs per block, each with a run of parked things along it. The other two are left open,
    // so a block never reads as a car park.
    for (const side of [-1, 1]) {
      const alongX = rng.chance(0.5);
      let at = -HALF + rng.range(3, 7);
      while (at < HALF - 6) {
        const kind = rng.pick(PARKED);
        const spec = PROPS[kind];
        const out = HALF + spec.kerb;
        const px = alongX ? x + at : x + side * out;
        const pz = alongX ? z + side * out : z + at;
        if (clear(px, pz)) {
          props.push({
            id: `prop-${index}-${props.length}`,
            kind,
            position: [px, 0, pz],
            size: spec.size,
            // Parked along the kerb, so it points down the street it is standing in.
            facing: alongX ? 0 : Math.PI / 2,
          });
        }
        at += spec.size[2] + rng.range(1.2, 3.4);
      }
    }

    // A light on each corner of the intersection, standing just off the kerb. The pavement round a
    // block is left clear all the way: it is the way to every door on it.
    const corner = HALF + 0.8;
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      props.push({
        id: `signal-${index}-${cx}${cz}`,
        kind: "traffic_light",
        position: [x + cx * corner, 0, z + cz * corner],
        size: PROPS.traffic_light.size,
        facing: Math.atan2(-cx, -cz),
      });
    }
  }
  return props;
}

/**
 * The line a shuttle runs along: the street nearest the middle of the city, west to east, with a
 * stop opposite every block column. A city you can walk across in a minute does not need one, so a
 * single-block lattice gets nothing.
 *
 * @param {number} n  the lattice is n x n blocks
 * @returns {{ id: string, stops: Array<[number,number,number]> }|null}
 */
export function transitLine(n) {
  if (n < 2) return null;
  const half = groundSize(n) / 2;
  // Street centres run between the rows of blocks; take the one nearest the middle.
  const streets = Array.from({ length: n + 1 }, (_, k) => -half + STREET / 2 + k * (BLOCK + STREET));
  const z = streets.reduce((best, s) => (Math.abs(s) < Math.abs(best) ? s : best), streets[0]);
  const columns = Array.from({ length: n }, (_, i) => -half + STREET + i * (BLOCK + STREET) + BLOCK / 2);

  return {
    id: "shuttle-line",
    stops: [[-half + STREET / 2, 0, z], ...columns.map((x) => [x, 0, z]), [half - STREET / 2, 0, z]],
  };
}
