// One street level, written out as assets and coordinates.

import { CityDocInvalidError, NotAStreetError } from "./errors.js";

export const FORMAT = "duplexity-city/1";
const LIMIT = 140; // how high the edge of the level stops you, when the level does not say

const vec3 = (v) => [v[0], v[1], v[2]];

/**
 * Turn one outdoor instance into a portable city document.
 *
 * @param {object} instance a persistence Instance holding one `open` room
 * @param {object} [deps]
 * @param {Function} [deps.assetFor] injected asset-registry.get, for the files buildings name
 * @param {Function} [deps.fileFor] where an asset's file sits relative to this document; by default
 *   the asset's own `glbUrl`
 * @returns {object} CityDoc (schema: schema/city-doc.json)
 */
export function toCityDoc(instance, deps = {}) {
  const ground = (instance.rooms ?? []).find((room) => room.open);
  if (!ground) throw new NotAStreetError(instance?.id ?? "this level");

  const fileFor = deps.fileFor ?? ((entry) => entry.glbUrl);
  const portals = instance.portals ?? [];
  const doorFor = new Map(portals.filter((p) => p.blockId).map((p) => [p.blockId, p]));
  const gate = portals.find((p) => p.roomB === "EXIT");

  // Which masses are files, and which are ours to draw. A plain mass names the kit it is faced with,
  // which is not a building and never ships as one.
  const files = filesUsed(ground.blocks ?? [], deps.assetFor, fileFor);

  const buildings = (ground.blocks ?? []).map((mass) => {
    const door = doorFor.get(mass.id);
    return {
      id: mass.id,
      ...(mass.label ? { label: mass.label } : {}),
      position: vec3(mass.position),
      size: vec3(mass.size),
      ...(mass.rotationY ? { rotationY: mass.rotationY } : {}),
      ...(files.has(mass.assetRef) ? { asset: mass.assetRef } : {}),
      ...(mass.floors ? { floors: mass.floors } : {}),
      ...(mass.program ? { program: mass.program } : {}),
      ...(door
        ? {
            door: {
              id: door.id,
              position: vec3(door.position),
              axis: door.axis,
              size: [door.size[0], door.size[1]],
              ...(door.link ? { leadsTo: leadsTo(door.link) } : {}),
            },
          }
        : {}),
    };
  });

  return {
    format: FORMAT,
    id: instance.id,
    ...(instance.rules?.label ? { label: instance.rules.label } : {}),
    ...(instance.theme ? { theme: instance.theme } : {}),
    units: "metres",
    up: "Y",
    ground: {
      id: ground.id,
      size: [ground.size[0], ground.size[2]],
      ...(ground.position[1] ? { y: ground.position[1] } : {}),
      limit: ground.size[1] ?? LIMIT,
      ...(instance.rules?.wet ? { wet: instance.rules.wet } : {}),
      ...(ground.floorKit || ground.wallKit
        ? {
            kit: {
              ...(ground.floorKit ? { floor: ground.floorKit } : {}),
              ...(ground.wallKit ? { wall: ground.wallKit } : {}),
            },
          }
        : {}),
    },
    assets: [...files.values()],
    surfaces: (ground.zones ?? []).map((zone) => ({
      id: zone.id,
      kind: zone.kind,
      position: vec3(zone.position),
      size: [zone.size[0], zone.size[1]],
      ...(zone.assetRef ? { asset: zone.assetRef } : {}),
    })),
    buildings,
    skyline: (ground.skyline ?? []).map((far) => ({
      id: far.id,
      position: vec3(far.position),
      size: vec3(far.size),
      ...(far.floors ? { floors: far.floors } : {}),
    })),
    lights: (ground.lights ?? []).map((light) => ({
      id: light.id,
      kind: light.kind,
      position: vec3(light.position),
      ...(light.facing ? { facing: light.facing } : {}),
      ...(light.blockId ? { on: light.blockId } : {}),
    })),
    ...(instance.spawn
      ? {
          spawn: {
            position: vec3(instance.spawn.position),
            ...(instance.spawn.facing ? { facing: instance.spawn.facing } : {}),
          },
        }
      : {}),
    ...(gate
      ? {
          exit: {
            id: gate.id,
            position: vec3(gate.position),
            axis: gate.axis,
            size: [gate.size[0], gate.size[1]],
            ...(gate.lock ? { lock: { rule: gate.lock.rule } } : {}),
          },
        }
      : {}),
  };
}

/** Where a door goes, in the words another document will be read by. */
function leadsTo(link) {
  return {
    ...(link.instanceId ? { instance: link.instanceId } : {}),
    ...(link.spawnRoomId ? { room: link.spawnRoomId } : {}),
    ...(link.spawnAt ? { at: vec3(link.spawnAt) } : {}),
    ...(link.facing !== undefined ? { facing: link.facing } : {}),
    ...(link.kind ? { kind: link.kind } : {}),
  };
}

/**
 * Every file the city needs, listed once, keyed by the id the masses name it with. Without a catalog
 * to ask, a city ships no files: every mass is one an engine draws from its size, which is what a
 * reader with no catalog can do anyway.
 */
function filesUsed(masses, assetFor, fileFor) {
  const out = new Map();
  if (!assetFor) return out;
  for (const mass of masses) {
    if (!mass.assetRef || out.has(mass.assetRef)) continue;
    let entry;
    try {
      entry = assetFor(mass.assetRef);
    } catch {
      continue; // an id this catalog does not carry is not a file the city can ship
    }
    if (entry?.kind !== "building") continue; // a kit piece faces a mass; it is not the building
    if (!entry.license) {
      throw new CityDocInvalidError(`asset "${entry.id}" carries no license, so it cannot be shipped`);
    }
    out.set(mass.assetRef, {
      id: entry.id,
      file: fileFor(entry),
      size: vec3(entry.size),
      ...(entry.anchor ? { anchor: vec3(entry.anchor) } : {}),
      ...(entry.doors ? { doors: entry.doors } : {}),
      ...(entry.doorFace ? { doorFace: entry.doorFace } : {}),
      ...(entry.floors ? { floors: entry.floors } : {}),
      license: entry.license,
    });
  }
  return out;
}
