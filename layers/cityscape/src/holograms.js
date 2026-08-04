// runtime - the figures projected on the buildings.
//
// Some panels are not panels: they are a projector on the wall and a figure standing in the air in
// front of it. This builds that - the image itself, hung clear of the wall and burning, plus the
// cone of haze the projector throws, so it reads as light in the air rather than a poster.
//
// The image comes from the same painter every other panel uses. Nothing is redrawn per frame: the
// scan drifts by moving the texture over the surface, which costs nothing.

import * as THREE from "three";

const STAND = 1.2; // metres the figure stands off the wall
const SCAN = 0.06; // how fast the scan drifts, in texture heights per second
const FLICKER = { depth: 0.12, rate: 6.3 }; // how much the projection wavers, and how quickly

/**
 * @param {object[]} parts  advert parts carrying `holo`, already in world metres
 * @param {object} [deps]
 * @param {Function} [deps.advertMaterial]  (part) -> Material[]: the same faces a panel wears
 * @returns {{ group: THREE.Group, update(elapsed:number): void }|null}
 */
export function buildHolograms(parts, { advertMaterial } = {}) {
  const holos = (parts ?? []).filter((p) => p.kind === "advert" && p.holo);
  if (holos.length === 0) return null;

  const group = new THREE.Group();
  group.name = "holograms";
  const projected = [];

  for (const part of holos) {
    const [across, up] = part.size;
    const faces = advertMaterial?.(part);
    // Index 4 is the +z face: the one a panel is read off. Without a painter there is nothing to
    // project, so the panel is left as it is.
    const face = Array.isArray(faces) ? faces[4] : faces;
    if (!face) continue;

    const material = face.clone();
    material.map = face.map?.clone();
    material.emissiveMap = face.emissiveMap?.clone();
    if (material.map) material.map.needsUpdate = true;
    if (material.emissiveMap) material.emissiveMap.needsUpdate = true;
    material.transparent = true;
    material.opacity = 0.72;
    material.depthWrite = false;
    material.blending = THREE.AdditiveBlending;
    material.side = THREE.DoubleSide;
    material.emissiveIntensity = 1.6;

    const figure = new THREE.Mesh(new THREE.PlaneGeometry(across, up), material);
    figure.userData = { kind: "light" };
    figure.name = `holo:${part.graphic ?? part.text ?? ""}`;
    figure.rotation.y = part.facing;
    place(figure, part, STAND);
    group.add(figure);

    // The cone of haze between the wall and the figure: what the projector is throwing.
    const haze = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(across, up) * 0.42, STAND, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(part.colour ?? "#7cd8ff"),
        transparent: true,
        opacity: 0.05,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    haze.userData = { kind: "light" };
    // A cone stands up the y axis with its tip at the top. Laid over so the tip is AT the wall, it
    // is the beam: narrow where it leaves the projector, wide where the figure stands.
    const sin = Math.sin(part.facing);
    const cos = Math.cos(part.facing);
    haze.quaternion.setFromUnitVectors(UP, new THREE.Vector3(-sin, 0, -cos));
    place(haze, part, STAND / 2);
    group.add(haze);

    projected.push({ material, haze, phase: Math.abs(Math.round(part.position[1] * 7)) % 10 });
  }

  if (projected.length === 0) return null;

  function update(elapsed) {
    for (const { material, haze, phase } of projected) {
      const waver = 1 - FLICKER.depth * (0.5 + 0.5 * Math.sin(elapsed * FLICKER.rate + phase));
      material.opacity = 0.72 * waver;
      haze.material.opacity = 0.05 * waver;
      if (material.emissiveMap) material.emissiveMap.offset.y = (elapsed * SCAN) % 1;
      if (material.map) material.map.offset.y = (elapsed * SCAN) % 1;
    }
  }
  update(0);

  return { group, update };
}

const UP = new THREE.Vector3(0, 1, 0);

// Put a thing `out` metres in front of the panel it belongs to. A mesh that has already been turned
// (the beam) keeps the orientation it was given.
function place(mesh, part, out) {
  const [x, y, z] = part.position;
  mesh.position.set(x + Math.sin(part.facing) * out, y, z + Math.cos(part.facing) * out);
  return mesh;
}
