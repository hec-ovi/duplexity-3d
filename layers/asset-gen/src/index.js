// asset-gen - generate/enrich 3D assets asynchronously and register them, optionally and without
// blocking play. Both the generator provider (providers/gen3d: ComfyUI/TRELLIS.2 on the AMD box, or a
// cloud API) and the asset-registry are injected; this src imports no other layer's src. Nothing
// depends on this layer, so its absence or failure never affects the engine.
//
// A job runs async: generate(req) returns immediately with { jobId, completion }, where completion is a
// Promise that ALWAYS resolves (never rejects) to the final GenStatus once the (async) provider returns
// and the output has been normalized into a valid, LICENSED AssetEntry and registered. status(jobId)
// polls the live state. A disabled (no provider) or failing generator fails the job cleanly and
// registers nothing.
//
// normalizeEntry is the trust boundary: provider output (ComfyUI/TRELLIS/cloud) is untrusted, so it is
// thoroughly validated into a contract-valid AssetEntry here, or dropped (NORMALIZE_FAILED), never
// registered. Generated ids are forced into a reserved "gen." namespace so a stray/buggy provider id can
// never overwrite a curated kit asset (asset-gen is purely additive enrichment).

const KINDS = new Set(["room-floor", "wall", "door", "corridor", "prop", "character", "decal"]);
const AXES = new Set(["x", "y", "z"]);

// Licenses asset-gen will register. The registry checks a license is PRESENT; asset-gen additionally
// requires it be commercial-use-clear, so an ambiguously-licensed generation is dropped, never shipped.
const COMMERCIAL_LICENSES = new Set([
  "CC0-1.0",
  "CC-BY-4.0",
  "CC-BY-SA-4.0",
  "MIT",
  "Apache-2.0",
  "BSD-3-Clause",
]);

export class ProviderUnavailableError extends Error {
  constructor() {
    super("no generator configured");
    this.code = "PROVIDER_UNAVAILABLE";
  }
}

export class NormalizeFailedError extends Error {
  constructor(detail) {
    super(`generated output could not be normalized into a valid asset: ${detail}`);
    this.code = "NORMALIZE_FAILED";
  }
}

function isVec3(a) {
  return Array.isArray(a) && a.length === 3 && a.every((n) => typeof n === "number" && Number.isFinite(n));
}

function isValidSnap(s) {
  return s && typeof s === "object" && !Array.isArray(s) && isVec3(s.position) && (s.axis === undefined || AXES.has(s.axis));
}

// Force a generated id into the reserved "gen." namespace so it can never collide with a curated kit id
// (kits are "kaykit.*", "kenney.*", ...). A provider id is kept only if it already lives in that
// namespace; otherwise it is prefixed, so a stray or hostile provider id cannot overwrite a kit asset.
function genId(rawId, kind, jobId) {
  if (typeof rawId === "string" && rawId) {
    return rawId.startsWith("gen.") ? rawId : `gen.${rawId}`;
  }
  return `gen.${kind}.${jobId}`;
}

// Turn a raw provider result into a valid, licensed AssetEntry (asset-registry/asset-entry.json), or
// throw NORMALIZE_FAILED so it is dropped rather than registered. Fills the drop-in fields the grid
// solver relies on (an accurate bbox, source=generated) from the request's targetSpec when the provider
// omits them (copied, never aliased), and enforces every AssetEntry invariant asset-gen owns: a known
// kind, a valid bbox, a resolvable glbUrl, a commercial-use-clear license, well-formed snapPoints, and
// non-empty string animations on a character.
function normalizeEntry(raw, req, jobId) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new NormalizeFailedError("provider returned no asset object");
  }
  const kind = raw.kind ?? req?.kind;
  if (!KINDS.has(kind)) throw new NormalizeFailedError(`unknown asset kind: ${kind ?? "none"}`);

  const size = isVec3(raw.size) ? [...raw.size] : isVec3(req?.targetSpec?.bbox) ? [...req.targetSpec.bbox] : null;
  if (!size) throw new NormalizeFailedError("no valid [w,h,d] bbox from the provider or the request");
  if (typeof raw.glbUrl !== "string" || !raw.glbUrl) throw new NormalizeFailedError("no resolvable glbUrl");
  if (!raw.license || !COMMERCIAL_LICENSES.has(raw.license)) {
    throw new NormalizeFailedError(`license is not commercial-use-clear: ${raw.license ?? "none"}`);
  }

  const tags = Array.isArray(raw.tags) && raw.tags.length && raw.tags.every((t) => typeof t === "string")
    ? [...raw.tags]
    : ["generated"];

  const entry = {
    id: genId(raw.id, kind, jobId),
    kind,
    tags,
    theme: typeof raw.theme === "string" && raw.theme ? raw.theme : "generated",
    size,
    glbUrl: raw.glbUrl,
    license: raw.license,
    source: "generated",
  };

  if (raw.snapPoints !== undefined) {
    if (!Array.isArray(raw.snapPoints) || !raw.snapPoints.every(isValidSnap)) {
      throw new NormalizeFailedError("snapPoints must each carry a valid [x,y,z] position");
    }
    entry.snapPoints = raw.snapPoints.map((s) => (s.axis ? { position: [...s.position], axis: s.axis } : { position: [...s.position] }));
  }

  if (kind === "character") {
    if (!Array.isArray(raw.animations) || raw.animations.length === 0 || !raw.animations.every((a) => typeof a === "string" && a)) {
      throw new NormalizeFailedError("a character asset must declare non-empty string animations");
    }
    entry.animations = [...raw.animations];
  }

  return entry;
}

/**
 * @param {object} deps { provider?, registry, emit?, validateEntry? }
 *   - provider?: the gen3d adapter `(genRequest) -> AssetEntry-ish | Promise<...>`. Omitted -> disabled.
 *   - registry: asset-registry (its `register(AssetEntry) -> id` write contract).
 *   - emit?: `(eventName, payload) -> void`, for `gen.completed` / `gen.failed`.
 *   - validateEntry?: `(AssetEntry) -> { ok, errors }`, an optional final schema gate the composition
 *     root wires against asset-entry.json, so a normalized entry is proven schema-valid before register.
 */
export function createAssetGen({ provider, registry, emit, validateEntry } = {}) {
  const jobs = new Map();
  let n = 0;
  const fire = (name, payload) => {
    try {
      emit?.(name, payload);
    } catch {
      // an event-sink failure must never affect a generation job
    }
  };

  function generate(req) {
    const jobId = `job-${++n}`;

    if (!provider) {
      // disabled: fail cleanly, register nothing, keep the engine (which runs from kits) untouched
      const status = { state: "failed", error: "PROVIDER_UNAVAILABLE" };
      jobs.set(jobId, status);
      fire("gen.failed", { jobId, error: status.error });
      return { jobId, completion: Promise.resolve(status) };
    }

    jobs.set(jobId, { state: "running" });
    const completion = (async () => {
      let status;
      try {
        const raw = await provider(req);
        const entry = normalizeEntry(raw, req, jobId);
        if (validateEntry) {
          const { ok } = validateEntry(entry);
          if (!ok) throw new NormalizeFailedError("normalized entry failed AssetEntry schema validation");
        }
        const assetId = registry.register(entry); // may throw LICENSE_MISSING / INVALID_ASSET_ENTRY
        status = { state: "done", assetId };
        jobs.set(jobId, status);
        fire("gen.completed", { jobId, assetId });
      } catch (err) {
        // err may be anything a rejected provider throws, including null/undefined; never re-throw here
        // (completion must resolve, not reject, and a fire-and-forget caller must not see an unhandled one)
        const error = err?.code ?? String(err?.message ?? "GEN_FAILED");
        status = { state: "failed", error };
        jobs.set(jobId, status);
        fire("gen.failed", { jobId, error });
      }
      return status;
    })();

    return { jobId, completion };
  }

  return {
    generate,
    status(jobId) {
      return jobs.get(jobId) ?? { state: "failed", error: "unknown job" };
    },
  };
}
