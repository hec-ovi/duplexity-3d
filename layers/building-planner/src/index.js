// building-planner - build the floors behind one front door.
//
// Isolation: imports no other layer's src. The asset query and the geometry validator arrive as
// injected handles; the LotPlan arrives as data.
//
// Each floor is laid out on its own, in its own coordinate space. The only things shared with the
// street are the ids in the LotPlan, so a building can be rebuilt, resized or replaced and the street
// outside never notices.

import { FACES, faceOpening, isOuter, partition } from "./floor.js";

const HEIGHT = 3.1; // storey height, metres
const DOOR = [1.4, 2.4]; // interior door
const WAY_OUT = [1.6, 2.4]; // the street door
const STAIRS = [1.2, 2.4];
const MIN_ROOM = 3.4; // a room narrower than this is a corridor, not a room
const TALL = 4; // storeys from which a building has a lift instead of a staircase

// What a floor is FOR, room by room. The grid is filled left to right, near to far, and the first
// cell is where you come in, so a name lands on the same room every time. A floor plan you can read
// is the point: a kitchen is a kitchen, not r-1-0.
const PROGRAMS = {
  house: { cols: 2, rows: 2, rooms: ["hall", "living room", "kitchen", "bathroom"] },
  apartments: { cols: 2, rows: 2, rooms: ["landing", "living room", "kitchen", "bedroom"] },
  shop: { cols: 2, rows: 1, rooms: ["shop floor", "back room"] },
  office: { cols: 3, rows: 2, rooms: ["reception", "office", "office", "meeting room", "kitchen", "store"] },
};

export class LotPlanInvalidError extends Error {
  constructor(reason) {
    super(`lot plan cannot be built: ${reason}`);
    this.code = "LOT_PLAN_INVALID";
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
    super("a generated floor failed the geometry validator");
    this.code = "LAYOUT_INVALID";
    this.report = report;
  }
}

/**
 * Can this program be laid out inside this footprint? The street asks before it hands out a brief,
 * so the answer lives here, next to the room mixes it depends on, and is never written twice.
 *
 * @param {string} program
 * @param {{width:number, depth:number}} footprint metres
 */
export function programFits(program, footprint) {
  const { cols, rows } = PROGRAMS[program] ?? PROGRAMS.house;
  return footprint.width / cols >= MIN_ROOM && footprint.depth / rows >= MIN_ROOM;
}

// Prefer the indoor piece when the kit distinguishes one, but never require it: a theme with a
// single floor and wall still builds a floor.
function pickKit(assetQuery, kind, theme) {
  const id =
    assetQuery?.({ kind, theme, tags: ["interior"] })?.[0]?.id ??
    assetQuery?.({ kind, theme })?.[0]?.id;
  if (!id) throw new NoAssetForKindError(kind, theme);
  return id;
}

const roomIdFor = (cell, arrivalId) =>
  cell.cx === 0 && cell.cz === 0 ? arrivalId : `r-${cell.cx}-${cell.cz}`;

/**
 * Build every floor of one lot.
 *
 * @param {object} lot        LotPlan (schema owned by city-planner)
 * @param {Function} assetQuery injected asset-registry.query handle
 * @param {object} [opts]
 * @param {Function} [opts.validateInstance] injected scenario-creator.validateLayout
 * @param {Function} [opts.goalFor] (floorIndex, instanceId) -> Goal
 * @returns {{ instances: object[], report: object }}
 */
export function createBuilding(lot, assetQuery, opts = {}) {
  const floors = lot.floors ?? lot.floorInstanceIds?.length ?? 0;
  if (!floors || floors < 1) throw new LotPlanInvalidError("no floors");
  if (!Array.isArray(lot.floorInstanceIds) || lot.floorInstanceIds.length < floors) {
    throw new LotPlanInvalidError("floorInstanceIds does not name every floor");
  }
  const plan = PROGRAMS[lot.program] ?? PROGRAMS.house;
  if (!programFits(lot.program, lot.footprint)) {
    throw new LotPlanInvalidError(`footprint too small for a ${lot.program} floor`);
  }

  const floorKit = pickKit(assetQuery, "room-floor", lot.theme);
  const wallKit = pickKit(assetQuery, "wall", lot.theme);
  const quest = questFloor(lot, floors);

  const instances = [];
  const checks = [];
  for (let f = 0; f < floors; f++) {
    const instance = buildFloor({ lot, floors, floorIndex: f, plan, floorKit, wallKit, quest, opts });
    const report = opts.validateInstance
      ? opts.validateInstance(instance)
      : { ok: true, checks: [{ name: "not_validated", ok: true }] };
    if (!report.ok) throw new LayoutInvalidError(report);
    checks.push(...report.checks.map((c) => ({ ...c, name: `${instance.id}:${c.name}` })));
    instances.push(instance);
  }
  return { instances, report: { ok: true, checks } };
}

// Where the run's objective sits, if this lot was given one: a named item on a chosen floor,
// the top one by default. Every other floor keeps its own anonymous token.
function questFloor(lot, floors) {
  if (!lot.quest) return null;
  const floor = lot.quest.floor ?? floors;
  if (floor > floors) throw new LotPlanInvalidError(`quest on floor ${floor} of a ${floors}-floor building`);
  return { index: floor - 1, itemId: lot.quest.itemId };
}

function buildFloor({ lot, floors, floorIndex, plan, floorKit, wallKit, quest, opts }) {
  const { cols, rows, rooms: names } = plan;
  const id = lot.floorInstanceIds[floorIndex];
  const isGround = floorIndex === 0;
  // Every floor is partitioned the same way, so the stairwell sits in the same corner all the way up
  // and the floors read as one building when you look at their blueprints.
  const arrivalName = (index) => (index === 0 ? lot.entryRoomId : "hall");
  const arrivalId = arrivalName(floorIndex);
  const { cells, joins, at } = partition(lot.footprint, cols, rows, HEIGHT);
  const arrival = cells[0]; // (0,0): where the front door leaves you, and the floor's own spawn
  const stairwell = cells.at(-1); // the far corner: the top and bottom of every flight of stairs
  const stairRoomOn = (index) => roomIdFor(stairwell, arrivalName(index));
  // Past a few storeys a building has a lift, not a staircase. It works the same way (a door to the
  // floor above or below); it is named so the sign over it and the map icon can say so.
  const vertical = floors >= TALL ? "elevator" : "stairs";

  // A room lights itself: there is no street outside it. One lamp overhead, in the middle.
  const rooms = cells.map((cell, index) => ({
    id: roomIdFor(cell, arrivalId),
    name: names[index] ?? names.at(-1),
    position: [cell.centre.x, 0, cell.centre.z],
    size: [cell.size.w, cell.size.h, cell.size.d],
    floorKit,
    wallKit,
    objects: [],
    inventory: [],
    lights: [
      { id: `${id}-lamp-${cell.cx}-${cell.cz}`, kind: "ceiling", position: [cell.centre.x, 0, cell.centre.z] },
    ],
  }));

  const portals = joins.map(({ a, b, face }) => ({
    id: `${id}-door-${a.cx}${a.cz}-${b.cx}${b.cz}`,
    roomA: roomIdFor(a, arrivalId),
    roomB: roomIdFor(b, arrivalId),
    ...faceOpening(a, face, DOOR),
  }));

  // Doors that leave the floor. Each takes an outer face of its own, so no two ever share a wall.
  if (isGround) {
    // With a street to go back to, the front door links to it; standing on its own, the same door is
    // simply the way out of the level.
    const goesBack = Boolean(lot.returnInstanceId);
    portals.push({
      id: `${id}-out`,
      roomA: roomIdFor(arrival, arrivalId),
      roomB: goesBack ? "LINK" : "EXIT",
      ...faceOpening(arrival, outerFace(at, arrival, ["south", "west"]), WAY_OUT),
      ...(goesBack
        ? {
            link: {
              instanceId: lot.returnInstanceId,
              spawnRoomId: lot.returnRoomId,
              // Out through the front, onto the pavement in front of this building, looking away
              // from it. Without the exact spot you land in the middle of whatever room you named.
              ...(lot.returnAt ? { spawnAt: lot.returnAt } : {}),
              ...(lot.returnFacing === undefined ? {} : { facing: lot.returnFacing }),
              kind: "leave",
            },
          }
        : {}),
    });
  } else {
    portals.push({
      id: `${id}-down`,
      roomA: roomIdFor(stairwell, arrivalId),
      roomB: "LINK",
      ...faceOpening(stairwell, outerFace(at, stairwell, ["east", "south"]), STAIRS),
      link: {
        instanceId: lot.floorInstanceIds[floorIndex - 1],
        spawnRoomId: stairRoomOn(floorIndex - 1),
        kind: `${vertical}_down`,
      },
    });
  }
  const above = lot.floorInstanceIds[floorIndex + 1];
  if (floorIndex + 1 < floors && above) {
    portals.push({
      id: `${id}-up`,
      roomA: roomIdFor(stairwell, arrivalId),
      roomB: "LINK",
      ...faceOpening(stairwell, outerFace(at, stairwell, ["north", "east"]), STAIRS),
      link: { instanceId: above, spawnRoomId: stairRoomOn(floorIndex + 1), kind: `${vertical}_up` },
    });
  }

  // The floor's own win condition: one thing to find, in the room furthest from the arrival. The
  // caller can name a different goal per floor, and then it owns whether that goal is satisfiable.
  const pinned = opts.goalFor?.(floorIndex, id);
  const prize = quest?.index === floorIndex ? quest.itemId : `${id}-token`;
  const goal = pinned ?? { type: "discover_item", itemId: prize };
  if (!pinned) {
    const room = rooms.find((r) => r.id === roomIdFor(stairwell, arrivalId));
    room.inventory.push({
      itemId: prize,
      assetRef: floorKit,
      position: [stairwell.centre.x, 0.5, stairwell.centre.z],
    });
  }

  return {
    id,
    theme: lot.theme,
    rules: {
      mapKind: floors === 1 ? "house" : "floor",
      label: floors === 1 ? lot.label : `${lot.label}, floor ${floorIndex + 1}`,
      floor: floorIndex + 1,
    },
    rooms,
    portals,
    npcs: [],
    goal,
    spawn: { position: [arrival.centre.x, 0, arrival.centre.z], facing: 0 },
  };
}

// The first of the preferred faces with nothing behind it. A grid cell on the perimeter always has
// one; the corner rooms these are asked for always do.
function outerFace(at, cell, preferred) {
  for (const name of preferred) {
    if (isOuter(at, cell, FACES[name])) return FACES[name];
  }
  for (const name of Object.keys(FACES)) {
    if (isOuter(at, cell, FACES[name])) return FACES[name];
  }
  throw new LotPlanInvalidError(`room ${cell.cx},${cell.cz} has no outer wall for a door`);
}
