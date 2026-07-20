// narrator - plan and assemble an Adventure (author-time), and read the progression graph plus
// init instance state (play-time). It imports no other layer's src: scenario-creator, npc, and
// persistence are all passed in through `deps` and called only through their contracts.
//
// Author-time is a two-step, validated-mutation pipeline:
//   1. plan: a graph/LLM stand-in emits an AdventurePlan (meta + one InstanceSpec per instance +
//      a progression DAG). The default planner is deterministic; a real author-time model drops in
//      behind the same `deps.plan` seam later. The plan is structurally validated before it is realised.
//   2. realise: one scenario-creator call per instance builds a valid layout, one npc.authorNpcs
//      call per roster fills it, and the pieces assemble into a schema-valid Adventure.

export class PlanInvalidError extends Error {
  constructor(detail) {
    super(`adventure plan failed validation: ${detail ?? ""}`.trim());
    this.code = "PLAN_INVALID";
  }
}
export class ProgressionDeadendError extends Error {
  constructor(report) {
    super("progression graph is not a valid DAG (unreachable node or no terminal)");
    this.code = "PROGRESSION_DEADEND";
    this.report = report;
  }
}
export class InstanceBuildFailedError extends Error {
  constructor(instanceId, cause) {
    super(`could not build instance ${instanceId}${cause ? `: ${cause.message}` : ""}`);
    this.code = "INSTANCE_BUILD_FAILED";
    this.instanceId = instanceId;
    if (cause) this.cause = cause;
  }
}

// FNV-1a: a stable integer seed from the brief, so the same brief plans the same adventure without
// a wall clock or Math.random.
function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const ROOM_COUNT_BY_DIFFICULTY = { easy: 2, normal: 3, hard: 4 };

function sanitizeRole(text) {
  const slug = String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "wanderer";
}

function dispositionFor(role) {
  const r = String(role ?? "").toLowerCase();
  if (/(enemy|skeleton|beast|bandit|monster|wraith)/.test(r)) return "hostile";
  if (/(guard|warden|sentry|knight)/.test(r)) return "wary";
  if (/(friend|ally|smith|merchant|healer|villager)/.test(r)) return "friendly";
  return "neutral";
}

// Pick a theme the asset-registry can actually build (a floor AND a wall kit exist for it),
// preferring one that matches the brief. This is why a "cyberpunk" brief still lays out cleanly
// against a dungeon-only kit set instead of failing with NO_ASSET_FOR_KIND downstream.
export function resolveTheme(brief, assetQuery) {
  const desired = String(brief?.themes?.[0] ?? brief?.universes?.[0] ?? "").toLowerCase();
  if (assetQuery) {
    const floors = assetQuery({ kind: "room-floor" }) ?? [];
    const wallThemes = new Set((assetQuery({ kind: "wall" }) ?? []).map((w) => w.theme));
    const buildable = [...new Set(floors.map((f) => f.theme))].filter((t) => wallThemes.has(t));
    if (buildable.length) {
      const match = buildable.find((t) => desired && (t.includes(desired) || desired.includes(t)));
      return match ?? buildable[0];
    }
  }
  return desired || "dungeon";
}

function rosterHints(index, brief) {
  const roster = [{ role: "guard", count: 1 }];
  const liked = brief?.likedNpcs ?? [];
  if (liked.length) roster.push({ role: sanitizeRole(liked[index % liked.length]), count: 1 });
  return roster;
}

/**
 * The default deterministic planner (the LLM/graph stand-in). Emits an AdventurePlan: meta, one
 * InstanceSpec per instance, and a linear progression DAG (each instance's goal unlocks the next).
 * @returns {{ meta: object, instances: object[], progression: object }}
 */
export function planAdventure(brief, ctx = {}) {
  const seed = Number.isInteger(ctx.seed)
    ? ctx.seed
    : Number.isInteger(brief?.seed)
      ? brief.seed
      : hashString(JSON.stringify(brief ?? {}));
  const theme = resolveTheme(brief, ctx.assetQuery);
  const difficulty = brief?.difficulty ?? "normal";
  const count = ROOM_COUNT_BY_DIFFICULTY[difficulty] ?? 3;
  const title = brief?.universes?.[0] ? `Adventure: ${brief.universes[0]}` : "New Adventure";
  const createdAt = (ctx.clock?.() ?? new Date()).toISOString();

  const instances = [];
  for (let i = 0; i < count; i++) {
    const id = `inst-${String(i + 1).padStart(3, "0")}`;
    const last = i === count - 1;
    instances.push({
      id,
      theme,
      sizeHint: i === 0 ? "small" : i % 2 ? "medium" : "small",
      mood: brief?.tone ?? "adventurous",
      goalSpec: last
        ? { type: "reach_exit", hint: "leave through the far door" }
        : { type: "discover_item", hint: "find the way onward" },
      npcRoster: rosterHints(i, brief),
      connectionHints: { loops: i % 2 === 1 },
    });
  }

  const nodes = instances.map((x) => x.id);
  const edges = [];
  for (let i = 1; i < nodes.length; i++) {
    edges.push({ from: nodes[i - 1], to: nodes[i], unlock: { instanceId: nodes[i - 1] } });
  }

  return {
    meta: { id: `adv-${seed}`, title, createdAt, contractVersion: "1.0.0", seed },
    instances,
    progression: { nodes, edges, start: nodes[0] },
  };
}

// A light structural guard on a plan before it is realised (the src stays free of ajv; the
// adventure-plan JSON Schema proves the same shape in the tests). Rejects a plan whose instances and
// progression do not line up, so a malformed injected planner is caught, not solved into a broken
// Adventure.
export function isValidPlan(plan) {
  if (!plan || typeof plan.meta?.id !== "string") return false;
  if (!Array.isArray(plan.instances) || plan.instances.length < 1) return false;
  const ids = new Set();
  for (const s of plan.instances) {
    if (!s || typeof s.id !== "string" || ids.has(s.id)) return false;
    if (typeof s.theme !== "string" || !s.goalSpec?.type) return false;
    ids.add(s.id);
  }
  const prog = plan.progression;
  if (!prog || !Array.isArray(prog.nodes) || typeof prog.start !== "string") return false;
  // progression.nodes must be a BIJECTION with the instance ids: unique, and exactly the instance-id
  // set. A mere count-plus-subset check lets a duplicate node (e.g. ['a','a'] over instances a,b)
  // hide a missing instance, orphaning a built-and-embedded one in a still-schema-valid Adventure.
  const nodeSet = new Set(prog.nodes);
  if (nodeSet.size !== prog.nodes.length) return false;
  if (nodeSet.size !== ids.size) return false;
  for (const id of ids) if (!nodeSet.has(id)) return false;
  return ids.has(prog.start);
}

// Translate an InstanceSpec's loose npcRoster hints into the npc layer's RosterSpec.
function rosterFromSpec(spec) {
  const hints = spec.npcRoster ?? [];
  const roles = hints.length
    ? hints.map((h) => ({ role: h.role, disposition: dispositionFor(h.role), count: h.count ?? 1 }))
    : [{ role: "wanderer", disposition: "neutral", count: 1 }];
  const count = roles.reduce((n, r) => n + (r.count ?? 1), 0);
  return { count, roles };
}

/**
 * Plan and assemble a full Adventure from a creativeBrief (the `POST /adventure` body). Delegates
 * geometry to scenario-creator and NPCs to npc, both through their contracts (never their src).
 * @param {object} creativeBrief
 * @param {object} deps { scenarioCreator, npc, persistence, assetQuery, graphGen?, plan?, clock?, seed? }
 * @returns {object} the assembled, schema-valid Adventure
 */
export function composeAdventure(creativeBrief, deps = {}) {
  const { scenarioCreator, npc, persistence, assetQuery, graphGen, clock, seed } = deps;
  const planner = deps.plan ?? planAdventure;

  const plan = planner(creativeBrief, { assetQuery, clock, seed });
  if (!isValidPlan(plan)) throw new PlanInvalidError("plan structure or instance/progression mismatch");
  const progressionReport = validateProgression(plan.progression);
  if (!progressionReport.ok) throw new ProgressionDeadendError(progressionReport);

  const instances = [];
  plan.instances.forEach((spec, i) => {
    let built;
    try {
      built = scenarioCreator.createInstance(spec, assetQuery, {
        graphGen,
        seed: (plan.meta.seed ?? 0) + i,
      });
    } catch (cause) {
      throw new InstanceBuildFailedError(spec.id, cause);
    }
    const instance = built?.instance;
    if (!instance) throw new InstanceBuildFailedError(spec.id);

    const npcs = npc.authorNpcs(
      { id: spec.id, theme: instance.theme, rooms: instance.rooms, goal: instance.goal },
      rosterFromSpec(spec),
      { assetQuery },
    );
    // The spec id is authoritative (it keys the progression), so stamp it onto the built instance
    // even if a delegated builder returned its own id.
    instances.push({ ...instance, id: spec.id, npcs });
  });

  const adventure = {
    meta: plan.meta,
    creativeBrief,
    progression: plan.progression,
    instances,
    history: [],
  };

  persistence?.save?.(adventure);
  return adventure;
}

export function initInstance(adventure, instanceId) {
  const instance = adventure.instances.find((i) => i.id === instanceId);
  if (!instance) throw new InstanceBuildFailedError(instanceId);
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
export function validateProgression(progression) {
  const { nodes, edges = [], start } = progression;
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
