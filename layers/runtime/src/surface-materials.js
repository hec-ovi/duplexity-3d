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
 * @param {number} [deps.wet]           how wet the streets are, 0 to 1
 * @param {Document} [deps.document]
 * @returns {object|null} the cache, or null when there is nothing to paint with
 */
export function createSurfaceMaterials({ paintSurface, wet = 0, document: doc = globalThis.document } = {}) {
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
      return materialFor(planFor(surface, surface, { seed: surface, wet }), spanX, spanZ, tint);
    },

    /** An interior wall: the same concrete, scaled to the wall rather than to the floor. */
    wall(spanX, spanY, tint) {
      return materialFor(planFor("concrete", "concrete", { seed: "concrete" }), spanX, spanY, tint);
    },

    /**
     * A building, as the six materials of its box: a facade painted to fit each wall exactly (one
     * sheet for the two wide sides, one for the two narrow ones, each a whole number of bays over
     * that wall and one row per storey), and a plain roof. Nothing tiles, so no window is ever cut
     * in half and no two buildings wear the same front.
     */
    block(block) {
      const { x: width, y: height, z: depth } = block.size;
      const floors = block.floors ?? Math.max(1, Math.round((height - 1) / 3.2));
      const sheet = (key, metresWide) =>
        planFor(`facade:${block.id}${key}`, "facade", {
          seed: `${block.id}${key}`,
          metresWide,
          floors,
          storeyHeight: height / floors,
          program: block.program,
        });
      // Painted at its own size and stretched onto the wall, so the bays land on the wall's edges.
      const fitted = (plan) => materialFor(plan, plan.metres[0], plan.metres[1]);
      const front = sheet("", width);
      const side = sheet(":side", depth);
      const roof = new THREE.MeshStandardMaterial({ color: 0x24272d, roughness: 0.95, metalness: 0.05 });
      return [fitted(side), fitted(side), roof, roof, fitted(front), fitted(front)];
    },

    /**
     * A cartel: the six materials of its board, with the name lettered on the faces you read it
     * from. A flat sign is read off its front; a blade sign, which stands out at right angles to the
     * wall, off both its sides.
     */
    sign(part) {
      const [across, up, out] = part.size;
      const blade = part.orientation === "blade";
      const plan = planFor(`sign:${part.text}:${part.colour}:${blade}`, "sign", {
        text: part.text ?? "",
        colour: part.colour,
        metresWide: blade ? out : across,
        metresTall: up,
      });
      const face = () => materialFor(plan, plan.metres[0], plan.metres[1]);
      const edge = new THREE.MeshStandardMaterial({
        color: 0x14171c,
        emissive: new THREE.Color(part.colour ?? "#ddc87e"),
        emissiveIntensity: 0.35,
        roughness: 0.6,
      });
      return blade
        ? [face(), face(), edge, edge, edge, edge]
        : [edge, edge, edge, edge, face(), face()];
    },

    /** What colour a building burns over its door, once its facade has been painted. */
    signColour(blockId) {
      return plans.get(`facade:${blockId}`)?.signColour ?? null;
    },

    dispose() {
      for (const texture of textures) texture.dispose();
      textures.length = 0;
      plans.clear();
    },
  };
}
