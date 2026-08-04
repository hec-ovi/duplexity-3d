// runtime - turn painted surfaces into three.js materials.
//
// The painting belongs to another box and arrives as an injected `paintSurface` handle. What lives
// here is browser-side: the canvas the paint goes onto, the textures made from it, the repeat that
// keeps a paving slab the same size on a 4m pavement and an 80m road, and disposal.
//
// Without a painter (a head-less test, a host that wants none) this returns null and the scene
// builder falls back to flat colours.

import * as THREE from "three";

const ZONE_SURFACE = { road: "road", sidewalk: "pavement", plaza: "plaza" };
const ANISOTROPY = 4;

/**
 * @param {object} deps
 * @param {Function} deps.paintSurface  injected surfaces.paintSurface handle
 * @param {Document} [deps.document]
 * @returns {object|null} the cache, or null when there is nothing to paint with
 */
export function createSurfaceMaterials({ paintSurface, document: doc = globalThis.document } = {}) {
  if (typeof paintSurface !== "function" || typeof doc?.createElement !== "function") return null;

  const plans = new Map(); // painted once per key, reused at every size it is needed
  const textures = [];

  const ctxFor = (map, w, h) => {
    const canvas = doc.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    return canvas.getContext("2d");
  };

  function planFor(key, kind, opts) {
    if (!plans.has(key)) plans.set(key, paintSurface(kind, ctxFor, opts));
    return plans.get(key);
  }

  function textureOf(ctx, repeatX, repeatY) {
    const texture = new THREE.CanvasTexture(ctx.canvas);
    texture.colorSpace = THREE.SRGBColorSpace; // colour data, both the albedo and the glow
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.anisotropy = ANISOTROPY;
    textures.push(texture);
    return texture;
  }

  // One material for a surface covering `spanX` by `spanY` metres, repeating at its own scale.
  function materialFor(plan, spanX, spanY, tint) {
    const [mx, my] = plan.metres;
    const material = new THREE.MeshStandardMaterial({
      color: tint ?? 0xffffff,
      map: textureOf(plan.maps.albedo, spanX / mx, spanY / my),
      roughness: plan.material.roughness,
      metalness: plan.material.metalness,
    });
    if (plan.maps.emissive) {
      material.emissive = new THREE.Color(0xffffff);
      material.emissiveMap = textureOf(plan.maps.emissive, spanX / mx, spanY / my);
      material.emissiveIntensity = plan.material.emissiveIntensity ?? 1;
    }
    return material;
  }

  return {
    /** Ground you walk on: a floor, a roadway, a pavement. `kind` is a zone kind or "concrete". */
    ground(kind, spanX, spanZ, tint) {
      const surface = ZONE_SURFACE[kind] ?? kind;
      return materialFor(planFor(surface, surface, { seed: surface }), spanX, spanZ, tint);
    },

    /** An interior wall: the same concrete, scaled to the wall rather than to the floor. */
    wall(spanX, spanY, tint) {
      return materialFor(planFor("concrete", "concrete", { seed: "concrete" }), spanX, spanY, tint);
    },

    /**
     * A building, as the six materials of its box: its own facade on all four sides (each scaled to
     * that side's width, so the bays stay the same size), and a plain roof.
     */
    block(block) {
      const { x: width, y: height, z: depth } = block.size;
      const floors = block.floors ?? Math.max(1, Math.round((height - 1) / 3.2));
      const plan = planFor(`facade:${block.id}`, "facade", {
        seed: block.id,
        metresWide: Math.max(width, depth),
        floors,
        storeyHeight: height / floors,
        program: block.program,
      });
      const roof = new THREE.MeshStandardMaterial({ color: 0x24272d, roughness: 0.95, metalness: 0.05 });
      return [
        materialFor(plan, depth, height), // +x
        materialFor(plan, depth, height), // -x
        roof,
        roof,
        materialFor(plan, width, height), // +z
        materialFor(plan, width, height), // -z
      ];
    },

    dispose() {
      for (const texture of textures) texture.dispose();
      textures.length = 0;
      plans.clear();
    },
  };
}
