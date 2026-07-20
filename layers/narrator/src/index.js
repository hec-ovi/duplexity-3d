// narrator - plan and assemble an Adventure (author-time), and read the progression graph plus
// init instance state (play-time). It imports no other layer's src: scenario-creator, npc, and
// persistence are all passed in through `deps` and called only through their contracts.

export function composeAdventure(creativeBrief, deps = {}) {
  const { scenarioCreator, npc, persistence, assetQuery, clock } = deps;
  const instanceId = "inst-001";

  const spec = {
    id: instanceId,
    theme: creativeBrief?.themes?.[0] ?? "dungeon",
    sizeHint: "small",
    goalSpec: { type: "discover_item", hint: "find the goal item" },
    npcRoster: [{ role: "guard" }],
  };

  const { instance } = scenarioCreator.createInstance(spec, assetQuery);

  const rosterSpec = {
    count: Math.max(1, creativeBrief?.likedNpcs?.length ?? 1),
    roles: [{ role: "guard", disposition: "neutral" }],
  };
  const npcs = npc.authorNpcs(
    { id: instance.id, theme: instance.theme, rooms: instance.rooms },
    rosterSpec,
  );

  const adventure = {
    meta: {
      id: "adv-composed",
      title: creativeBrief?.universes?.[0]
        ? `Adventure: ${creativeBrief.universes[0]}`
        : "New Adventure",
      createdAt: (clock?.() ?? new Date()).toISOString(),
      contractVersion: "1.0.0",
    },
    creativeBrief,
    progression: { nodes: [instanceId], edges: [], start: instanceId },
    instances: [{ ...instance, npcs }],
    history: [],
  };
  if (creativeBrief?.seed != null) adventure.meta.seed = creativeBrief.seed;

  persistence?.save?.(adventure);
  return adventure;
}

export function initInstance(adventure, instanceId) {
  const instance = adventure.instances.find((i) => i.id === instanceId);
  if (!instance) {
    throw Object.assign(new Error(`cannot init unknown instance: ${instanceId}`), {
      code: "INSTANCE_BUILD_FAILED",
    });
  }
  return {
    instanceId,
    npcStates: instance.npcs.map((n) => ({ npcId: n.id, mode: n.startMode, memory: [] })),
    flags: {},
    spawn: instance.spawn,
  };
}

export function recordInteraction(adventureId, record, deps = {}) {
  deps.persistence?.appendHistory?.(adventureId, record);
  return { adventureId, record }; // history.appended event payload
}

// Pure graph read: no LLM ever advances a stage.
export function nextInstance(adventure, currentInstanceId, goalResult) {
  if (!goalResult?.goalMet) return { instanceId: currentInstanceId };
  const edge = adventure.progression.edges.find((e) => e.from === currentInstanceId);
  return edge ? { instanceId: edge.to } : { done: true };
}

// Helper the tests use to assert the DAG invariant (one start, at least one terminal).
export function progressionShape(progression) {
  const hasOutgoing = new Set(progression.edges.map((e) => e.from));
  const terminals = progression.nodes.filter((n) => !hasOutgoing.has(n));
  return { startInNodes: progression.nodes.includes(progression.start), terminals };
}

// Detects the PROGRESSION_DEADEND planning bug: a node unreachable from start, or no terminal at
// all. A valid progression has one start in nodes, every node reachable from it, and >= 1 terminal.
// The real planner rejects any plan where this returns ok:false (contract error PROGRESSION_DEADEND).
export function validateProgression(progression) {
  const { nodes, edges, start } = progression;
  const adjacency = new Map(nodes.map((n) => [n, []]));
  for (const e of edges) if (adjacency.has(e.from)) adjacency.get(e.from).push(e.to);

  const reached = new Set();
  const stack = nodes.includes(start) ? [start] : [];
  while (stack.length) {
    const n = stack.pop();
    if (reached.has(n)) continue;
    reached.add(n);
    for (const to of adjacency.get(n) ?? []) stack.push(to);
  }

  const unreachable = nodes.filter((n) => !reached.has(n));
  const hasOutgoing = new Set(edges.map((e) => e.from));
  const terminals = nodes.filter((n) => !hasOutgoing.has(n));
  return {
    ok: nodes.includes(start) && unreachable.length === 0 && terminals.length >= 1,
    unreachable,
    terminals,
  };
}
