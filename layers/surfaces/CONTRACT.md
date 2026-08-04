# surfaces - Contract

## Purpose
Paint what the city is made of: asphalt, pavement, plaza, concrete, a whole building's outside
(windows, ledges, shopfront, parapet) as one sheet, and the lettering on a cartel. It draws onto a 2D drawing context you hand it
and returns the recipe for turning that into a material. It knows nothing about three.js, the DOM, or
what a building is for beyond how it should look.

## Inputs (params in)
- `paintSurface(kind, ctxFor, opts?) -> SurfacePlan`
  - `kind`: `road` | `pavement` | `plaza` | `floor` | `wall` | `ceiling` | `concrete` | `facade` |
    `window` | `sign`.
  - `ctxFor(map, width, height)`: injected canvas factory. Called once per map the surface needs
    (`albedo`, and `emissive` for a facade) and must return a 2D drawing context of that size. The
    caller owns the canvas; this layer only draws on it.
  - `opts.seed?`: a number or a string. The same seed paints the same surface, always.
  - Facade only: `opts.metresWide` (frontage to cover), `opts.floors`, `opts.storeyHeight` (3.2),
    `opts.litRatio` (0.45), `opts.program` (a `house` keeps windows on the ground floor; anything
    else gets a glazed shopfront).
  - Window only: `opts.lit`, `opts.colour` (what burns behind the glass) and `opts.blind`. One window,
    painted on its own: a frame, the bars across it, and what is behind them. A building's windows are
    separate objects, so this is worn by one at a time rather than tiled over a whole wall.
  - Sign only: `opts.text` (what it says), `opts.colour` (what it burns), `opts.metresWide` and
    `opts.metresTall` (the board). The type is sized off the board and the length of the name rather
    than measured, so a sign can be painted anywhere, including against a recording stub.
  - Road only: `opts.wet` (0 dry, the default, to 1 soaked). Wet asphalt goes darker, holds standing
    water, and comes back smoother, so the lamps reflect down it.

## Outputs (params out)
- `SurfacePlan` - `{ kind, pixels, metres, maps, material, lit?, signColour? }`. `maps` holds whatever
  `ctxFor` returned, by name. `metres` is how much world ONE TILE covers, so the repeat for a surface
  is its size divided by that. `signColour` is what a shopfront burns over its door, so a light put
  there can match it. schema: [schema/surface-plan.json](schema/surface-plan.json)

- `photoSurface(kind) -> PhotoMaterial|null` - the PHOTOGRAPHED material catalogued for a surface, if
  there is one: map file names relative to wherever the caller keeps them, how much world one tile
  covers, and how it takes light. Everything catalogued is CC0 (public domain) from Poly Haven, listed
  in [materials/manifest.json](materials/manifest.json) and fetched by `npm run textures`. Null means
  paint it instead, which is what happens when the files have not been fetched.
- `PHOTO_MATERIALS` - the whole catalogue, for a credits screen or a licence check.

## Errors
- `UNKNOWN_SURFACE` - no surface goes by that name.
- `NO_CANVAS` - the canvas factory returned nothing that can be drawn on.

## Invariants this layer will never break
- Deterministic: no `Math.random`, no clock. The same seed and options paint the same surface.
- A ground tile joins itself: no mark is drawn across a tile edge, so a large road or pavement has no
  visible seam grid.
- A facade's albedo and emissive maps are painted from ONE plan, so a window that glows is always a
  window that is there, in the same place, at the same size. A sign is painted the same way: the
  letters that burn are the letters on the board.
- A facade sheet is laid out from the ground up: storey 1 is at the bottom of the image, one row of
  bays per storey, so the rows land on the storeys of the building it is wrapped around.
- Nothing is imported but its own `src/`: no three.js, no `document`, no canvas of its own.

## Dependencies (contracts only)
None. It is a leaf: give it somewhere to draw and it draws.

## How to modify this blackbox safely
Which photographed material stands in for which surface is `materials/manifest.json`: a slug, how
big one tile is in the real world, and how it takes light. Nothing else needs to change to swap one.
Colours for the painted fallbacks live in `src/palette.js` and nowhere else. The ground surfaces are `src/ground.js`, one
painter each; a building's outside is `src/facade.js`, split into planning (where every window,
ledge and band goes) and two painters that read that plan. Add a surface by adding a painter, a
palette entry and a line in `GROUND` or a branch in `paintSurface`. A cartel is `src/sign.js`. Keep `tests/` green: the same
seed paints the same calls, a facade's lit windows are all real windows, tiles cover the metres they
claim, and an unusable canvas factory is refused rather than half-drawn.
