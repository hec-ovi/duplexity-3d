// runtime - what is moving in the sky.
//
// A city with nothing in the air over it is a model of a city. This is the cheapest thing that
// fixes that: lanes of lights crossing above the rooftops, each one a bright head with a streak
// behind it. Nothing is simulated. They run down a lane, wrap round, and run it again.
//
// One instanced mesh for the heads and one for the streaks, so a hundred of them cost two draws.

import * as THREE from "three";

const LANES = 5;
const PER_LANE = 9;
const HEAD = [0.9, 0.5, 2.2];
const TRAIL = [0.22, 0.14, 14];
const COLOURS = ["#ff6b8a", "#7cd8ff", "#ffd18a", "#c79bff", "#8fffc4"];

/**
 * @param {{minX:number,maxX:number,minZ:number,maxZ:number}} bounds  the ground below
 * @param {Function} next  a seeded 0..1 generator: the same city has the same traffic over it
 */
export function createTraffic(bounds, next) {
  const rng = {
    next,
    range: (min, max) => min + next() * (max - min),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
  };
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const group = new THREE.Group();
  group.name = "traffic";

  const lanes = [];
  for (let i = 0; i < LANES; i++) {
    const alongX = rng.chance(0.5);
    lanes.push({
      alongX,
      // well clear of anything you can climb, and each lane at its own height
      y: 55 + i * 16 + rng.range(-4, 4),
      across: alongX
        ? bounds.minZ + depth * rng.range(0.1, 0.9)
        : bounds.minX + width * rng.range(0.1, 0.9),
      speed: rng.range(14, 26) * (rng.chance(0.5) ? 1 : -1),
      span: alongX ? width * 2.2 : depth * 2.2,
      from: alongX ? bounds.minX - width * 0.6 : bounds.minZ - depth * 0.6,
      colour: rng.pick(COLOURS),
    });
  }

  const heads = [];
  const dummy = new THREE.Object3D();
  for (const lane of lanes) {
    const material = new THREE.MeshStandardMaterial({
      color: 0x111111,
      emissive: new THREE.Color(lane.colour),
      emissiveIntensity: 2.6,
      roughness: 0.5,
    });
    const trailMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      emissive: new THREE.Color(lane.colour),
      emissiveIntensity: 0.85,
      transparent: true,
      opacity: 0.4,
      roughness: 0.6,
    });
    const head = new THREE.InstancedMesh(new THREE.BoxGeometry(...HEAD), material, PER_LANE);
    const trail = new THREE.InstancedMesh(new THREE.BoxGeometry(...TRAIL), trailMat, PER_LANE);
    head.frustumCulled = false;
    trail.frustumCulled = false;
    head.userData = { kind: "light" };
    trail.userData = { kind: "light" };
    group.add(head, trail);
    heads.push({ lane, head, trail, offsets: Array.from({ length: PER_LANE }, () => rng.next()) });
  }

  function update(elapsed) {
    for (const { lane, head, trail, offsets } of heads) {
      for (let i = 0; i < offsets.length; i++) {
        const t = (offsets[i] + (elapsed * lane.speed) / lane.span) % 1;
        const at = lane.from + ((t + 1) % 1) * lane.span;
        const x = lane.alongX ? at : lane.across;
        const z = lane.alongX ? lane.across : at;
        const turn = lane.alongX ? Math.PI / 2 : 0;

        dummy.position.set(x, lane.y, z);
        dummy.rotation.set(0, turn, 0);
        dummy.updateMatrix();
        head.setMatrixAt(i, dummy.matrix);

        // the streak sits behind the head, along the lane
        const back = Math.sign(lane.speed) * -(TRAIL[2] / 2 + HEAD[2] / 2);
        dummy.position.set(lane.alongX ? x + back : x, lane.y, lane.alongX ? z : z + back);
        dummy.updateMatrix();
        trail.setMatrixAt(i, dummy.matrix);
      }
      head.instanceMatrix.needsUpdate = true;
      trail.instanceMatrix.needsUpdate = true;
    }
  }
  update(0);

  return {
    group,
    update,
    dispose() {
      group.traverse((node) => {
        node.geometry?.dispose?.();
        node.material?.dispose?.();
      });
    },
  };
}
