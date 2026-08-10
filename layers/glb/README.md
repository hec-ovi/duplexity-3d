# glb

Takes a GLB file, returns its facts: how big it is in metres, the move that stands it on the ground
over its own footprint, and what it costs to draw. Leaf layer, no renderer, no filesystem.

## Entry point (see CONTRACT.md)

- `measure(bytes) -> GlbFacts`

## Status

`src/container.js` splits the GLB into its glTF document and its binary chunk; `src/bounds.js` walks
the scene applying every node transform and unions the boxes glTF stores on each `POSITION`
accessor. No geometry is read, which is why a tower measures as fast as a crate.

This is what lets a city import a building somebody else built: measure it, and the plot is laid out
to its real footprint instead of the building being squashed into a plot.

## Run the tests

`npm test`. Builds GLBs byte by byte and measures them: a plain box, a nested and rotated node, one
already centred on its footprint, and the two ways a file refuses to be measured.

## Modify safely

Add facts to `GlbFacts` additively inside this folder.
