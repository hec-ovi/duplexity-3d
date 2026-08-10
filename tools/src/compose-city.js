// tools - compose a whole city into one Adventure.
//
// This is a COMPOSITION ROOT (like app/ and server/): the one place allowed to hold several layers
// at once. It wires the street generator, the building generator, the geometry validator and the
// asset catalog together. Each layer still knows only its own contract; the wiring lives here.

import { createStreets } from "../../layers/city-planner/src/index.js";
import { createBuilding, programFits } from "../../layers/building-planner/src/index.js";
import { validateLayout } from "../../layers/scenario-creator/src/index.js";
import { createRegistry } from "../../layers/asset-registry/src/index.js";
import { buildWorldMap } from "../../layers/map-state/src/index.js";
import { authorNpcs } from "../../layers/npc/src/index.js";

// Who you meet where. The street is public and the floors behind the doors are not, so they get
// different casts.
const ROLES = {
  street: [
    { role: "passer-by", disposition: "neutral" },
    { role: "street vendor", disposition: "friendly" },
    { role: "lookout", disposition: "wary" },
  ],
  indoors: [
    { role: "resident", disposition: "neutral" },
    { role: "caretaker", disposition: "friendly" },
    { role: "guard", disposition: "hostile" },
  ],
};

// Populate one instance in place. `count` is per instance; 0 leaves it empty.
function populate(instance, count, assetQuery) {
  if (count <= 0) return instance;
  const roles = instance.rules.mapKind === "street" ? ROLES.street : ROLES.indoors;
  const npcs = authorNpcs(
    { id: instance.id, theme: instance.theme, rooms: instance.rooms, goal: instance.goal, spawn: instance.spawn },
    { count, roles },
    { assetQuery }
  );
  return { ...instance, npcs };
}

/**
 * Build a street, everything behind its doors, and the Adventure that holds them.
 *
 * @param {object} spec CitySpec (schema: layers/city-planner/schema/city-spec.json)
 * @param {object} [deps]
 * @param {Function} [deps.assetQuery]       defaults to the seed catalog
 * @param {Function} [deps.validateInstance] defaults to the real geometry validator
 * @param {string}   [deps.createdAt]        stamped into meta; pass one to keep a run reproducible
 * @returns {{ adventure: object, lots: object[], worldMap: object }}
 */
export function composeCity(spec, deps = {}) {
  const registry = deps.registry ?? createRegistry();
  const assetQuery = deps.assetQuery ?? ((q) => registry.query(q));
  const validateInstance = deps.validateInstance ?? validateLayout;

  const cast = spec.npcs ?? 2;
  // The street asks the building side what fits before it hands out a brief, so a small premises is
  // never given a room mix that cannot be laid out in it.
  const { instance: street, lots } = createStreets(spec, assetQuery, {
    validateInstance,
    programFits,
    // How a pinned `asset` is resolved: a whole building in one GLB stands at its own size.
    assetFor: (id) => registry.get(id),
  });
  const instances = [populate(street, cast, assetQuery)];
  for (const lot of lots) {
    const { instances: floors } = createBuilding(lot, assetQuery, { validateInstance });
    instances.push(...floors.map((floor) => populate(floor, cast, assetQuery)));
  }

  const adventure = {
    meta: {
      id: `adv-${spec.id}`,
      title: spec.label ?? spec.id,
      createdAt: deps.createdAt ?? "1970-01-01T00:00:00.000Z",
      contractVersion: "1.0.0",
      seed: spec.seed ?? 0,
    },
    creativeBrief: {
      universes: [spec.theme],
      likedNpcs: [],
      tone: "neutral",
      difficulty: "normal",
      themes: [spec.theme],
      freeText: `a ${spec.sizeHint ?? "medium"} street with ${lots.length} way(s) in`,
      ...(spec.seed === undefined ? {} : { seed: spec.seed }),
    },
    progression: {
      nodes: instances.map((i) => i.id),
      edges: [],
      start: street.id,
    },
    instances,
    history: [],
  };

  // Deriving the map here proves the level hangs together: every door leads to an instance that
  // exists, no portal id is used twice, and the gate has something to count.
  return { adventure, lots, worldMap: buildWorldMap(adventure) };
}
