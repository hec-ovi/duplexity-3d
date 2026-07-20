// scenario-creator - turn one InstanceSpec into a geometrically valid layout.
//
// Isolation: imports no other layer's src. The asset-registry query and the layout graph generator
// (the LLM stand-in) both arrive as injected dependencies, never imports.
//
// Pipeline (per CONTRACT.md): a graph generator emits an ABSTRACT room-adjacency graph (topology
// only); a deterministic solver packs it onto a grid and aligns portals; the validator re-proves the
// geometry; an invalid layout is regenerated, never shipped. A grammar-guaranteed straight-chain
// fallback keeps instance creation from ever hard-failing on geometry.

import { solve, NoAssetForKindError } from "./solver.js";
import { validateLayout } from "./validate.js";
import { defaultGraphGen, linearChain, isValidGraph } from "./graph-gen.js";

export class LayoutInvalidError extends Error {
  constructor(report) {
    super("could not produce a valid layout within the attempt budget");
    this.code = "LAYOUT_INVALID";
    this.report = report;
  }
}

// FNV-1a: derive a stable default seed from the instance id, so the same spec always lays out the
// same way without a wall clock or Math.random.
function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Build one geometrically valid Instance layout from an InstanceSpec.
 *
 * @param {object} instanceSpec  the narrator's InstanceSpec (schema: instance-spec.json)
 * @param {Function} assetQuery  injected asset-registry.query handle ({ kind, theme } -> AssetEntry[])
 * @param {object} [opts]
 * @param {Function} [opts.graphGen]   (spec, seed) -> RoomGraph. Defaults to the deterministic
 *                                     stand-in; Phase 5/6 injects a grammar-constrained model here.
 * @param {number}  [opts.seed]        base seed (default: hash of the instance id).
 * @param {number}  [opts.maxAttempts] regenerate budget before the fallback layout (default 8).
 * @returns {{ instance: object, report: object }}
 */
export function createInstance(instanceSpec, assetQuery, opts = {}) {
  const graphGen = opts.graphGen ?? defaultGraphGen;
  const baseSeed = opts.seed ?? hashString(instanceSpec.id ?? "inst");
  const maxAttempts = opts.maxAttempts ?? 8;

  let lastReport = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let graph;
    try {
      graph = graphGen(instanceSpec, (baseSeed + attempt) >>> 0);
    } catch {
      continue; // a throwing generator is just a failed attempt; try again / fall back.
    }
    if (!isValidGraph(graph)) continue;

    const instance = solve(graph, instanceSpec, assetQuery); // NO_ASSET_FOR_KIND propagates.
    const report = validateLayout(instance);
    lastReport = report;
    if (report.ok) return { instance, report };
  }

  // Grammar-guaranteed fallback: a straight chain always solves and validates.
  const instance = solve(linearChain(instanceSpec), instanceSpec, assetQuery);
  const report = validateLayout(instance);
  if (report.ok) return { instance, report };
  throw new LayoutInvalidError(report ?? lastReport);
}

export { validateLayout, NoAssetForKindError };
