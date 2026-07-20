# asset-gen - Contract

## Purpose
Generate or enrich 3D assets asynchronously and register the results in `asset-registry`. Optional
and non-blocking: the engine is fully playable from curated kits alone; this layer only enriches the
catalog over time (ComfyUI on the local AMD box, or a cloud API, behind a provider adapter).

## Inputs (params in)
- `generate({ kind, prompt?, image?, targetSpec }) -> { jobId }` - request an asset. `targetSpec`
  carries the required bbox/snap grid so the output is drop-in for the solver.
  schema: `schema/gen-request.json`
- `status(jobId) -> { state: queued|running|done|failed, assetId?, error? }` - poll a job.

## Outputs (params out)
- Eventually an `assetId` registered in `asset-registry` (via its `register` contract), normalized
  to glTF/GLB with an accurate bbox, snap points, and a resolved license.
- job status objects. schema: `schema/gen-status.json`

## Events
`gen.completed(jobId, assetId)` and `gen.failed(jobId, error)`.

## Errors
- `PROVIDER_UNAVAILABLE` - the configured generator is down; job fails cleanly, nothing else breaks.
- `NORMALIZE_FAILED` - output could not be made into a valid, licensed `AssetEntry`; not registered.

## Invariants this layer will never break
- The rest of the engine runs unchanged whether this layer is present, absent, or failing.
- It only ever registers assets with a known, commercial-use-clear license and a valid bbox/snap
  grid (else it drops them).
- It never mutates play-time state or blocks a play session.

## Dependencies (contracts only)
- `providers/gen3d` adapter (ComfyUI HTTP/websocket on AMD, or a cloud API), `asset-registry`
  (write). Nothing depends on this layer directly.

## How to modify this blackbox safely
Swap the generator (local vs cloud), change the pipeline, or add asset kinds inside this folder. The
only outward effect is new entries appearing in `asset-registry` through its contract. Keep
`tests/` green: a disabled/failed generator degrades gracefully; a successful mock job registers a
schema-valid, licensed `AssetEntry`. See [04-TECH-STACK.md](../../04-TECH-STACK.md) for the current
verdict on local AMD/ComfyUI feasibility vs API.
