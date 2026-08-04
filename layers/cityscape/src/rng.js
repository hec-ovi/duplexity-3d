// cityscape - deterministic RNG (pure).
//
// A city looks the same every time it is loaded, so anything that varies (which lane a flying car
// runs down, where a rail crosses, which sheet a tower wears) is driven by a seeded generator off
// the instance id, never Math.random().

// mulberry32: a tiny, fast 32-bit PRNG. Good enough for scenery; not for cryptography.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a: a stable 32-bit hash so a string (an instance id, a prop's id) folds into a numeric seed.
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// A generator seeded from a base number plus any string salts (mixed in by hash), so the traffic and
// the rails over one city each get their own stable stream out of the same instance seed.
export function seededRng(seed, ...salts) {
  let s = seed >>> 0;
  for (const salt of salts) s = (s ^ hashString(String(salt))) >>> 0;
  return mulberry32(s);
}
