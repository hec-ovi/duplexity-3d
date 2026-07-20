// asset-gen - generate/enrich 3D assets and register them, optionally and without blocking play.
// Both the generator provider and the asset-registry are injected; this src imports no other
// layer's src. Nothing depends on this layer, so its absence or failure never affects the engine.

export function createAssetGen({ provider, registry } = {}) {
  const jobs = new Map();
  let n = 0;

  return {
    generate(req) {
      const jobId = `job-${++n}`;
      try {
        if (!provider) {
          throw Object.assign(new Error("no generator configured"), { code: "PROVIDER_UNAVAILABLE" });
        }
        const asset = provider(req); // provider normalizes to a licensed AssetEntry
        const assetId = registry.register(asset);
        jobs.set(jobId, { state: "done", assetId });
      } catch (err) {
        jobs.set(jobId, { state: "failed", error: err.code ?? String(err.message ?? "PROVIDER_UNAVAILABLE") });
      }
      return { jobId };
    },

    status(jobId) {
      return jobs.get(jobId) ?? { state: "failed", error: "unknown job" };
    },
  };
}
