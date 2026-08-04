// cityscape - the city, as three.js objects.
//
// Isolation: imports no other layer's src. What a surface is PAINTED like and what is BOLTED to a
// building are decisions other boxes make; they arrive as injected handles. This box takes a scene
// model (rooms, blocks, zones, lights, props, a transit line) and hands back one object that owns
// everything three.js needs to draw and move that city.
//
// One thing goes in, one thing comes out: a group to add to a scene, and an `update` to call each
// frame. Whoever owns the renderer never has to know a rail from a lamp.

import { buildInstanceObject3D } from "./scene.js";
import { createSurfaceMaterials } from "./materials.js";
import { createLightRig } from "./lights.js";
import { createTraffic } from "./traffic.js";
import { createSkyRail } from "./skyrail.js";
import { createShuttle } from "./shuttle.js";
import { createNpcActors } from "./npc-actor.js";
import { seededRng, hashString } from "./rng.js";

export { buildInstanceObject3D } from "./scene.js";
export { createSurfaceMaterials } from "./materials.js";
export { createShuttle } from "./shuttle.js";

/**
 * Build one instance of a city and everything that moves in it.
 *
 * @param {object} model  a runtime SceneModel
 * @param {object} [deps]
 * @param {object} [deps.registry]      asset-registry handle ({ get, query })
 * @param {Function} [deps.paintSurface] surfaces.paintSurface; absent means flat colours
 * @param {Function} [deps.photoSurface] surfaces.photoSurface: which surfaces are photographed
 * @param {string} [deps.textureBase]    where those photographed files are served from
 * @param {Function} [deps.dressFacade]  facade.dressFacade; absent means bare masses
 * @param {Function} [deps.warn]
 * @param {Array} [deps.npcs] who is in it, so their bodies can be driven each frame
 * @returns {{ group, open, shuttle, syncNpcs, update, dispose }}
 */
export function createCityscape(model, deps = {}) {
  const { registry, paintSurface, photoSurface, textureBase, dressFacade, warn, npcs } = deps;
  const open = model.rooms.some((r) => r.open);

  const materials = createSurfaceMaterials({
    paintSurface,
    photoSurface,
    textureBase,
    wet: model.rules?.wet,
  });
  const group = buildInstanceObject3D(model, { registry, materials, dressFacade, warn });

  // The lights go INSIDE the city's own group, so taking the city down takes them with it.
  const rig = createLightRig(group, {
    lights: model.lights,
    open,
    extent: Math.max(model.bounds.maxX - model.bounds.minX, model.bounds.maxZ - model.bounds.minZ),
    // A sign over a door burns the colour that building's own front is painted.
    tintFor: (light) => (light.blockId ? materials?.signColour(light.blockId) : null),
  });

  // Only the outdoors has a sky to fly through, rails to run over it, or a street to drive down.
  const traffic = open ? createTraffic(model.bounds, seededRng(hashString(model.instanceId), "traffic")) : null;
  const rails = open ? createSkyRail(model.bounds, seededRng(hashString(model.instanceId), "rails")) : null;
  const shuttle = open ? createShuttle(model.transit) : null;
  for (const moving of [traffic, rails, shuttle]) {
    if (moving) group.add(moving.group);
  }

  // Binds each NPC's group in the scene to whatever the simulation says its state is.
  const actors = createNpcActors(group, npcs ?? model.npcs);

  return {
    group,
    open,
    /** The rideable shuttle, or null where the level has no line. */
    shuttle,

    /** Put the people where the simulation says they are. Every frame. */
    syncNpcs: (states, camera, dt) => actors.sync(states, camera, dt),

    /**
     * Move everything on by one frame.
     * @param {number} elapsed  seconds since the city was built (traffic, rails, projections)
     * @param {number} dt       seconds since the last frame (the light rig, the shuttle)
     * @param {{x,y,z}} at      where the player is, so the light pool follows them
     */
    update(elapsed, dt, at) {
      rig.update(at, dt);
      traffic?.update(elapsed);
      rails?.update(elapsed);
      shuttle?.update(dt);
      group.userData.animate?.(elapsed);
    },

    dispose() {
      actors.dispose();
      rig.dispose();
      for (const moving of [traffic, rails, shuttle]) moving?.dispose();
      materials?.dispose();
      // A material marked `shared` is made once for every city there will ever be, so a scene being
      // taken down must not take it with it.
      const give = (m) => {
        if (m && !m.userData?.shared) m.dispose?.();
      };
      group.traverse?.((node) => {
        node.geometry?.dispose?.();
        const material = node.material;
        if (Array.isArray(material)) material.forEach(give);
        else give(material);
      });
    },
  };
}
