// runtime - buildings that arrive as files.
//
// A mass whose `assetRef` names a `building` in the catalog is not drawn from its box: the file IS
// the building. The box stands in its place while the file is on its way, so the street is walkable
// from the first frame, and stays there if the file never arrives (ASSET_LOAD_FAILED: warn, never
// crash the scene).

import * as THREE from "three";

/**
 * The default loader. Made lazily, and only when there is something to load, so a head-less test
 * never touches it.
 *
 * @param {string} [base] where the files are served from, e.g. "assets"
 */
export function createGlbLoader(base = "") {
  let loader;
  return async (url) => {
    if (!loader) {
      const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
      loader = new GLTFLoader();
    }
    const full = base && !/^([a-z]+:)?\/\//i.test(url) ? `${base.replace(/\/$/, "")}/${url}` : url;
    const gltf = await loader.loadAsync(full);
    return gltf.scene;
  };
}

/**
 * Stand every pending file in the scene.
 *
 * @param {Array<{holder: THREE.Object3D, standIn: THREE.Object3D, entry: object}>} pending
 * @param {(url:string)=>Promise<THREE.Object3D>} load
 * @param {(msg:string)=>void} [warn]
 * @returns {Promise<{ loaded: number, failed: number }>}
 */
export async function attachModels(pending, load, warn = console.warn) {
  // One fetch per file however many times it stands in the city: a repeated building is a clone,
  // which shares its geometry and its materials. The cache lives as long as this call, so a scene
  // that is torn down never leaves a disposed model behind for the next one.
  const byUrl = new Map();
  const fetchOnce = (url) => {
    if (!byUrl.has(url)) byUrl.set(url, load(url));
    return byUrl.get(url);
  };

  let loaded = 0;
  let failed = 0;
  await Promise.all(
    pending.map(async ({ holder, standIn, entry }) => {
      try {
        const model = (await fetchOnce(entry.glbUrl)).clone(true);
        const [ax, ay, az] = entry.anchor ?? [0, 0, 0];
        model.position.set(ax, ay, az);
        model.traverse((node) => {
          if (!node.isMesh) return;
          node.castShadow = true;
          node.receiveShadow = true;
        });
        holder.add(model);
        holder.remove(standIn);
        disposeStandIn(standIn);
        loaded++;
      } catch (err) {
        // The mass it was standing behind stays: a building you cannot see through is better than a
        // hole in the street.
        warn(`asset "${entry.id}" could not be loaded (${err?.code ?? err?.message ?? err}); the mass stands instead`);
        failed++;
      }
    })
  );
  return { loaded, failed };
}

function disposeStandIn(mesh) {
  mesh.geometry?.dispose?.();
  const material = mesh.material;
  if (Array.isArray(material)) material.forEach((m) => m.dispose?.());
  else material?.dispose?.();
}
