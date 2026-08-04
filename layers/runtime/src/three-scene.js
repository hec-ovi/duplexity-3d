// runtime - three.js scene builder.
//
// Turns a pure SceneModel (from scene-model.js) into a three.js Object3D graph. Phase 2 renders
// coloured PRIMITIVE placeholders: floors and walls come straight from room/portal geometry, while
// props, pickup items and NPC bodies are boxes/capsules sized from the injected `asset-registry`
// (real GLB kit pieces drop in later behind this same builder). If an asset id is absent from the
// registry the builder warns and substitutes a default-sized placeholder, honouring the runtime's
// ASSET_LOAD_FAILED contract: never crash the scene. asset-registry is injected, never imported.

import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import { buildDoorway } from "./doorways.js";
import { buildFacadeParts } from "./facade-parts.js";

const KERB = 0.14; // how far a pavement stands proud of the road
const FLOOR_T = 0.2;

const COLORS = {
  floor: 0x5b6068,
  floorAlt: 0x6e5a34,
  floorTint: 0xd9bd82,
  wall: 0x8a8f98,
  block: 0x6d7482,
  ceiling: 0x4a4f58,
  road: 0x2f333a,
  sidewalk: 0x8d9299,
  plaza: 0x777d86,
  object: 0x8a6d3b,
  item: 0xffd479,
  npc: { friendly: 0x5fbf6a, neutral: 0xc9c9c9, wary: 0xe0b050, hostile: 0xcc4b4b },
};

// What a room's floor is made of, by what the room is for. Anything unnamed keeps plain concrete.
const FLOOR_BY_ROOM = [
  [/kitchen|bath|utility|cold room|server/i, "floor.tiles"],
  [/living|bedroom|study|hall|landing/i, "floor.wood"],
  [/shop|aisle|counter|store|yard|archive|office|reception|meeting/i, "floor.concrete"],
];

function floorSurface(room) {
  if (room.open) return "plaza";
  const match = FLOOR_BY_ROOM.find(([pattern]) => pattern.test(room.name ?? ""));
  return match ? match[1] : "floor";
}

const DEFAULT_OBJECT_SIZE = [0.8, 0.8, 0.8];
const DEFAULT_NPC_SIZE = [0.6, 1.8, 0.6];

// A lamp, in metres: a pole with a head on it. The light itself is the rig's business (lights.js);
// this is only the thing you can see standing there.
const LAMP = { height: 4.6, pole: 0.14, head: [0.5, 0.22, 0.5], colour: 0xffd9a8, glow: 1.1 };
const SIGN = { height: 3.6, size: [1.8, 0.5, 0.12], colour: 0xffc98a, glow: 1.5 };
const CEILING = { height: 2.7, size: [0.9, 0.08, 0.9], colour: 0xffeed6, glow: 0.9 };

function standard(color, emissive = 0x000000) {
  return new THREE.MeshStandardMaterial({ color, emissive, roughness: 0.85, metalness: 0.05 });
}

// Something that reads as a source of light: bright, unlit by anything else, and what bloom catches.
function glowing(color, emissiveIntensity) {
  return new THREE.MeshStandardMaterial({
    color: 0x111111,
    emissive: color,
    emissiveIntensity,
    roughness: 0.6,
    metalness: 0,
  });
}

// Standing water: a mirror laid under the road, with the asphalt over it thinned down so what comes
// back through is the lamps and the signs. A bare mirror would be a second city; this is a wet
// street. The wetter it is, the more of it you see.
function wetRoad(zone, wet, roadMat) {
  const group = new THREE.Group();
  const plane = new THREE.PlaneGeometry(zone.size.x, zone.size.z);
  plane.rotateX(-Math.PI / 2);
  const grey = Math.round(30 + wet * 55);
  const mirror = new Reflector(plane, {
    textureWidth: 1024,
    textureHeight: 1024,
    color: (grey << 16) | (grey << 8) | grey,
    clipBias: 0.003,
  });
  group.add(mirror);

  if (roadMat) {
    roadMat.transparent = true;
    roadMat.opacity = Math.max(0.25, 1 - wet * 0.7);
    const film = new THREE.Mesh(plane.clone(), roadMat);
    film.position.y = 0.01;
    group.add(film);
  }
  group.userData = { reflective: true };
  return group;
}

// Which wall of a mass its front door is on, and where along that wall it sits, in the frame the
// facade box works in. Returns null for a building with no way in.
function doorOn(block, portals = []) {
  const portal = portals.find((p) => p.blockId === block.id);
  if (!portal) return null;
  const dx = portal.center.x - block.center.x;
  const dz = portal.center.z - block.center.z;
  if (portal.axis === "x") {
    return dx >= 0 ? { face: "east", along: -dz } : { face: "west", along: dz };
  }
  return dz >= 0 ? { face: "north", along: dx } : { face: "south", along: -dx };
}

// Look up an asset's [w,h,d] from the registry, degrading to `fallback` (and warning) when the
// registry is absent or does not have the id. Returns { size, placeholder }.
function sizeFor(registry, ref, fallback, warn) {
  if (registry && ref) {
    try {
      const entry = registry.get(ref);
      if (Array.isArray(entry?.size) && entry.size.length === 3) {
        return { size: entry.size, placeholder: false };
      }
    } catch (err) {
      warn(`asset "${ref}" unavailable (${err.code ?? err.message}); using placeholder`);
      return { size: fallback, placeholder: true };
    }
  }
  if (ref) warn(`no size for asset "${ref}"; using placeholder`);
  return { size: fallback, placeholder: true };
}

/**
 * Build the renderable group for one instance.
 * @param {object} model     result of buildSceneModel()
 * @param {object} [opts]
 * @param {object} [opts.registry] asset-registry contract ({ get, query }); optional
 * @param {object} [opts.materials] surface material cache (surface-materials.js); optional. Absent,
 *   everything is a flat colour, which is what a head-less test sees.
 * @param {Function} [opts.dressFacade] injected facade.dressFacade; optional. Absent, buildings are
 *   bare masses with nothing bolted to them.
 * @param {(msg:string)=>void} [opts.warn] warning sink (default console.warn)
 * @returns {THREE.Group}
 */
export function buildInstanceObject3D(model, { registry, materials, dressFacade, warn = console.warn } = {}) {
  const group = new THREE.Group();
  group.name = `instance:${model.instanceId}`;
  const counts = { floors: 0, walls: 0, blocks: 0, zones: 0, doors: 0, parts: 0, lights: 0, objects: 0, items: 0, npcs: 0, placeholders: 0 };

  const floorMat = standard(COLORS.floor);
  const floorAltMat = standard(COLORS.floorAlt);
  const wallMat = standard(COLORS.wall);
  const blockMat = standard(COLORS.block);
  const zoneMat = {
    road: standard(COLORS.road),
    sidewalk: standard(COLORS.sidewalk),
    plaza: standard(COLORS.plaza),
  };
  const objectMat = standard(COLORS.object);
  const itemMat = standard(COLORS.item, 0x6b5410);

  for (const room of model.rooms) {
    // A painted surface already carries its own colour: tinting it again only darkens it. The tint
    // is for the flat fallback, and for the one kit that asks for a warmer floor.
    const gold = /gold/i.test(room.floorKit ?? "");
    const mat =
      materials?.ground(floorSurface(room), room.size.x, room.size.z, gold ? COLORS.floorTint : undefined) ??
      (gold ? floorAltMat : floorMat);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(room.size.x, FLOOR_T, room.size.z), mat);
    mesh.position.set(room.center.x, room.floorY - FLOOR_T / 2, room.center.z);
    mesh.name = `floor:${room.id}`;
    mesh.userData = { kind: "floor", room: room.id };
    group.add(mesh);
    counts.floors++;

    // Indoors has a ceiling. Without one a room is a box open to a black sky, and the lamp under it
    // has nothing to bounce off. Open ground is open: it keeps the sky.
    if (room.open) continue;
    const above = new THREE.Mesh(
      new THREE.BoxGeometry(room.size.x, FLOOR_T, room.size.z),
      materials?.ground("ceiling", room.size.x, room.size.z) ?? standard(COLORS.ceiling)
    );
    above.position.set(room.center.x, room.floorY + room.size.y + FLOOR_T / 2, room.center.z);
    above.name = `ceiling:${room.id}`;
    above.userData = { kind: "ceiling", room: room.id };
    group.add(above);
  }

  for (const w of model.walls) {
    // An open room's perimeter still stops you, but there is nothing there to see: the street simply
    // ends. Only walls that render become meshes; the collider stands either way.
    if (w.renders === false) continue;
    const mat = materials?.wall(Math.max(w.size.x, w.size.z), w.size.y) ?? wallMat;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w.size.x, w.size.y, w.size.z), mat);
    mesh.position.set(w.center.x, w.center.y, w.center.z);
    mesh.name = w.id;
    mesh.userData = { kind: "wall" };
    group.add(mesh);
    counts.walls++;
  }

  // What the ground IS, under your feet: roadway, pavement, square. A pavement stands a kerb proud of
  // the road so the two read apart at a glance and from any angle. A wet road is a mirror instead of
  // a surface: standing water is what makes a lit street read as a lit street.
  const wet = model.rules?.wet ?? 0;
  for (const z of model.zones ?? []) {
    const lift = z.kind === "sidewalk" ? KERB : 0.01;
    const mesh =
      z.kind === "road" && wet > 0
        ? wetRoad(z, wet, materials?.ground(z.kind, z.size.x, z.size.z))
        : new THREE.Mesh(
            new THREE.BoxGeometry(z.size.x, lift, z.size.z),
            materials?.ground(z.kind, z.size.x, z.size.z) ?? zoneMat[z.kind] ?? zoneMat.plaza
          );
    if (!mesh.userData.reflective) mesh.position.set(z.center.x, z.center.y + lift / 2, z.center.z);
    else mesh.position.set(z.center.x, z.center.y + 0.012, z.center.z);
    mesh.receiveShadow = true;
    mesh.name = `zone:${z.id}`;
    mesh.userData = { ...mesh.userData, kind: "zone", zone: z.kind };
    group.add(mesh);
    counts.zones++;
  }

  // Buildings on a street: one mass each, drawn from the ground up, then dressed with the small
  // things bolted to it (balconies, an awning, the cartel that says what the place is).
  for (const b of model.blocks ?? []) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.size.x, b.size.y, b.size.z), materials?.block(b) ?? blockMat);
    mesh.position.set(b.center.x, b.center.y, b.center.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `block:${b.id}`;
    mesh.userData = { kind: "block", assetRef: b.assetRef };
    group.add(mesh);
    counts.blocks++;

    if (!dressFacade) continue;
    const dressed = dressFacade({
      id: b.id,
      seed: b.id,
      size: { w: b.size.x, h: b.size.y, d: b.size.z },
      floors: b.floors ?? undefined,
      storeyHeight: b.floors ? b.size.y / b.floors : undefined,
      program: b.program ?? undefined,
      door: doorOn(b, model.portals),
    });
    const parts = buildFacadeParts(dressed.parts, {
      x: b.center.x,
      y: b.center.y - b.size.y / 2,
      z: b.center.z,
    }, {
      signMaterial: materials ? (part) => materials.sign(part) : undefined,
      windowMaterial: materials ? (part) => materials.window(part) : undefined,
    });
    parts.name = `dressing:${b.id}`;
    group.add(parts);
    counts.parts += dressed.parts.length;
  }

  // Doors. On a building's face there is nothing cut out, so the whole door is built: a surround, a
  // leaf set back in it, a handle and a step. An interior doorway is a real hole, so it gets the
  // surround alone.
  const byBlock = new Map((model.blocks ?? []).map((b) => [b.id, b]));
  const roomNames = new Map(
    model.rooms.filter((r) => r.name).map((r) => [r.id, { name: r.name, center: r.center }])
  );
  const openGround = new Set(model.rooms.filter((r) => r.open).map((r) => r.id));
  for (const portal of model.portals ?? []) {
    // The city gate is a gap in an open boundary, with no wall to hang a frame on. A front door is
    // a door wherever it leads, so a house whose way out IS the exit still gets one.
    if (!portal.blockId && openGround.has(portal.roomA)) continue;
    const door = buildDoorway(portal, portal.blockId ? byBlock.get(portal.blockId) : null, model.groundY, {
      signMaterial: materials ? (part) => materials.sign(part) : undefined,
      names: roomNames,
    });
    group.add(door);
    counts.doors++;
  }

  // Lamps and signs. Only their glow is drawn here; which of them are real lights at any moment is
  // decided by the rig, which follows the player.
  const poleMat = standard(0x1b1e23);
  for (const light of model.lights ?? []) {
    const [lx, ly, lz] = light.position;
    if (light.kind === "street_lamp") {
      const pole = new THREE.Mesh(
        new THREE.BoxGeometry(LAMP.pole, LAMP.height, LAMP.pole),
        poleMat
      );
      pole.position.set(lx, ly + LAMP.height / 2, lz);
      pole.name = `lamp:${light.id}`;
      pole.userData = { kind: "light", lightId: light.id };
      group.add(pole);

      const head = new THREE.Mesh(new THREE.BoxGeometry(...LAMP.head), glowing(LAMP.colour, LAMP.glow));
      head.position.set(lx, ly + LAMP.height, lz);
      head.name = `lamp:${light.id}:head`;
      group.add(head);
    } else if (light.kind === "sign") {
      const colour = (light.blockId && materials?.signColour(light.blockId)) || SIGN.colour;
      const plate = new THREE.Mesh(new THREE.BoxGeometry(...SIGN.size), glowing(colour, SIGN.glow));
      plate.position.set(lx, ly + SIGN.height, lz);
      plate.rotation.y = light.facing ?? 0;
      plate.name = `sign:${light.id}`;
      plate.userData = { kind: "light", lightId: light.id, blockId: light.blockId };
      group.add(plate);
    } else if (light.kind === "ceiling") {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(...CEILING.size), glowing(CEILING.colour, CEILING.glow));
      panel.position.set(lx, ly + CEILING.height, lz);
      panel.name = `ceiling:${light.id}`;
      panel.userData = { kind: "light", lightId: light.id };
      group.add(panel);
    }
    counts.lights++;
  }

  for (const obj of model.objects) {
    const { size, placeholder } = sizeFor(registry, obj.assetRef, DEFAULT_OBJECT_SIZE, warn);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), objectMat);
    mesh.position.set(obj.position.x, obj.position.y + size[1] / 2, obj.position.z);
    mesh.rotation.y = obj.rotationY;
    mesh.name = `object:${obj.id}`;
    mesh.userData = { kind: "object", assetRef: obj.assetRef, placeholder };
    group.add(mesh);
    counts.objects++;
    if (placeholder) counts.placeholders++;
  }

  for (const item of model.items) {
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), itemMat);
    mesh.position.set(item.position.x, item.position.y, item.position.z);
    mesh.name = `item:${item.itemId}`;
    mesh.userData = { kind: "item", itemId: item.itemId };
    group.add(mesh);
    counts.items++;
  }

  for (const npc of model.npcs) {
    const { size, placeholder } = sizeFor(registry, npc.bodyRef, DEFAULT_NPC_SIZE, warn);
    const h = size[1];
    const radius = Math.min(size[0] / 2 || 0.3, h / 3);
    const length = Math.max(0.1, h - 2 * radius);
    const color = COLORS.npc[npc.disposition] ?? COLORS.npc.neutral;

    // Wrap each NPC in a group anchored at its feet so the runtime can drive position + facing each
    // frame and the actor (npc-actor.js) can hang a name label and speech bubble off it. The capsule
    // body sits at local +h/2 and is bobbed/toppled by the actor's procedural placeholder animation.
    const npcGroup = new THREE.Group();
    npcGroup.position.set(npc.position.x, npc.position.y, npc.position.z);
    npcGroup.rotation.y = npc.facing;
    npcGroup.name = `npc:${npc.id}`;
    npcGroup.userData = { kind: "npc", npcId: npc.id, placeholder, height: h };

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 8), standard(color));
    body.position.set(0, h / 2, 0);
    body.name = `npc:${npc.id}:body`;
    body.userData = { kind: "npc-body", npcId: npc.id };
    npcGroup.add(body);

    group.add(npcGroup);
    counts.npcs++;
    if (placeholder) counts.placeholders++;
  }

  // Everything solid throws a shadow and takes one; the glowing bits do neither, since a lamp head
  // casting its own shadow only ever looks wrong.
  group.traverse((node) => {
    if (!node.isMesh || node.userData.kind === "light") return;
    node.castShadow = true;
    node.receiveShadow = true;
  });
  group.userData = { instanceId: model.instanceId, counts };
  return group;
}
