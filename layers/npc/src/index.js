// npc - author NpcDefs (author-time) and resolve one interaction into a mode + dialogue (play-time).
// It imports no other layer's src.
//
// resolveInteraction is a deterministic stand-in for the play-time LLM. It honors every contract
// invariant: newMode is always within selfContext.allowedModes, and target references an entity
// that exists in the given context. The real grammar-constrained model drops in behind the same
// signature at Phase 6 without touching any caller.

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

// Spawn the NPC at (a small offset from) its home room's centre, so authored NPCs stand inside a
// real room rather than stacked at the world origin. Rooms without a position (unit-test stubs)
// fall back to the origin.
function spawnInRoom(room, index) {
  const p = room?.position;
  if (!Array.isArray(p)) return { position: [0, 0, 0], facing: 0 };
  const offset = ((index % 3) - 1) * 0.8;
  return { position: [p[0] + offset, p[1], p[2]], facing: 0 };
}

export function authorNpcs(instanceContext, rosterSpec, deps = {}) {
  const count = rosterSpec?.count ?? 0;
  const roles = rosterSpec?.roles ?? [];
  const rooms = instanceContext?.rooms ?? [];
  const bodies = bodiesFor(deps.assetQuery, instanceContext?.theme);
  const out = [];
  for (let i = 0; i < count; i++) {
    const role = roles[i % Math.max(roles.length, 1)] ?? { role: "villager" };
    const disposition = role.disposition ?? "neutral";
    const body = bodies[i % bodies.length];
    const allowedModes = allowedModesFor(disposition, body.animations);
    const home = rooms.length ? rooms[i % rooms.length] : null;
    out.push({
      id: `npc-${instanceContext?.id ?? "x"}-${i + 1}`,
      name: `${role.role ?? "villager"}-${i + 1}`,
      persona: `A ${role.role ?? "villager"} in a ${instanceContext?.theme ?? "place"}.`,
      disposition,
      allowedModes,
      bodyRef: body.bodyRef,
      homeRoom: home?.id ?? "room-1",
      spawn: spawnInRoom(home, i),
      traits: [],
      startMode: startModeFor(disposition, allowedModes),
    });
  }
  return out;
}

export function resolveInteraction(selfContext, interaction) {
  const allowed = new Set(selfContext.allowedModes);
  const current = selfContext.myState.mode;
  // choose `mode`, else `fallback`, else stay in the current mode (always allowed)
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
