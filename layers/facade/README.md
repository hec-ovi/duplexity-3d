# facade

Takes the shape of a building; returns what is bolted to it and what it is called.

```js
import { dressFacade } from "./src/index.js";

dressFacade({
  id: "mass-ashgate-b1",
  size: { w: 12, h: 20.2, d: 9 },
  floors: 6,
  program: "apartments",
  door: { face: "south", along: 0 },
});
// { name: "MARU HOUSE", parts: [ { kind: "balcony", ... }, { kind: "sign", text: "MARU HOUSE", ... } ] }
```

Parts come back in the building's own frame (origin in the middle of its footprint, on the ground)
with the turn that points each one out of its wall. No three.js, no DOM: it returns numbers.

See [CONTRACT.md](CONTRACT.md).
