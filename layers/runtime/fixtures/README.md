# runtime fixtures

The runtime consumes the canonical Adventure document, so its tests load the shared example at
`layers/persistence/fixtures/adventure.example.json` rather than duplicating it here.

`scene-model.example.json` is what `buildSceneModel` makes of the first instance in that example:
the published shape of a SceneModel. Anything downstream of the runtime (`cityscape`) is held to
this file rather than to the code that produces it. Regenerate it when the shape changes:

```bash
node -e 'import("./layers/runtime/src/scene-model.js").then(async (m) => {
  const fs = await import("node:fs");
  const adv = JSON.parse(fs.readFileSync("layers/persistence/fixtures/adventure.example.json", "utf8"));
  fs.writeFileSync("layers/runtime/fixtures/scene-model.example.json",
    JSON.stringify(m.buildSceneModel(adv.instances[0]), null, 2) + "\n");
})'
```
