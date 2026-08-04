// surfaces - paint what the city is made of.
//
// Isolation: imports no other layer's src, no three.js and no DOM. It draws onto a 2D drawing
// context the caller hands it, and hands back the recipe for turning that into a material: how many
// metres one tile covers, how rough it is, and whether any of it glows.
//
// Everything is seeded, so the same building is painted the same way every time it is loaded.

import { createRng, hashString } from "./rng.js";
import { paintConcrete, paintRoad, paintSlabs } from "./ground.js";
import { paintFacadeAlbedo, paintFacadeEmissive, planFacade } from "./facade.js";
import { paintSignAlbedo, paintSignEmissive, planSign } from "./sign.js";
import { paintWindowAlbedo, paintWindowEmissive, planWindow } from "./window.js";
import { paintAdvertAlbedo, paintAdvertEmissive, planAdvert } from "./advert.js";
import MANIFEST from "../materials/manifest.json" with { type: "json" };

const TILE = 256; // pixels per ground tile

// How much world one tile of each ground surface covers, and how it takes light.
const GROUND = {
  road: { metres: 6, roughness: 0.82, metalness: 0.04 },
  pavement: { metres: 3.2, roughness: 0.9, metalness: 0.02 },
  plaza: { metres: 3.6, roughness: 0.9, metalness: 0.02 },
  concrete: { metres: 4, roughness: 0.95, metalness: 0 },
  floor: { metres: 3, roughness: 0.7, metalness: 0.03 },
  wall: { metres: 3, roughness: 0.95, metalness: 0 },
  ceiling: { metres: 2.4, roughness: 0.96, metalness: 0 },
};

export const SURFACE_KINDS = ["road", "pavement", "plaza", "concrete", "floor", "wall", "ceiling", "facade", "window", "advert", "sign"];

/**
 * The photographed material for a surface, if one is catalogued: a set of map FILE NAMES relative to
 * wherever the caller keeps them, how much world one tile covers, and how it takes light. Public
 * domain (CC0); `npm run textures` fetches the files. Null means paint it instead.
 *
 * @returns {{ id, slug, metres:[number,number], maps:object, material:object, credit:string }|null}
 */
export function photoSurface(kind) {
  const entry = MANIFEST.materials?.[kind] ?? MANIFEST.materials?.[kind.split(".")[0]];
  if (!entry) return null;
  return {
    id: kind,
    slug: entry.slug,
    metres: [entry.metres, entry.metres],
    maps: {
      albedo: `${entry.slug}/albedo.jpg`,
      normal: `${entry.slug}/normal.jpg`,
      arm: `${entry.slug}/arm.jpg`,
    },
    material: { roughness: entry.roughness, metalness: entry.metalness },
    credit: entry.credit,
  };
}

/** Every photographed material, for a credits screen or a licence check. */
export const PHOTO_MATERIALS = MANIFEST;

export class UnknownSurfaceError extends Error {
  constructor(kind) {
    super(`no surface named "${kind}": one of ${SURFACE_KINDS.join(", ")}`);
    this.code = "UNKNOWN_SURFACE";
  }
}

export class NoCanvasError extends Error {
  constructor(map) {
    super(`the canvas factory returned nothing to draw the ${map} map on`);
    this.code = "NO_CANVAS";
  }
}

function contextFor(ctxFor, map, width, height) {
  const ctx = ctxFor(map, width, height);
  if (!ctx || typeof ctx.fillRect !== "function") throw new NoCanvasError(map);
  return ctx;
}

/**
 * Paint one surface.
 *
 * @param {string} kind  one of SURFACE_KINDS
 * @param {Function} ctxFor  (map, width, height) -> a 2D drawing context of that size
 * @param {object} [opts]
 * @param {string|number} [opts.seed]         same seed, same surface
 * @param {number} [opts.metresWide]          facade: the frontage this sheet has to cover
 * @param {number} [opts.floors]              facade: storeys, ground floor included
 * @param {number} [opts.storeyHeight]        facade: metres per storey (default 3.2)
 * @param {number} [opts.litRatio]            facade: share of windows with a light on (default 0.45)
 * @param {string} [opts.program]             facade: what the building is for
 * @param {number} [opts.wet]                 road: 0 dry (default) to 1 soaked
 * @param {string} [opts.text]                sign: what it says
 * @param {string} [opts.colour]              sign: what colour it burns
 * @param {number} [opts.metresTall]          sign: how tall the board is
 * @returns {object} SurfacePlan (schema: schema/surface-plan.json)
 */
export function paintSurface(kind, ctxFor, opts = {}) {
  const rng = createRng(typeof opts.seed === "number" ? opts.seed : hashString(opts.seed ?? kind));

  if (kind === "facade") {
    const plan = planFacade(
      {
        metresWide: opts.metresWide ?? 12,
        floors: opts.floors ?? 1,
        storeyHeight: opts.storeyHeight ?? 3.2,
        litRatio: opts.litRatio ?? 0.45,
        program: opts.program,
      },
      rng
    );
    const albedo = contextFor(ctxFor, "albedo", plan.width, plan.height);
    paintFacadeAlbedo(albedo, plan, rng);
    const emissive = contextFor(ctxFor, "emissive", plan.width, plan.height);
    paintFacadeEmissive(emissive, plan);

    return {
      kind,
      pixels: [plan.width, plan.height],
      metres: plan.metres,
      maps: { albedo, emissive },
      material: { roughness: 0.78, metalness: 0.06, emissiveIntensity: 0.85 },
      lit: plan.windows.filter((w) => w.lit).length,
      // What colour this place burns over its door, so a light put there can match it.
      ...(plan.sign.lit ? { signColour: plan.sign.colour } : {}),
    };
  }

  if (kind === "advert") {
    const plan = planAdvert({ text: opts.text ?? "NEO", colour: opts.colour ?? "#ff5f9e", portrait: opts.portrait });
    const albedo = contextFor(ctxFor, "albedo", plan.width, plan.height);
    paintAdvertAlbedo(albedo, plan);
    const emissive = contextFor(ctxFor, "emissive", plan.width, plan.height);
    paintAdvertEmissive(emissive, plan);
    return {
      kind,
      pixels: [plan.width, plan.height],
      metres: [opts.metresWide ?? 4, opts.metresTall ?? 10],
      maps: { albedo, emissive },
      material: { roughness: 0.4, metalness: 0.05, emissiveIntensity: 0.75 },
      signColour: plan.colour,
    };
  }

  if (kind === "window") {
    const plan = planWindow(opts);
    const albedo = contextFor(ctxFor, "albedo", plan.width, plan.height);
    paintWindowAlbedo(albedo, plan);
    const emissive = contextFor(ctxFor, "emissive", plan.width, plan.height);
    paintWindowEmissive(emissive, plan);
    return {
      kind,
      pixels: [plan.width, plan.height],
      metres: [opts.metresWide ?? 1.5, opts.metresTall ?? 1.35],
      maps: { albedo, emissive },
      material: { roughness: 0.35, metalness: 0.08, emissiveIntensity: plan.lit ? 1.1 : 0 },
    };
  }

  if (kind === "sign") {
    const plan = planSign({
      text: opts.text ?? "",
      colour: opts.colour ?? "#ddc87e",
      metresWide: opts.metresWide ?? 2,
      metresTall: opts.metresTall ?? 0.7,
    });
    const albedo = contextFor(ctxFor, "albedo", plan.width, plan.height);
    paintSignAlbedo(albedo, plan);
    const emissive = contextFor(ctxFor, "emissive", plan.width, plan.height);
    paintSignEmissive(emissive, plan);

    return {
      kind,
      pixels: [plan.width, plan.height],
      metres: plan.metres,
      maps: { albedo, emissive },
      material: { roughness: 0.5, metalness: 0.1, emissiveIntensity: 0.95 },
      signColour: plan.colour,
    };
  }

  const ground = GROUND[kind] ?? GROUND[kind.split(".")[0]];
  if (!ground) throw new UnknownSurfaceError(kind);
  const wet = kind === "road" ? Math.max(0, Math.min(1, opts.wet ?? 0)) : 0;

  const albedo = contextFor(ctxFor, "albedo", TILE, TILE);
  if (kind === "road") paintRoad(albedo, rng, TILE, wet);
  else if (kind.startsWith("floor")) paintSlabs(albedo, rng, TILE, "floor");
  else if (kind === "pavement" || kind === "plaza") paintSlabs(albedo, rng, TILE, kind);
  else paintConcrete(albedo, rng, TILE, kind);

  return {
    kind: kind.split(".")[0],
    pixels: [TILE, TILE],
    metres: [ground.metres, ground.metres],
    maps: { albedo },
    material: {
      // Water takes the tooth off asphalt, and what is left throws the lamps back down the street.
      roughness: ground.roughness - wet * 0.55,
      metalness: ground.metalness + wet * 0.25,
    },
  };
}
