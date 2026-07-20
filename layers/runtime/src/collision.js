// runtime - collision (pure, no three.js).
//
// The player is a small axis-aligned square (half-extent `r`) sliding in the XZ plane against the
// scene model's wall colliders. Portal openings are simply not present in `colliders`, so walking
// through a doorway is unobstructed. Resolution is axis-separated (X, then Z) which yields natural
// wall sliding and stops cleanly in corners.

function overlaps(x, z, r, c) {
  return x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ;
}

/**
 * Resolve a desired move from `from` to `to` (each `{x,z}`) against `colliders`, keeping the player
 * (half-extent `r`) out of every wall. `from` is assumed collision-free. Returns the resolved
 * `{x,z}`. Detection uses the target position so a move blocked by the nearest of several stacked
 * walls clamps to that nearest face, not a farther one.
 */
export function resolveMove(colliders, from, to, r) {
  let x = to.x;
  const dx = to.x - from.x;
  if (dx !== 0) {
    for (const c of colliders) {
      if (!overlaps(to.x, from.z, r, c)) continue;
      if (dx > 0) x = Math.min(x, c.minX - r);
      else x = Math.max(x, c.maxX + r);
    }
  }

  let z = to.z;
  const dz = to.z - from.z;
  if (dz !== 0) {
    for (const c of colliders) {
      if (!overlaps(x, to.z, r, c)) continue;
      if (dz > 0) z = Math.min(z, c.minZ - r);
      else z = Math.max(z, c.maxZ + r);
    }
  }

  return { x, z };
}

/** Whether a point (with half-extent `r`) currently penetrates any collider. */
export function isBlocked(colliders, x, z, r) {
  return colliders.some((c) => overlaps(x, z, r, c));
}
