// A city document, read back into the level the engine plays.

import { CityDocInvalidError } from "./errors.js";
import { FORMAT } from "./write.js";

const GROUND = "ground";
const LIMIT = 140;
const SURVIVE = 60; // a city with no gate is a place to be in, not a run to finish

const vec3 = (v) => [v[0], v[1], v[2]];

/**
 * Read a city document into one outdoor instance, plus the assets it wants registered.
 *
 * The cast, the goals and what is behind each door are the game, not the fabric: this returns a
 * street with nobody on it, and every door still saying where it leads.
 *
 * @param {object} doc CityDoc (schema: schema/city-doc.json)
 * @returns {{ instance: object, assets: object[] }}
 */
export function fromCityDoc(doc) {
  if (doc?.format !== FORMAT) {
    throw new CityDocInvalidError(`format is "${doc?.format ?? "missing"}", not ${FORMAT}`);
  }
  if (!doc.id || !Array.isArray(doc.ground?.size)) {
    throw new CityDocInvalidError("a city document needs an id and a ground size");
  }

  const roomId = doc.ground.id ?? GROUND;
  const wall = doc.ground.kit?.wall;
  const files = new Set((doc.assets ?? []).map((a) => a.id));
  const portals = [];

  const blocks = (doc.buildings ?? []).map((building) => {
    const ref = files.has(building.asset) ? building.asset : wall;
    if (building.door) {
      portals.push({
        id: building.door.id,
        roomA: roomId,
        roomB: "LINK",
        blockId: building.id,
        position: vec3(building.door.position),
        axis: building.door.axis,
        size: [building.door.size[0], building.door.size[1]],
        ...(building.door.leadsTo ? { link: linkOf(building.door.leadsTo) } : {}),
      });
    }
    return {
      id: building.id,
      position: vec3(building.position),
      size: vec3(building.size),
      ...(ref ? { assetRef: ref } : {}),
      ...(building.rotationY ? { rotationY: building.rotationY } : {}),
      ...(building.label ? { label: building.label } : {}),
      ...(building.floors ? { floors: building.floors } : {}),
      ...(building.program ? { program: building.program } : {}),
    };
  });

  if (doc.exit) {
    portals.push({
      id: doc.exit.id,
      roomA: roomId,
      roomB: "EXIT",
      position: vec3(doc.exit.position),
      axis: doc.exit.axis,
      size: [doc.exit.size[0], doc.exit.size[1]],
      ...(doc.exit.lock ? { lock: { rule: doc.exit.lock.rule } } : {}),
    });
  }

  const instance = {
    id: doc.id,
    theme: doc.theme ?? "city",
    rules: {
      mapKind: "street",
      label: doc.label ?? doc.id,
      ...(doc.ground.wet ? { wet: doc.ground.wet } : {}),
    },
    rooms: [
      {
        id: roomId,
        position: [0, doc.ground.y ?? 0, 0],
        size: [doc.ground.size[0], doc.ground.limit ?? LIMIT, doc.ground.size[1]],
        ...(doc.ground.kit?.floor ? { floorKit: doc.ground.kit.floor } : {}),
        ...(wall ? { wallKit: wall } : {}),
        open: true,
        objects: [],
        inventory: [],
        zones: (doc.surfaces ?? []).map((surface) => ({
          id: surface.id,
          kind: surface.kind,
          position: vec3(surface.position),
          size: [surface.size[0], surface.size[1]],
          ...(surface.asset ? { assetRef: surface.asset } : {}),
        })),
        blocks,
        skyline: (doc.skyline ?? []).map((far) => ({
          id: far.id,
          position: vec3(far.position),
          size: vec3(far.size),
          ...(far.floors ? { floors: far.floors } : {}),
        })),
        lights: (doc.lights ?? []).map((light) => ({
          id: light.id,
          kind: light.kind,
          position: vec3(light.position),
          ...(light.facing ? { facing: light.facing } : {}),
          ...(light.on ? { blockId: light.on } : {}),
        })),
      },
    ],
    portals,
    npcs: [],
    goal: doc.exit ? { type: "reach_exit", portalId: doc.exit.id } : { type: "survive", seconds: SURVIVE },
    spawn: {
      position: doc.spawn ? vec3(doc.spawn.position) : [0, doc.ground.y ?? 0, 0],
      facing: doc.spawn?.facing ?? 0,
    },
  };

  return { instance, assets: (doc.assets ?? []).map((asset) => entryOf(asset, doc.theme)) };
}

function linkOf(leadsTo) {
  return {
    ...(leadsTo.instance ? { instanceId: leadsTo.instance } : {}),
    ...(leadsTo.room ? { spawnRoomId: leadsTo.room } : {}),
    ...(leadsTo.at ? { spawnAt: vec3(leadsTo.at) } : {}),
    ...(leadsTo.facing !== undefined ? { facing: leadsTo.facing } : {}),
    ...(leadsTo.kind ? { kind: leadsTo.kind } : {}),
  };
}

/** A listed file, in the shape a catalog registers. */
function entryOf(asset, theme) {
  return {
    id: asset.id,
    kind: "building",
    tags: [],
    theme: theme ?? "city",
    size: vec3(asset.size),
    glbUrl: asset.file,
    ...(asset.anchor ? { anchor: vec3(asset.anchor) } : {}),
    ...(asset.doors ? { doors: asset.doors } : {}),
    ...(asset.doorFace ? { doorFace: asset.doorFace } : {}),
    ...(asset.floors ? { floors: asset.floors } : {}),
    license: asset.license,
    source: "generated",
  };
}
