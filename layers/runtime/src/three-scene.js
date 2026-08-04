// runtime - three.js scene builder.
//
// Turns a pure SceneModel (from scene-model.js) into a three.js Object3D graph. Phase 2 renders
// coloured PRIMITIVE placeholders: floors and walls come straight from room/portal geometry, while
// props, pickup items and NPC bodies are boxes/capsules sized from the injected `asset-registry`
// (real GLB kit pieces drop in later behind this same builder). If an asset id is absent from the
// registry the builder warns and substitutes a default-sized placeholder, honouring the runtime's
// ASSET_LOAD_FAILED contract: never crash the scene. asset-registry is injected, never imported.

import * as THREE from "three";

const KERB = 0.14; // how far a pavement stands proud of the road
const FLOOR_T = 0.2;

const COLORS = {
  floor: 0x5b6068,
  floorAlt: 0x6e5a34,
  wall: 0x8a8f98,
  block: 0x6d7482,
  road: 0x2f333a,
  sidewalk: 0x8d9299,
  plaza: 0x777d86,
  object: 0x8a6d3b,
  item: 0xffd479,
  npc: { friendly: 0x5fbf6a, neutral: 0xc9c9c9, wary: 0xe0b050, hostile: 0xcc4b4b },
};

const DEFAULT_OBJECT_SIZE = [0.8, 0.8, 0.8];
const DEFAULT_NPC_SIZE = [0.6, 1.8, 0.6];

function standard(color, emissive = 0x000000) {
  return new THREE.MeshStandardMaterial({ color, emissive, roughness: 0.85, metalness: 0.05 });
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
 * @param {(msg:string)=>void} [opts.warn] warning sink (default console.warn)
 * @returns {THREE.Group}
 */
export function buildInstanceObject3D(model, { registry, warn = console.warn } = {}) {
  const group = new THREE.Group();
  group.name = `instance:${model.instanceId}`;
  const counts = { floors: 0, walls: 0, blocks: 0, zones: 0, objects: 0, items: 0, npcs: 0, placeholders: 0 };

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
    const mat = /gold/i.test(room.floorKit ?? "") ? floorAltMat : floorMat;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(room.size.x, FLOOR_T, room.size.z), mat);
    mesh.position.set(room.center.x, room.floorY - FLOOR_T / 2, room.center.z);
    mesh.name = `floor:${room.id}`;
    mesh.userData = { kind: "floor", room: room.id };
    group.add(mesh);
    counts.floors++;
  }

  for (const w of model.walls) {
    // An open room's perimeter still stops you, but there is nothing there to see: the street simply
    // ends. Only walls that render become meshes; the collider stands either way.
    if (w.renders === false) continue;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w.size.x, w.size.y, w.size.z), wallMat);
    mesh.position.set(w.center.x, w.center.y, w.center.z);
    mesh.name = w.id;
    mesh.userData = { kind: "wall" };
    group.add(mesh);
    counts.walls++;
  }

  // What the ground IS, under your feet: roadway, pavement, square. A pavement stands a kerb proud of
  // the road so the two read apart at a glance and from any angle.
  for (const z of model.zones ?? []) {
    const lift = z.kind === "sidewalk" ? KERB : 0.01;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(z.size.x, lift, z.size.z), zoneMat[z.kind] ?? zoneMat.plaza);
    mesh.position.set(z.center.x, z.center.y + lift / 2, z.center.z);
    mesh.name = `zone:${z.id}`;
    mesh.userData = { kind: "zone", zone: z.kind };
    group.add(mesh);
    counts.zones++;
  }

  // Buildings on a street: one mass each, drawn from the ground up.
  for (const b of model.blocks ?? []) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.size.x, b.size.y, b.size.z), blockMat);
    mesh.position.set(b.center.x, b.center.y, b.center.z);
    mesh.name = `block:${b.id}`;
    mesh.userData = { kind: "block", assetRef: b.assetRef };
    group.add(mesh);
    counts.blocks++;
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

  group.userData = { instanceId: model.instanceId, counts };
  return group;
}
