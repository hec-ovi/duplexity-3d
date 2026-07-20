# asset-gen

Generate or enrich 3D assets and register the results in `asset-registry`. Optional and
non-blocking: the engine is fully playable from curated kits alone, so nothing depends on this
layer directly.

## Entry points (see CONTRACT.md)

- `generate({ kind, prompt?, image?, targetSpec }) -> { jobId }`
- `status(jobId) -> { state, assetId?, error? }`

## Phase 1 status (stub)

`createAssetGen({ provider, registry })` takes both as injected dependencies. `provider` is the
`providers/gen3d` adapter (ComfyUI on the AMD box or a cloud API, per 04-TECH-STACK.md); `registry`
is `asset-registry`. A successful job registers a normalized, licensed AssetEntry and reports
`done`. A provider that is missing or throws produces a `failed` job and registers nothing, which is
the "engine runs whether this layer is present, absent, or failing" invariant.

## Run the tests

`npm test`. Covers a successful generation (asset registered, status done) and a failing generator
(graceful `failed`, nothing registered), both with the registry mocked at its contract.
