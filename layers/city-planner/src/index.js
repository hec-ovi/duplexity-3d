// city-planner - build one outdoor street level.
//
// Isolation: imports no other layer's src. The asset query and the geometry validator arrive as
// injected handles.
//
// Pipeline: lay roads on an integer grid (grid.js) -> turn cells into rooms and neighbour pairs into
// full-wall openings -> hand out the free wall faces as front doors, plus one locked exit gate ->
// prove the result against the injected validator. Every choice is seeded, so a spec lays out the
// same way every time.

import { createRng, hashString } from "./rng.js";
import { FACES, SEGMENTS_BY_SIZE, freeFaces, layoutRoads } from "./grid.js";

const CELL = 12; // metres per street segment, square
const HEIGHT = 6; // facade height
const JOIN = [4, 4]; // opening between two segments [width, height]
const DOOR = [1.8, 2.6]; // front door
const GATE = [4, 4]; // the exit gate

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
    super("the generated street failed the geometry validator");
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

const roomId = (cell) => `st-${cell.gx}-${cell.gz}`;
const centreOf = (cell) => ({ x: cell.gx * CELL, z: cell.gz * CELL });

// Where a portal sits on one face of a cell: on the wall plane, centred on the face.
function faceOpening(cell, face, size) {
  const { x, z } = centreOf(cell);
  if (face.dx !== 0) {
    return { position: [x + (face.dx * CELL) / 2, 0, z], axis: "x", size };
  }
  return { position: [x, 0, z + (face.dz * CELL) / 2], axis: "z", size };
}

// How many floors this lot gets. A short `floorsPerLot` repeats its last value, so [3] means every
// building is three storeys and omitting it means every building is one.
function floorsFor(spec, index) {
  const list = spec.floorsPerLot ?? [];
  if (list.length === 0) return 1;
  return list[Math.min(index, list.length - 1)];
}

const PROGRAMS = ["house", "apartments", "office", "shop"];

/**
 * Build one street level and the briefs for the buildings on it.
 *
 * @param {object} spec       CitySpec (schema: city-spec.json)
 * @param {Function} assetQuery  injected asset-registry.query handle
 * @param {object} [opts]
 * @param {Function} [opts.validateInstance] injected scenario-creator.validateLayout
 * @param {number}  [opts.seed]
 * @returns {{ instance: object, lots: object[], report: object }}
 */
export function createStreets(spec, assetQuery, opts = {}) {
  const segments = SEGMENTS_BY_SIZE[spec.sizeHint ?? "medium"];
  if (!segments) throw new CitySpecInvalidError(`unknown sizeHint: ${spec.sizeHint}`);
  const rng = createRng(opts.seed ?? spec.seed ?? hashString(spec.id));
  const wantExit = spec.exit !== false;

  const { cells, joins, byKey } = layoutRoads(segments, segments >= 5 ? 2 : 1, rng);
  const floorKit = pickKit(assetQuery, "room-floor", spec.theme);
  const wallKit = pickKit(assetQuery, "wall", spec.theme);

  const rooms = cells.map((cell) => ({
    id: roomId(cell),
    position: [cell.gx * CELL, 0, cell.gz * CELL],
    size: [CELL, HEIGHT, CELL],
    floorKit,
    wallKit,
    objects: [],
    inventory: [],
  }));

  const portals = joins.map(({ a, b, face }) => ({
    id: `${spec.id}-join-${roomId(a)}-${roomId(b)}`,
    roomA: roomId(a),
    roomB: roomId(b),
    ...faceOpening(a, face, JOIN),
  }));

  // The gate goes on the far end of the avenue, which has no neighbour beyond it by construction.
  const lastAvenue = cells.filter((c) => c.kind === "avenue").at(-1);
  const gateFace = FACES.find((f) => f.name === "east");
  const gateId = `${spec.id}-gate`;
  const taken = new Set();
  if (wantExit) {
    taken.add(`${roomId(lastAvenue)}:east`);
    portals.push({
      id: gateId,
      roomA: roomId(lastAvenue),
      roomB: "EXIT",
      ...faceOpening(lastAvenue, gateFace, GATE),
      lock: { rule: "all_cleared" },
    });
  }

  // One door per free face, spread along the road rather than clustered at the first corner.
  const available = freeFaces(cells, byKey).filter(
    ({ cell, face }) => !taken.has(`${roomId(cell)}:${face.name}`)
  );
  const wanted = spec.lots ?? Math.max(1, Math.floor(segments / 2));
  if (wanted > available.length) {
    throw new CitySpecInvalidError(
      `${wanted} lots asked for, ${available.length} free wall faces on the road`
    );
  }
  const stride = Math.max(1, Math.floor(available.length / Math.max(1, wanted)));
  const offset = wanted > 0 ? rng.int(0, stride - 1) : 0;

  const lots = [];
  for (let i = 0; i < wanted; i++) {
    const { cell, face } = available[offset + i * stride];
    const lotId = `${spec.id}-b${i + 1}`;
    const floors = floorsFor(spec, i);
    const floorInstanceIds = Array.from({ length: floors }, (_, f) => `${lotId}-f${f + 1}`);
    const doorPortalId = `door-${lotId}`;
    portals.push({
      id: doorPortalId,
      roomA: roomId(cell),
      roomB: "LINK",
      ...faceOpening(cell, face, DOOR),
      link: { instanceId: floorInstanceIds[0], spawnRoomId: "entry", kind: "enter" },
    });
    lots.push({
      lotId,
      label: `${spec.label ?? spec.id} ${i + 1}`,
      theme: spec.theme,
      program: floors > 1 ? rng.pick(PROGRAMS.slice(1)) : "house",
      floors,
      floorInstanceIds,
      entryRoomId: "entry",
      returnInstanceId: spec.id,
      returnRoomId: roomId(cell),
      doorPortalId,
      footprint: { width: CELL - 2, depth: CELL - 2 },
    });
  }

  const spawnCell = cells[0];
  const instance = {
    id: spec.id,
    theme: spec.theme,
    rules: { mapKind: "street", label: spec.label ?? spec.id },
    rooms,
    portals,
    npcs: [],
    goal: wantExit ? { type: "reach_exit", portalId: gateId } : { type: "survive", seconds: 60 },
    // Facing east, down the avenue toward the gate: at yaw 0 the camera looks down -Z, so -PI/2
    // turns it to +X.
    spawn: { position: [spawnCell.gx * CELL, 0, spawnCell.gz * CELL], facing: -Math.PI / 2 },
  };

  const report = opts.validateInstance
    ? opts.validateInstance(instance)
    : { ok: true, checks: [{ name: "not_validated", ok: true }] };
  if (!report.ok) throw new LayoutInvalidError(report);

  return { instance, lots, report };
}
