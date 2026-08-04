// npc - author NpcDefs (author-time) and resolve one interaction into a mode + dialogue (play-time).
// It imports no other layer's src.
//
// Play-time brain (Phase 6): resolveInteraction stays a deterministic stand-in by default, but when an
// injected `brain` (the text provider / local LLM) is supplied it drives the decision. Either way the
// raw decision is deterministically re-validated against the live selfContext (sanitizeDecision):
// newMode must be an allowedMode, a target must reference something that actually exists in the
// snapshot, and any failure (bad JSON, an off-contract mode, a thrown or timed-out model) collapses to
// the safe fallback (keep the current mode, stay silent) so play never blocks on the model. This is the
// tech-stack's "grammar-constrain the model, then deterministically re-validate" doctrine, enforced at
// the layer that owns the InteractionResult contract. A real grammar-constrained GGUF drops in behind
// the same seam (buildInteractionPrompt + the interaction-result schema as its GBNF) with no caller
// change; the async model call itself lives in the server composition root, which awaits it and hands
// the raw text to sanitizeDecision.

// The animation clip each mode needs to play. allowedModes are bounded by what the chosen body can
// actually animate (the contract: an NPC never gets a mode its body cannot perform), matching the
// runtime's own mode -> clip mapping.
const MODE_CLIP = {
  idle: "idle",
  wander: "walk",
  patrol: "walk",
  move_to: "walk",
  follow: "walk",
  flee: "walk",
  guard: "idle",
  attack: "attack",
  talk: "talk",
  dead: "die",
};

// The mode palette each disposition draws from, before intersecting with the body's real clips.
const MODES_BY_DISPOSITION = {
  friendly: ["idle", "talk", "wander", "follow", "flee"],
  neutral: ["idle", "talk", "wander", "patrol", "follow", "flee"],
  wary: ["idle", "patrol", "guard", "wander", "flee"],
  hostile: ["idle", "patrol", "guard", "attack", "move_to", "flee"],
};

const START_MODE_BY_DISPOSITION = {
  friendly: ["idle", "wander"],
  neutral: ["idle", "wander"],
  wary: ["patrol", "guard", "idle"],
  hostile: ["guard", "patrol", "idle"],
};

// FNV-1a: a stable integer from a string, so a character's voice is seeded deterministically (no
// Math.random / Date, matching the play-time determinism doctrine).
function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Character bodies the theme offers, as { bodyRef, animations }. Without an injected assetQuery this
// falls back to a generic humanoid with a basic clip set, so the author path still runs offline.
function bodiesFor(assetQuery, theme) {
  if (assetQuery) {
    const chars = assetQuery({ kind: "character", theme }) ?? [];
    const any = chars.length ? chars : assetQuery({ kind: "character" }) ?? [];
    const usable = any.filter((c) => Array.isArray(c.animations) && c.animations.length);
    if (usable.length) return usable.map((c) => ({ bodyRef: c.id, animations: c.animations }));
  }
  return [{ bodyRef: "kaykit.character.humanoid", animations: ["idle", "walk", "talk"] }];
}

function allowedModesFor(disposition, animations) {
  const clips = new Set(animations);
  const palette = MODES_BY_DISPOSITION[disposition] ?? MODES_BY_DISPOSITION.neutral;
  const modes = palette.filter((m) => clips.has(MODE_CLIP[m]));
  if (modes.length) return [...new Set(modes)];
  // The body cannot perform any palette mode: fall back to idle (every kit body idles), so the
  // NpcDef stays schema-valid and never claims an animation it lacks.
  return ["idle"];
}

function startModeFor(disposition, allowedModes) {
  const prefs = START_MODE_BY_DISPOSITION[disposition] ?? ["idle"];
  return prefs.find((m) => allowedModes.includes(m)) ?? allowedModes[0];
}

// Where one NPC stands. A cast must not pile up on one spot, and in a room the size of a city that
// spot could be inside a building, so the position is scattered over the floor and rejected if it
// lands in a `block` (a building mass standing on open ground).
//
// The scatter is an R2 low-discrepancy sequence: deterministic in the index (no clock, no random) and
// spread evenly rather than clumping the way a hash would.
const R2_X = 0.7548776662466927;
const R2_Y = 0.5698402909980532;
const EDGE = 1.5; // keep clear of the walls

const frac = (n) => n - Math.floor(n);

function insideBlock(blocks, x, z) {
  return (blocks ?? []).some((b) => {
    const [bx, , bz] = b.position;
    const [bw, , bd] = b.size;
    return Math.abs(x - bx) <= bw / 2 + EDGE && Math.abs(z - bz) <= bd / 2 + EDGE;
  });
}

const CLEAR_OF_PLAYER = 2.5; // metres: nobody is standing in your face when you walk in

// Is this spot far enough from where the player arrives? Standing on top of them fills the screen
// with a body and makes a small room unreadable.
function clearOfArrival(x, z, arrival) {
  if (!arrival) return true;
  return Math.hypot(x - arrival[0], z - arrival[2]) >= CLEAR_OF_PLAYER;
}

function spawnInRoom(room, index, arrival) {
  const p = room?.position;
  if (!Array.isArray(p)) return { position: [0, 0, 0], facing: 0 };
  const [w, , d] = room.size ?? [];
  if (!w || !d) return { position: [p[0], p[1], p[2]], facing: 0 };

  // People keep to the pavement. Where a room marks out walk zones, a cast is scattered over those
  // rather than over the whole floor, which on a street means nobody standing in the road.
  const walkable = (room.zones ?? []).filter((z) => z.kind === "sidewalk" || z.kind === "plaza");
  if (walkable.length) {
    const zone = walkable[index % walkable.length];
    const [zx, , zz] = zone.position;
    const [zw, zd] = zone.size;
    for (let k = 0; k < 32; k++) {
      const t = index * 32 + k + 1;
      const x = zx + (frac(t * R2_X) - 0.5) * zw;
      const z = zz + (frac(t * R2_Y) - 0.5) * zd;
      if (!insideBlock(room.blocks, x, z) && clearOfArrival(x, z, arrival)) {
        return { position: [x, p[1], z], facing: frac(t * R2_X) * Math.PI * 2 };
      }
    }
  }

  const spanX = Math.max(0, w - EDGE * 2);
  const spanZ = Math.max(0, d - EDGE * 2);
  for (let k = 0; k < 32; k++) {
    const t = index * 32 + k + 1;
    const x = p[0] + (frac(t * R2_X) - 0.5) * spanX;
    const z = p[2] + (frac(t * R2_Y) - 0.5) * spanZ;
    if (!insideBlock(room.blocks, x, z) && clearOfArrival(x, z, arrival)) {
      return { position: [x, p[1], z], facing: frac(t * R2_X) * Math.PI * 2 };
    }
  }
  // Every sample landed in a building: stand at the room's edge, which is street either way.
  return { position: [p[0] - spanX / 2, p[1], p[2] - spanZ / 2], facing: 0 };
}

// --- deterministic voice-design composer (ported from gamentic) -------------------------------------
// A voice identity is a natural-language descriptor picked from spaced pools by a hash of the character
// id, plus an exclude set so a cast sounds distinct. Cheap, portable, provider-agnostic; the actual
// TTS lives in the voice layer, which consumes this as data (schema: voice/voice-design.json).
const VOICE_POOLS = {
  gender: ["masculine", "feminine", "androgynous"],
  age: ["young", "adult", "middle-aged", "elderly"],
  pitch: ["low", "medium", "high"],
  pacing: ["slow", "measured", "brisk"],
  accent: ["neutral", "rustic", "refined", "gravelly", "lilting"],
  timbre: ["warm", "bright", "rough", "smooth"],
};

export function composeVoiceDesign(seedKey, opts = {}) {
  const exclude = opts.exclude instanceof Set ? opts.exclude : new Set(opts.exclude ?? []);
  const build = (salt) => {
    const h = hashString(`${seedKey}#${salt}`);
    const pick = (pool, shift) => pool[(h >>> shift) % pool.length];
    const d = {
      gender: pick(VOICE_POOLS.gender, 0),
      age: pick(VOICE_POOLS.age, 3),
      pitch: pick(VOICE_POOLS.pitch, 6),
      pacing: pick(VOICE_POOLS.pacing, 9),
      accent: pick(VOICE_POOLS.accent, 12),
      timbre: pick(VOICE_POOLS.timbre, 15),
    };
    d.description = `a ${d.age} ${d.gender} voice, ${d.pitch}-pitched and ${d.pacing}, ${d.timbre} with a ${d.accent} accent`;
    return d;
  };
  // Re-salt on collision so distinct characters sound distinct; after enough tries accept the last
  // pick (an enormous cast will eventually exhaust the descriptor space, which is fine).
  let design = build(0);
  for (let salt = 1; salt < 64 && exclude.has(design.description); salt++) design = build(salt);
  return design;
}

export function authorNpcs(instanceContext, rosterSpec, deps = {}) {
  const count = rosterSpec?.count ?? 0;
  const roles = rosterSpec?.roles ?? [];
  const rooms = instanceContext?.rooms ?? [];
  const bodies = bodiesFor(deps.assetQuery, instanceContext?.theme);
  const usedVoices = new Set();
  const out = [];
  for (let i = 0; i < count; i++) {
    const role = roles[i % Math.max(roles.length, 1)] ?? { role: "villager" };
    const disposition = role.disposition ?? "neutral";
    const body = bodies[i % bodies.length];
    const allowedModes = allowedModesFor(disposition, body.animations);
    const home = rooms.length ? rooms[i % rooms.length] : null;
    const id = `npc-${instanceContext?.id ?? "x"}-${i + 1}`;
    const voiceDesign = composeVoiceDesign(`${instanceContext?.id ?? "x"}:${id}`, { exclude: usedVoices });
    usedVoices.add(voiceDesign.description);
    out.push({
      id,
      name: `${role.role ?? "villager"}-${i + 1}`,
      persona: `A ${role.role ?? "villager"} in a ${instanceContext?.theme ?? "place"}.`,
      disposition,
      allowedModes,
      bodyRef: body.bodyRef,
      homeRoom: home?.id ?? "room-1",
      spawn: spawnInRoom(home, i, instanceContext?.spawn?.position),
      voiceDesign,
      traits: [],
      startMode: startModeFor(disposition, allowedModes),
    });
  }
  return out;
}

// --- play-time brain ---------------------------------------------------------------------------------

/**
 * Build the prompt a grammar-constrained text provider is called with. Pure and free of any provider
 * SDK: the server wraps a real GGUF around this (system+user text, plus interaction-result.json as the
 * GBNF grammar) and hands the raw completion back to sanitizeDecision. Kept here so the persona,
 * allowedModes and the live snapshot are always described consistently.
 * @returns {{ system: string, user: string }}
 */
export function buildInteractionPrompt(selfContext, interaction) {
  const { whoAmI, myBody, whereIAm, myState, allowedModes } = selfContext;
  const nearby = (whereIAm?.nearbyEntities ?? []).map((e) => `${e.id} (${e.kind})`).join(", ") || "no one";
  const system = [
    `You are ${whoAmI?.name}. ${whoAmI?.persona ?? ""}`.trim(),
    whoAmI?.goal ? `Your goal: ${whoAmI.goal}.` : "",
    `You may switch to exactly one of these modes: ${(allowedModes ?? []).join(", ")}.`,
    `Your body can perform: ${(myBody?.animations ?? []).join(", ") || "nothing special"}.`,
    `Reply as JSON matching InteractionResult: {"newMode": <one allowed mode>, "utterance"?: string, "target"?: <a nearby id or [x,y,z]>, "emote"?: string}.`,
  ]
    .filter(Boolean)
    .join("\n");
  const act =
    interaction?.type === "gesture"
      ? `The player makes a "${interaction.gesture}" gesture toward you.`
      : `The player says: "${interaction?.text ?? ""}".`;
  const user = [
    `You are currently ${myState?.mode} in ${whereIAm?.roomId ?? "an unknown place"}.`,
    `Nearby: ${nearby}.`,
    act,
    `Choose your next mode and, if you speak, your line.`,
  ].join("\n");
  return { system, user };
}

// The safe decision when the model is unavailable, slow, or off-contract: keep the current mode (or, if
// that is somehow not allowed, the first allowed one) and say nothing. Play never blocks on the model.
export function fallbackDecision(selfContext) {
  const allowed = selfContext?.allowedModes ?? [];
  const current = selfContext?.myState?.mode;
  const newMode = allowed.includes(current) ? current : allowed[0];
  return { newMode };
}

function targetResolves(target, selfContext) {
  if (Array.isArray(target)) {
    return target.length === 3 && target.every((n) => typeof n === "number" && Number.isFinite(n));
  }
  if (typeof target !== "string") return false;
  const w = selfContext?.whereIAm ?? {};
  if ((w.nearbyEntities ?? []).some((e) => e.id === target)) return true;
  if ((w.notableObjects ?? []).includes(target)) return true;
  if ((w.exits ?? []).includes(target)) return true;
  return false;
}

// A small local model can leak tool/markup syntax as prose; strip the obvious tells and trim (the
// turn-hardening lesson ported from gamentic). Emotion tags are left in for the voice layer to parse.
function scrubUtterance(s) {
  return String(s)
    .replace(/<\/?[a-z_][a-z0-9_]*>/gi, "")
    .replace(/\{\{[\s\S]*?\}\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Deterministically re-validate a raw brain decision against the live selfContext and coerce it to a
 * contract-valid InteractionResult, or return the safe fallback. This is the enforcement point: a
 * grammar can fail open (llama.cpp #19051), so nothing the model emits is trusted until it passes here.
 * - newMode MUST be in allowedModes, else the whole decision is rejected -> fallback.
 * - target is kept only if it references a real nearby entity / notable object / exit / world position;
 *   an unreal target is dropped (the mode + line still stand).
 * - utterance/emote/memoryDelta are scrubbed and kept when non-empty.
 */
export function sanitizeDecision(raw, selfContext) {
  let d = raw;
  if (typeof d === "string") {
    try {
      d = JSON.parse(d);
    } catch {
      return fallbackDecision(selfContext);
    }
  }
  if (!d || typeof d !== "object" || Array.isArray(d)) return fallbackDecision(selfContext);

  const allowed = new Set(selfContext?.allowedModes ?? []);
  if (!allowed.has(d.newMode)) return fallbackDecision(selfContext);

  const result = { newMode: d.newMode };
  if (typeof d.utterance === "string") {
    const u = scrubUtterance(d.utterance);
    if (u) result.utterance = u;
  }
  if (typeof d.emote === "string" && d.emote.trim()) result.emote = d.emote.trim();
  if (d.target != null && targetResolves(d.target, selfContext)) result.target = d.target;
  if (typeof d.memoryDelta === "string" && d.memoryDelta.trim()) result.memoryDelta = d.memoryDelta.trim();
  if (typeof d.flag === "string" && d.flag.trim()) result.flag = d.flag.trim();
  return result;
}

/**
 * Resolve one interaction to an InteractionResult. Synchronous: an injected `deps.brain(selfContext,
 * interaction)` must return the raw decision synchronously (a fake LLM in tests, or the deterministic
 * stand-in). Async model calls go through the server route, which awaits the provider and calls
 * sanitizeDecision directly. With no brain, the built-in deterministic stand-in runs (Phase 3 behavior,
 * unchanged): a chat/voice turn talks, an attack gesture flips to attack (or flee).
 */
export function resolveInteraction(selfContext, interaction, deps = {}) {
  if (deps.brain) {
    let raw = null;
    try {
      raw = deps.brain(selfContext, interaction);
    } catch {
      raw = null;
    }
    return sanitizeDecision(raw, selfContext);
  }

  const allowed = new Set(selfContext.allowedModes);
  // Clamp the current mode into allowedModes before using it as a seed/fallback: self-context.json
  // validates myState.mode only against the mode enum, never against THIS NPC's allowedModes, so a
  // forged or stale current must never leak out as the emitted newMode (the invariant the brain path's
  // fallbackDecision already enforces; the deterministic stand-in must match it).
  const current = allowed.has(selfContext.myState.mode) ? selfContext.myState.mode : selfContext.allowedModes[0];
  // choose `mode`, else `fallback`, else stay in the (clamped, always-allowed) current mode
  const pick = (mode, fallback) =>
    allowed.has(mode) ? mode : allowed.has(fallback) ? fallback : current;

  let newMode = current;
  let utterance;
  let emote;

  if (interaction.type === "gesture" && interaction.gesture === "attack") {
    newMode = pick("attack", "flee");
    emote = newMode === "attack" ? "snarl" : "recoil";
  } else if (interaction.type === "chat" || interaction.type === "voice") {
    newMode = pick("talk", current);
    utterance = `[${selfContext.whoAmI.name}] ${interaction.text ? `You said: ${interaction.text}` : "..."}`;
  }

  const result = { newMode };
  if (utterance) result.utterance = utterance;
  if (emote) result.emote = emote;
  if (newMode === "attack" || newMode === "follow") {
    const near = selfContext.whereIAm.nearbyEntities?.[0];
    if (near) result.target = near.id;
  }
  return result;
}
