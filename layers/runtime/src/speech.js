// runtime - in-scene speech model (pure, no three.js).
//
// The data behind a billboarded speech bubble: one active line per NPC with a lifetime. The renderer
// (labels-overlay.js, HTML over the canvas) just mirrors whatever is active; this module
// owns WHEN a bubble shows and expires. Lifetime is counted in accumulated sim dt, so it is
// deterministic and needs no wall clock.

export const BUBBLE_TTL = 6; // seconds a spoken line stays up

export function createSpeech() {
  const bubbles = new Map(); // npcId -> { text, ttl }

  return {
    // Show `text` above `npcId` for `ttl` seconds (replacing any current line). Empty text is a no-op.
    say(npcId, text, ttl = BUBBLE_TTL) {
      if (!text) return null;
      const bubble = { text, ttl };
      bubbles.set(npcId, bubble);
      return bubble;
    },
    // Age every bubble by dt and drop the expired ones.
    tick(dt) {
      for (const [id, b] of bubbles) {
        b.ttl -= dt;
        if (b.ttl <= 0) bubbles.delete(id);
      }
    },
    get(npcId) {
      return bubbles.get(npcId) ?? null;
    },
    active() {
      return [...bubbles.entries()].map(([npcId, b]) => ({ npcId, text: b.text, ttl: b.ttl }));
    },
    clear() {
      bubbles.clear();
    },
  };
}
