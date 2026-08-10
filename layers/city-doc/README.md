# city-doc

Takes a street level, returns the city as assets and coordinates: which files it uses, what stands
where, what the ground is, where the doors and the lights are. And reads one back. Leaf layer.

This is to a city what a GLB is to one building. The buildings toolkit writes the files; this writes
the coordinates they stand at, so a city and the buildings in it are made by two tools that never
have to know about each other.

## Entry points (see CONTRACT.md)

- `toCityDoc(instance, { assetFor?, fileFor? }) -> CityDoc`
- `fromCityDoc(doc) -> { instance, assets }`

## Status

`src/write.js` writes one, `src/read.js` reads one, and the format is `duplexity-city/1`. The cast,
the goals and what is behind each door stay out: they are the game, not the fabric. Interiors get a
document of their own, in the same shape, later.

## Run the tests

`npm test`. A city round trips unchanged, a building that is a file carries its asset while a plain
mass does not, and both refusals are proved.

## Modify safely

Add fields additively inside this folder. `format` is bumped only when an older reader would break.
