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

// FNV-1a, so a tower always draws the same one of the few sheets.
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h | 0;
}
const ANISOTROPY = 4;

/**
 * A store for the expensive half: the canvases the painter drew and the photographs that were
 * loaded. It belongs to the app, not to a scene, so walking through a door does not repaint the
 * whole city and decode every material again. One adventure names a bounded set of buildings, so it
 * cannot grow without bound.
 */
export function createSurfaceStore() {
  return { plans: new Map(), images: new Map() };
}

/**
 * @param {object} deps
 * @param {Function} deps.paintSurface  injected surfaces.paintSurface handle
 * @param {number} [deps.wet]           how wet the streets are, 0 to 1
 * @param {object} [deps.store]         what survives a scene: paint and photographs
 * @param {Document} [deps.document]
 * @returns {object|null} the cache, or null when there is nothing to paint with
 */
export function createSurfaceMaterials({
  paintSurface,
  photoSurface,
  textureBase,
  wet = 0,
  store = createSurfaceStore(),
  document: doc = globalThis.document,
} = {}) {
  if (typeof paintSurface !== "function" || typeof doc?.createElement !== "function") return null;

  const plans = store.plans; // painted once per key, reused at every size it is needed
  const windowMats = new Map(); // one material per kind of window, shared by every one of them
  const loaded = store.images; // one loaded image per file, however many surfaces are cut from it
  const textures = [];
  const loader = textureBase ? new THREE.TextureLoader() : null;

  // A photographed material, if one is catalogued for this surface and the files are there. The
  // images are loaded once and cloned per surface, so each keeps its own repeat.
  function photoFor(kind) {
    if (!loader || typeof photoSurface !== "function") return null;
    return photoSurface(kind);
  }

  function imageFor(file) {
    if (!loaded.has(file)) loaded.set(file, loader.load(`${textureBase}/${file}`));
    return loaded.get(file);
  }

  function mapped(file, repeatX, repeatY, colour) {
    const texture = imageFor(file).clone();
    texture.needsUpdate = true;
    if (colour) texture.colorSpace = THREE.SRGBColorSpace; // albedo is colour; the rest is data
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.anisotropy = ANISOTROPY;
    textures.push(texture);
    return texture;
  }

  function photoMaterial(photo, spanX, spanY, tint) {
    const [mx, my] = photo.metres;
    const repeat = [spanX / mx, spanY / my];
    const material = new THREE.MeshStandardMaterial({
      color: tint ?? 0xffffff,
      map: mapped(photo.maps.albedo, ...repeat, true),
      roughness: photo.material.roughness,
      metalness: photo.material.metalness,
    });
    if (photo.maps.normal) material.normalMap = mapped(photo.maps.normal, ...repeat);
    // One image carries ambient occlusion, roughness and metalness, one per channel, which is how
    // three.js reads them: red, green, blue.
    if (photo.maps.arm) {
      const arm = mapped(photo.maps.arm, ...repeat);
      material.aoMap = arm;
      material.roughnessMap = arm;
      material.metalnessMap = arm;
    }
    return material;
  }

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
  function materialFor(plan, spanX, spanY, tint, over) {
    const [mx, my] = over ?? plan.metres;
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
      // Wet asphalt is painted, not photographed: the standing water is what the parameter changes.
      const photo = surface === "road" && wet > 0 ? null : photoFor(surface);
      if (photo) return photoMaterial(photo, spanX, spanZ, tint);
      return materialFor(planFor(surface, surface, { seed: surface, wet }), spanX, spanZ, tint);
    },

    /** An interior wall, scaled to the wall rather than to the floor. */
    wall(spanX, spanY, tint) {
      const photo = photoFor("wall");
      if (photo) return photoMaterial(photo, spanX, spanY, tint);
      return materialFor(planFor("wall", "wall", { seed: "wall" }), spanX, spanY, tint);
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

    /**
     * One window. There are hundreds in a street, but only a handful of KINDS of window (lit or not,
     * a few colours, blind up or down), so they are painted once each and shared.
     */
    window(part) {
      const key = `window:${part.lit ? part.colour : "dark"}:${part.blind ? "blind" : "open"}`;
      const [w, h] = part.size;
      const plan = planFor(key, "window", {
        lit: part.lit,
        colour: part.colour,
        blind: part.blind,
        metresWide: w,
        metresTall: h,
      });
      if (!windowMats.has(key)) windowMats.set(key, materialFor(plan, plan.metres[0], plan.metres[1]));
      return windowMats.get(key);
    },

    /**
     * A tower in the skyline: its whole front on one sheet, windows painted in. Up close a window is
     * its own object; at three hundred metres that is thousands of objects nobody can see.
     */
    tower(far) {
      const variant = Math.abs(hash(far.id)) % 4;
      const plan = planFor(`tower:${variant}`, "tower", { seed: `tower-${variant}`, litRatio: 0.42 });
      const [mx, my] = plan.metres;
      return materialFor(plan, Math.max(far.size.x, far.size.z), far.size.y, undefined, [mx, my]);
    },

    /** A holo advert: a lit panel, read off its front. */
    advert(part) {
      const [across, up] = part.size;
      const plan = planFor(`advert:${part.text}:${part.colour}:${part.portrait}`, "advert", {
        text: part.text,
        colour: part.colour,
        portrait: part.portrait,
        metresWide: across,
        metresTall: up,
      });
      const face = materialFor(plan, plan.metres[0], plan.metres[1]);
      const edge = new THREE.MeshStandardMaterial({
        color: 0x0d1014,
        emissive: new THREE.Color(part.colour ?? "#ff5f9e"),
        emissiveIntensity: 0.4,
        roughness: 0.5,
      });
      return [edge, edge, edge, edge, face, edge];
    },

    /** What colour a building burns over its door, once its facade has been painted. */
    signColour(blockId) {
      return plans.get(`facade:${blockId}`)?.signColour ?? null;
    },

    // What this scene made is thrown away with it. What was painted or photographed stays in the
    // store: it costs nothing to keep and everything to redo.
    dispose() {
      for (const texture of textures) texture.dispose();
      for (const material of windowMats.values()) material.dispose();
      textures.length = 0;
      windowMats.clear();
    },
  };
}
