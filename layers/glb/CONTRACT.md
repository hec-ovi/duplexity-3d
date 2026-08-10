# glb - Contract

## Purpose
Say what is inside a GLB file: how big the thing is in metres, where it stands relative to its own
origin, and what it costs to draw. It reads the glTF document, never the geometry, so measuring a
forty floor tower costs the same as measuring a crate.

## Inputs (params in)
- `measure(bytes) -> GlbFacts` - `bytes` is the whole GLB file as a `Uint8Array` or `ArrayBuffer`.
  This layer never touches the filesystem or the network; the caller reads the file.

## Outputs (params out)
- `GlbFacts` - `{ size, min, max, anchor, nodes, meshes, materials, triangles, bytes }`, lengths in
  metres to the millimetre. schema: [schema/glb-facts.json](schema/glb-facts.json)
  - `size` is width, height, depth: what a plot has to be big enough to hold.
  - `anchor` is the move that puts the piece centred over its own footprint with its base at y=0,
    which is where a city stands a building. A file already written that way anchors at `[0, 0, 0]`.

## Events
None. It answers a question and holds nothing.

## Errors
- `GLB_INVALID` - not a GLB container: wrong magic, a version other than 2, a chunk running past the
  end, or no JSON chunk.
- `GLB_UNMEASURABLE` - a GLB whose size cannot be known: nothing in the scene has geometry, or a
  `POSITION` accessor carries no `min`/`max` (glTF requires them).

## Invariants this layer will never break
- Measurement is the scene as it will be drawn: every node's own transform and its parents' are
  applied, and a rotated node measures its true extent (all eight corners are transformed, never
  just two).
- Nothing is guessed. A file that cannot be measured raises `GLB_UNMEASURABLE` rather than returning
  a size.
- Deterministic: the same bytes always measure to the same numbers, rounded to the millimetre.
- No renderer, no filesystem, no network. Pure bytes in, facts out.

## Dependencies (contracts only)
None. Leaf layer.

## How to modify this blackbox safely
Read more facts out of the document (which materials it names, whether it needs an extension) by
adding fields to `GlbFacts` additively. Keep `tests/` green: a real GLB measures to its true size, a
nested and rotated node is measured where it ends up, a file already centred on its footprint anchors
at zero, and both errors are raised rather than papered over.
