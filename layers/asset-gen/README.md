# asset-gen

Generate or enrich 3D assets and register the results in `asset-registry`. Optional and
non-blocking: the engine is fully playable from curated kits alone, so nothing depends on this
layer directly.

## Entry points (see CONTRACT.md)

- `generate({ kind, prompt?, image?, targetSpec }) -> { jobId, completion }`
- `status(jobId) -> { state, assetId?, error? }`

## Status

`createAssetGen({ provider, registry, emit? })` takes each as an injected dependency. `provider` is the
`providers/gen3d` adapter (ComfyUI/TRELLIS.2 on the AMD box or a cloud API, per 04-TECH-STACK.md);
`registry` is `asset-registry`. `generate` returns immediately with a `jobId` and a `completion`
Promise; a job runs async and eventually registers a normalized, licensed AssetEntry (`done`) or fails
cleanly (`failed`), never blocking and never throwing to the caller.

Normalization is the gate: a raw provider result is turned into a valid AssetEntry (bbox filled from
`targetSpec` when missing, `source: "generated"`, a required `glbUrl`), and it is registered ONLY if the
license is in the commercial-use-clear allow-list and a `character` declares its animations; otherwise
it is dropped with `NORMALIZE_FAILED`. With no provider, generation is disabled and every request fails
with `PROVIDER_UNAVAILABLE`, registering nothing. This is the "engine runs whether this layer is present,
absent, or failing" invariant.

## Run the tests

`npm test`. Unit tests cover the async lifecycle (running before completion), a successful registration
(schema-valid, licensed, `source: generated`), a character preserving its animations, graceful disable
and provider failure, and dropping a non-clear license or an animation-less character (`NORMALIZE_FAILED`),
with the registry mocked at its contract. The composition-root integration test
(`server/asset-enrichment.test.js`) proves a generated themed kit unblocks a theme the seed registry could
not build and that scenario-creator, npc, and the runtime pick the generated assets up.
