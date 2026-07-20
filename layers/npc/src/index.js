// npc - author NpcDefs (author-time) and resolve one interaction into a mode + dialogue (play-time).
// It imports no other layer's src.
//
// resolveInteraction is a deterministic stand-in for the play-time LLM. It honors every contract
// invariant: newMode is always within selfContext.allowedModes, and target references an entity
// that exists in the given context. The real grammar-constrained model drops in behind the same
// signature at Phase 6 without touching any caller.

export function authorNpcs(instanceContext, rosterSpec) {
  const count = rosterSpec?.count ?? 0;
  const roles = rosterSpec?.roles ?? [];
  const out = [];
  for (let i = 0; i < count; i++) {
    const role = roles[i % Math.max(roles.length, 1)] ?? { role: "villager" };
    out.push({
      id: `npc-${instanceContext?.id ?? "x"}-${i + 1}`,
      name: `${role.role ?? "villager"}-${i + 1}`,
      persona: `A ${role.role ?? "villager"} in a ${instanceContext?.theme ?? "place"}.`,
      disposition: role.disposition ?? "neutral",
      allowedModes: ["idle", "talk", "wander", "flee"],
      bodyRef: "kaykit.character.humanoid",
      homeRoom: instanceContext?.rooms?.[0]?.id ?? "room-1",
      spawn: { position: [0, 0, 0], facing: 0 },
      traits: [],
      startMode: "idle",
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
