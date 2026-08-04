# surfaces - Contract

## Purpose
Paint what the city is made of: asphalt, pavement, plaza, concrete, a whole building's outside
(windows, ledges, shopfront, parapet) as one sheet, and the lettering on a cartel. It draws onto a 2D drawing context you hand it
and returns the recipe for turning that into a material. It knows nothing about three.js, the DOM, or
what a building is for beyond how it should look.

## Inputs (params in)
- `paintSurface(kind, ctxFor, opts?) -> SurfacePlan`
  - `kind`: `road` | `pavement` | `plaza` | `concrete` | `facade` | `sign`.
  - `ctxFor(map, width, height)`: injected canvas factory. Called once per map the surface needs
    (`albedo`, and `emissive` for a facade) and must return a 2D drawing context of that size. The
    caller owns the canvas; this layer only draws on it.
  - `opts.seed?`: a number or a string. The same seed paints the same surface, always.
  - Facade only: `opts.metresWide` (frontage to cover), `opts.floors`, `opts.storeyHeight` (3.2),
    `opts.litRatio` (0.45), `opts.program` (a `house` keeps windows on the ground floor; anything
    else gets a glazed shopfront).
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
Colours live in `src/palette.js` and nowhere else. The ground surfaces are `src/ground.js`, one
painter each; a building's outside is `src/facade.js`, split into planning (where every window,
ledge and band goes) and two painters that read that plan. Add a surface by adding a painter, a
palette entry and a line in `GROUND` or a branch in `paintSurface`. A cartel is `src/sign.js`. Keep `tests/` green: the same
seed paints the same calls, a facade's lit windows are all real windows, tiles cover the metres they
claim, and an unusable canvas factory is refused rather than half-drawn.
