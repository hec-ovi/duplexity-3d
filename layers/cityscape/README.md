# cityscape

Takes a scene model; returns the city you look at, and one call that moves it.

```js
import { createCityscape } from "./src/index.js";

const city = createCityscape(model, { paintSurface, photoSurface, textureBase, dressFacade, registry });
scene.add(city.group);

// every frame
city.update(elapsed, dt, camera.position);
city.syncNpcs(npcs, camera, dt);
```

Everything in one group: ground and buildings, windows and balconies, the five kinds of front door,
lamps and the haze under them, parked vehicles and traffic lights, rails with trains on them, flying
traffic, projected figures, and the shuttle you can ride. Everything alike is drawn together, so a
city of thousands of parts is a few hundred draws.

It authors nothing. Where things stand comes from the model; what they are painted like and what is
bolted to a building are other boxes, handed in.

See [CONTRACT.md](CONTRACT.md).
