# surfaces

Takes a seed and somewhere to draw; paints a road, a pavement, a plaza, plain concrete, or the whole
outside of a building; returns how to make a material out of it.

```js
import { paintSurface } from "./src/index.js";

const ctxFor = (map, w, h) => {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas.getContext("2d");
};

paintSurface("road", ctxFor, { seed: "ashgate" });
paintSurface("facade", ctxFor, { seed: "mass-ashgate-b1", metresWide: 14, floors: 6, program: "office" });
```

No three.js, no `document`: the canvas comes from the caller, so the same code runs in a test with a
stub that just records what was drawn.

Some surfaces have a photographed material instead, all of it CC0 (public domain) from Poly Haven:

```bash
npm run textures     # fetches them into app/public/textures (not committed)
```

```js
photoSurface("road");
// { slug: "asphalt_02", metres: [3, 3], maps: { albedo: "asphalt_02/albedo.jpg", ... } }
```

`materials/manifest.json` says which material stands in for which surface. Without the files,
`photoSurface` returns null and the painted surfaces are used, so the project runs either way.

See [CONTRACT.md](CONTRACT.md).
