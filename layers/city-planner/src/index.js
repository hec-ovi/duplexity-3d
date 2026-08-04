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
import { BLOCK, LATTICE_BY_SIZE, STREET, cells, doorOnFace, groundSize } from "./lattice.js";
import { planPremises } from "./premises.js";
import { placeLights } from "./lighting.js";
import { placeProps, transitLine } from "./street.js";
import { skylineFor } from "./skyline.js";
import { CitySpecInvalidError, LayoutInvalidError, NoAssetForKindError } from "./errors.js";

export { CitySpecInvalidError, LayoutInvalidError, NoAssetForKindError };

const SKY = 320; // how high the invisible limit reaches, metres: taller than anything built under it
const STOREY = 3.2; // a building's mass grows this much per floor it holds
const PARAPET = 1; // and carries this much past its top floor
const DOOR = [2, 3];
const STEP_OUT = 1.8; // how far in front of its own door the way out of a building leaves you
const GATE = [6, 4];
const GROUND_ROOM = "ground";

// Prefer the outdoor piece when the kit distinguishes one, but never require it: a theme with a
// single floor and wall still builds a street.
function pickKit(assetQuery, kind, theme) {
  const id =
    assetQuery?.({ kind, theme, tags: ["exterior"] })?.[0]?.id ??
    assetQuery?.({ kind, theme })?.[0]?.id;
  if (!id) throw new NoAssetForKindError(kind, theme);
  return id;
}

/**
 * Build one outdoor level and the briefs for the buildings on it.
 *
 * @param {object} spec       CitySpec (schema: city-spec.json)
 * @param {Function} assetQuery  injected asset-registry.query handle
 * @param {object} [opts]
 * @param {Function} [opts.validateInstance] injected scenario-creator.validateLayout
 * @param {Function} [opts.programFits] injected building-planner.programFits
 * @param {number}  [opts.seed]
 * @returns {{ instance: object, lots: object[], report: object }}
 */
export function createStreets(spec, assetQuery, opts = {}) {
  // `blocks` says exactly how many city blocks to build on; `sizeHint` is the shorthand for it.
  const lattice = LATTICE_BY_SIZE[spec.sizeHint ?? "medium"];
  if (!spec.blocks && !lattice) throw new CitySpecInvalidError(`unknown sizeHint: ${spec.sizeHint}`);
  const wanted = spec.blocks ?? lattice ** 2;
  const n = Math.ceil(Math.sqrt(wanted));
  const rng = createRng(opts.seed ?? spec.seed ?? hashString(spec.id));
  const wantExit = spec.exit !== false;

  const grid = cells(n).slice(0, wanted);
  const premises = planPremises(spec, grid, rng, opts.programFits);

  const floorKit = pickKit(assetQuery, "room-floor", spec.theme);
  const wallKit = pickKit(assetQuery, "wall", spec.theme);

  const extent = groundSize(n);
  const blocks = [];
  const zones = [];
  const portals = [];
  const lots = [];
  const doors = [];

  // The whole ground is roadway; each block lays its pavement over it, and the buildings stand on
  // that. So the streets are simply what no block covers.
  zones.push({ id: "road", kind: "road", position: [0, 0, 0], size: [extent, extent] });
  for (const index of [...new Set(premises.map((p) => p.block))].sort((a, b) => a - b)) {
    zones.push({
      id: `pavement-${index}`,
      kind: "sidewalk",
      position: [grid[index].center.x, 0, grid[index].center.z],
      size: [BLOCK, BLOCK],
    });
  }

  for (const p of premises) {
    const blockId = `mass-${p.id}`;
    blocks.push({
      id: blockId,
      position: [p.plot.center.x, 0, p.plot.center.z],
      size: [p.plot.size.w, Math.min(SKY - 4, p.storeys * STOREY + PARAPET), p.plot.size.d],
      assetRef: wallKit,
      label: p.label,
      floors: p.storeys, // rows of windows it stands: its height, not what you can walk into
      program: p.program,
    });
    if (!p.accessible) continue; // scenery: a mass with no way in, so nothing is built behind it

    const floorInstanceIds = Array.from({ length: p.floors }, (_, f) => `${p.id}-f${f + 1}`);
    const doorPortalId = `door-${p.id}`;
    const opening = doorOnFace(p.plot.center, p.plot.size, p.face, DOOR);
    portals.push({
      id: doorPortalId,
      roomA: GROUND_ROOM,
      roomB: "LINK",
      blockId, // the door is on the building's face; nothing is cut out of the ground
      ...opening,
      link: { instanceId: floorInstanceIds[0], spawnRoomId: "entry", kind: "enter" },
    });
    doors.push({ id: doorPortalId, blockId, position: opening.position, face: p.face });
    // Where the way out puts you: on the pavement in front of this door, looking away from it.
    const [ox, , oz] = opening.position;
    const returnAt = [ox + p.face.dx * STEP_OUT, 0, oz + p.face.dz * STEP_OUT];

    lots.push({
      lotId: p.id,
      label: p.label,
      theme: spec.theme,
      program: p.program,
      floors: p.floors,
      floorInstanceIds,
      entryRoomId: "entry",
      returnInstanceId: spec.id,
      returnRoomId: GROUND_ROOM,
      doorPortalId,
      returnAt,
      returnFacing: Math.atan2(-p.face.dx, -p.face.dz),
      footprint: p.footprint,
      ...(p.quest ? { quest: p.quest } : {}),
    });
  }

  // Beyond the streets you can walk: a ring of towers standing out of reach, so the city carries on
  // past the last block instead of ending at a line on the ground.
  const distant = skylineFor(extent, createRng(hashString(`${spec.id}-skyline`)));
  const onBlocks = new Set(premises.map((p) => p.block));
  // A city big enough that walking from one end to the other is a chore gets a shuttle down its
  // middle street.
  const line = transitLine(n);

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
    rules: {
      mapKind: "street",
      label: spec.label ?? spec.id,
      ...(spec.wet ? { wet: spec.wet } : {}), // how much standing water the renderer should show
    },
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
        zones,
        blocks,
        skyline: distant,
        lights: placeLights(grid, onBlocks, doors, createRng(hashString(`${spec.id}-lamps`))),
        props: placeProps(
          grid,
          onBlocks,
          doors.map((d) => [d.position[0], d.position[2]]),
          createRng(hashString(`${spec.id}-street`))
        ),
        ...(line ? { transit: line } : {}),
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
