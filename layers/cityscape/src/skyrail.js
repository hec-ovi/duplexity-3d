// runtime - the rails over the city.
//
// Elevated guideway threading between the towers, with a train running along it. Nothing is
// simulated: a train runs its line, wraps round and runs it again. It is scenery you look up at, and
// it is most of what makes a skyline read as a working city rather than a model of one.
//
// A deck, its pylons in one instanced mesh, and a train of cars in another: four draws a line.

import * as THREE from "three";

const LINES = 2;
const HEIGHT = { low: 19, step: 9 }; // decks well clear of anything you can climb
const DECK = { thickness: 0.9, width: 3.4 };
const PYLON = { every: 30, thickness: 1.1 };
const CAR = { length: 11, width: 2.6, height: 2.8, gap: 1.2, count: 4 };
const COLOURS = { deck: 0x1d2430, car: 0x2a323f, window: "#bfe4ff", edge: "#6ad8ff" };
const EDGE = { thickness: 0.14 }; // the lit rail down each side of a deck

const matte = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.35, ...extra });

const burning = (colour, intensity) =>
  new THREE.MeshStandardMaterial({
    color: 0x111111,
    emissive: new THREE.Color(colour),
    emissiveIntensity: intensity,
    roughness: 0.4,
  });

/**
 * @param {{minX:number,maxX:number,minZ:number,maxZ:number}} bounds  the ground below
 * @param {Function} next  a seeded 0..1 generator: the same city gets the same rails
 * @returns {{ group: THREE.Group, update(elapsed:number): void, dispose(): void }}
 */
export function createSkyRail(bounds, next) {
  const pick = (list) => list[Math.floor(next() * list.length)];
  const range = (min, max) => min + next() * (max - min);
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;

  const group = new THREE.Group();
  group.name = "skyrail";
  const trains = [];
  const at = new THREE.Object3D();

  for (let i = 0; i < LINES; i++) {
    const alongX = i % 2 === 0;
    const span = alongX ? width : depth;
    const y = HEIGHT.low + i * HEIGHT.step + range(-2, 2);
    // Each line runs over a street rather than through the middle of a block.
    const across = alongX
      ? bounds.minZ + depth * pick([0.28, 0.52, 0.74])
      : bounds.minX + width * pick([0.32, 0.66]);
    const from = alongX ? bounds.minX : bounds.minZ;

    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(alongX ? span : DECK.width, DECK.thickness, alongX ? DECK.width : span),
      matte(COLOURS.deck)
    );
    deck.position.set(alongX ? bounds.minX + span / 2 : across, y, alongX ? across : bounds.minZ + span / 2);
    deck.castShadow = false;
    deck.name = `skyrail:${i}:deck`;
    group.add(deck);

    // A lit rail down each edge of the deck, so the line reads across the city after dark instead of
    // being a dark beam over the street.
    for (const side of [-1, 1]) {
      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(alongX ? span : EDGE.thickness, EDGE.thickness, alongX ? EDGE.thickness : span),
        burning(COLOURS.edge, 1.5)
      );
      edge.position.set(
        alongX ? deck.position.x : across + (side * DECK.width) / 2,
        y + DECK.thickness / 2,
        alongX ? across + (side * DECK.width) / 2 : deck.position.z
      );
      edge.userData = { kind: "light" };
      group.add(edge);
    }

    const legs = Math.max(2, Math.floor(span / PYLON.every));
    const pylons = new THREE.InstancedMesh(
      new THREE.BoxGeometry(PYLON.thickness, y, PYLON.thickness),
      matte(COLOURS.deck),
      legs
    );
    for (let k = 0; k < legs; k++) {
      const along = from + (span * (k + 0.5)) / legs;
      at.position.set(alongX ? along : across, y / 2, alongX ? across : along);
      at.rotation.set(0, 0, 0);
      at.updateMatrix();
      pylons.setMatrixAt(k, at.matrix);
    }
    pylons.instanceMatrix.needsUpdate = true;
    pylons.computeBoundingSphere?.();
    if (!pylons.boundingSphere) pylons.frustumCulled = false;
    group.add(pylons);

    // The train itself: cars, a lit strip down each side, and a light on the front.
    const bodies = new THREE.InstancedMesh(
      new THREE.BoxGeometry(alongX ? CAR.length : CAR.width, CAR.height, alongX ? CAR.width : CAR.length),
      matte(COLOURS.car),
      CAR.count
    );
    const glass = new THREE.InstancedMesh(
      new THREE.BoxGeometry(
        alongX ? CAR.length * 0.82 : CAR.width + 0.06,
        CAR.height * 0.34,
        alongX ? CAR.width + 0.06 : CAR.length * 0.82
      ),
      burning(COLOURS.window, 1.5),
      CAR.count
    );
    bodies.frustumCulled = false;
    glass.frustumCulled = false;
    glass.userData = { kind: "light" };
    group.add(bodies, glass);

    trains.push({
      alongX,
      across,
      y: y + DECK.thickness / 2 + CAR.height / 2,
      from,
      span,
      speed: range(24, 38) * (next() < 0.5 ? 1 : -1),
      bodies,
      glass,
    });
  }

  function update(elapsed) {
    for (const train of trains) {
      const head = (((elapsed * train.speed) / train.span) % 1 + 1) % 1;
      for (let c = 0; c < CAR.count; c++) {
        const back = c * (CAR.length + CAR.gap) * Math.sign(train.speed);
        const along = train.from + ((head * train.span - back + train.span * 2) % train.span);
        const x = train.alongX ? along : train.across;
        const z = train.alongX ? train.across : along;
        at.rotation.set(0, 0, 0);
        at.position.set(x, train.y, z);
        at.updateMatrix();
        train.bodies.setMatrixAt(c, at.matrix);
        at.position.set(x, train.y + CAR.height * 0.16, z);
        at.updateMatrix();
        train.glass.setMatrixAt(c, at.matrix);
      }
      train.bodies.instanceMatrix.needsUpdate = true;
      train.glass.instanceMatrix.needsUpdate = true;
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
