// runtime - deterministic RNG (pure).
//
// Play-time is deterministic, so any "random" NPC choice (a wander target, patrol jitter) is driven
// by a seeded generator, never Math.random(). Same seed => same play, which also keeps the NPC sim
// tests reproducible: replay a scene and every NPC walks the identical path.

// mulberry32: a tiny, fast 32-bit PRNG. Good enough for gameplay noise; not for cryptography.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a: a stable 32-bit hash so a string (e.g. an NPC id) folds into a numeric seed.
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// A generator seeded from a base number plus any string/number salts (mixed in by hash), so each
// NPC gets its own stable stream out of one instance seed.
export function seededRng(seed, ...salts) {
  let s = seed >>> 0;
  for (const salt of salts) s = (s ^ hashString(String(salt))) >>> 0;
  return mulberry32(s);
}
