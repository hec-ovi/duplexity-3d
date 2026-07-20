# runtime fixtures

The runtime consumes the canonical Adventure document, so its tests load the shared example at
`layers/persistence/fixtures/adventure.example.json` rather than duplicating it here. Layer-specific
fixtures (a saved play-time scene, recorded input sequences) land in this folder as the runtime
gains real three.js behavior in Phase 2.
