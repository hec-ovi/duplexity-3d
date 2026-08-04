// city-planner - build one outdoor level.
//
// Isolation: imports no other layer's src. The asset query and the geometry validator arrive as
// injected handles.
//
// The outdoors is OPEN GROUND, not a set of rooms: one floor, a lattice of building masses standing
// on it, and the gaps between them are the streets. The only limit is the edge of the ground, which
// stops you without being a wall, so the city ends in empty space rather than in a corridor. What is
// inside a building is a separate instance, reached by walking up to its door.

import { createRng, hashString } from "./rng.js";
import { BLOCK, FACES, LATTICE_BY_SIZE, STREET, cells, chooseCells, doorOnFace, groundSize } from "./lattice.js";

const SKY = 60; // how high the invisible limit reaches, metres: taller than anything built under it
const STOREY = 3.2; // a building's mass grows this much per floor it holds
const DOOR = [2, 3];
const GATE = [6, 4];
const GROUND_ROOM = "ground";

export class CitySpecInvalidError extends Error {
  constructor(reason) {
    super(`city spec cannot be built: ${reason}`);
    this.code = "CITY_SPEC_INVALID";
  }
}

export class NoAssetForKindError extends Error {
  constructor(kind, theme) {
    super(`no asset registered for kind "${kind}" in theme "${theme}"`);
    this.code = "NO_ASSET_FOR_KIND";
  }
}

export class LayoutInvalidError extends Error {
  constructor(report) {
    super("the generated level failed the geometry validator");
    this.code = "LAYOUT_INVALID";
    this.report = report;
  }
}

// Prefer the outdoor piece when the kit distinguishes one, but never require it: a theme with a
// single floor and wall still builds a street.
function pickKit(assetQuery, kind, theme) {
  const id =
    assetQuery?.({ kind, theme, tags: ["exterior"] })?.[0]?.id ??
    assetQuery?.({ kind, theme })?.[0]?.id;
  if (!id) throw new NoAssetForKindError(kind, theme);
  return id;
}

// How many floors this lot gets. A short `floorsPerLot` repeats its last value, so [3] means every
// building is three storeys and omitting it means every building is one.
function floorsFor(spec, index) {
  const list = spec.floorsPerLot ?? [];
  if (list.length === 0) return 1;
  return list[Math.min(index, list.length - 1)];
}

const PROGRAMS = ["apartments", "office", "shop"];

/**
 * Build one outdoor level and the briefs for the buildings on it.
 *
 * @param {object} spec       CitySpec (schema: city-spec.json)
 * @param {Function} assetQuery  injected asset-registry.query handle
 * @param {object} [opts]
 * @param {Function} [opts.validateInstance] injected scenario-creator.validateLayout
 * @param {number}  [opts.seed]
 * @returns {{ instance: object, lots: object[], report: object }}
 */
export function createStreets(spec, assetQuery, opts = {}) {
  const n = LATTICE_BY_SIZE[spec.sizeHint ?? "medium"];
  if (!n) throw new CitySpecInvalidError(`unknown sizeHint: ${spec.sizeHint}`);
  const rng = createRng(opts.seed ?? spec.seed ?? hashString(spec.id));
  const wantExit = spec.exit !== false;

  const all = cells(n);
  const wanted = spec.lots ?? Math.max(1, Math.floor(all.length / 2));
  if (wanted > all.length) {
    throw new CitySpecInvalidError(`${wanted} buildings asked for, ${all.length} places to put them`);
  }

  const floorKit = pickKit(assetQuery, "room-floor", spec.theme);
  const wallKit = pickKit(assetQuery, "wall", spec.theme);

  const extent = groundSize(n);
  const chosen = chooseCells(all, wanted, rng);
  const blocks = [];
  const portals = [];
  const lots = [];

  for (let k = 0; k < chosen.length; k++) {
    const cell = chosen[k];
    const lotId = `${spec.id}-b${k + 1}`;
    const floors = floorsFor(spec, k);
    const height = Math.min(SKY - 2, floors * STOREY + 2);
    const blockId = `mass-${lotId}`;
    blocks.push({
      id: blockId,
      position: [cell.center.x, 0, cell.center.z],
      size: [BLOCK, height, BLOCK],
      assetRef: wallKit,
      label: `${spec.label ?? spec.id} ${k + 1}`,
    });

    const floorInstanceIds = Array.from({ length: floors }, (_, f) => `${lotId}-f${f + 1}`);
    const doorPortalId = `door-${lotId}`;
    portals.push({
      id: doorPortalId,
      roomA: GROUND_ROOM,
      roomB: "LINK",
      blockId, // the door is on the building's face; nothing is cut out of the ground
      ...doorOnFace(cell.center, rng.pick(FACES), DOOR),
      link: { instanceId: floorInstanceIds[0], spawnRoomId: "entry", kind: "enter" },
    });

    lots.push({
      lotId,
      label: `${spec.label ?? spec.id} ${k + 1}`,
      theme: spec.theme,
      program: floors > 1 ? rng.pick(PROGRAMS) : "house",
      floors,
      floorInstanceIds,
      entryRoomId: "entry",
      returnInstanceId: spec.id,
      returnRoomId: GROUND_ROOM,
      doorPortalId,
      footprint: { width: BLOCK - 2, depth: BLOCK - 2 },
    });
  }

  // The way out of the city: a gate in the eastern limit, shut until the map is cleared.
  const gateId = `${spec.id}-gate`;
  if (wantExit) {
    portals.push({
      id: gateId,
      roomA: GROUND_ROOM,
      roomB: "EXIT",
      position: [extent / 2, 0, 0],
      axis: "x",
      size: GATE,
      lock: { rule: "all_cleared" },
    });
  }

  const instance = {
    id: spec.id,
    theme: spec.theme,
    rules: { mapKind: "street", label: spec.label ?? spec.id },
    rooms: [
      {
        id: GROUND_ROOM,
        position: [0, 0, 0],
        size: [extent, SKY, extent],
        floorKit,
        wallKit,
        open: true, // the edge stops you; nothing is drawn there
        objects: [],
        inventory: [],
        blocks,
      },
    ],
    portals,
    npcs: [],
    goal: wantExit ? { type: "reach_exit", portalId: gateId } : { type: "survive", seconds: 60 },
    // Standing in the street at the western end, looking east down the length of the city.
    spawn: { position: [-extent / 2 + STREET / 2, 0, 0], facing: -Math.PI / 2 },
  };

  const report = opts.validateInstance
    ? opts.validateInstance(instance)
    : { ok: true, checks: [{ name: "not_validated", ok: true }] };
  if (!report.ok) throw new LayoutInvalidError(report);

  return { instance, lots, report };
}
