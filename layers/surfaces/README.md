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

See [CONTRACT.md](CONTRACT.md).
