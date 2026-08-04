// runtime - the blueprint overlay.
//
// Draws the current floor from above onto a 2D canvas: the rooms you have walked into, the doors on
// their walls, and where you are standing. It draws exactly what `runtime.blueprint()` hands over, and
// that never contains a room the player has not entered, so the unexplored part of a floor cannot leak
// through the map.
//
// Takes a canvas context rather than reaching for the DOM, so it renders in a jsdom test.

const STYLE = {
  paper: "rgba(9, 12, 16, 0.82)",
  ink: "#5f7a8c",
  inkHere: "#8fd0ff",
  fill: "rgba(95, 122, 140, 0.16)",
  fillHere: "rgba(143, 208, 255, 0.2)",
  door: "#9fb4c2",
  doorShut: "#c2564f",
  stairs: "#d9b45c",
  exit: "#7fd39b",
  block: "rgba(159, 180, 194, 0.5)",
  player: "#ffffff",
  label: "#9fb4c2",
};

const DOOR_COLOR = {
  room: STYLE.door,
  enter: STYLE.door,
  leave: STYLE.door,
  stairs_up: STYLE.stairs,
  stairs_down: STYLE.stairs,
  elevator_up: STYLE.stairs,
  elevator_down: STYLE.stairs,
  exit: STYLE.exit,
};

// How much ground to show: enough to take in the room you are standing in, whether that is a 5 metre
// bedroom or an 88 metre city. It depends on where you ARE, never on how much you have discovered, so
// walking into a new room slides the map rather than rescaling everything you had learned to read.
function scaleFor(plan, width, height) {
  const here = plan.rooms.find((r) => r.here) ?? plan.rooms[0];
  const span = Math.max(here.max.x - here.min.x, here.max.z - here.min.z);
  const view = Math.min(90, Math.max(14, span * 1.25));
  return view / Math.min(width, height);
}

// The player stays in the middle at a FIXED scale, and the world slides under them. Discovering a room
// must not rescale the whole map: a plan that refit itself every time it grew would shrink the room you
// are standing in and move everything you had learned to read.
function centredOn(plan, width, height, metresPerPixel) {
  const scale = 1 / metresPerPixel;
  const offX = width / 2 - plan.player.x * scale;
  const offZ = height / 2 - plan.player.z * scale;
  return { x: (wx) => wx * scale + offX, z: (wz) => wz * scale + offZ, scale };
}

/**
 * Draw one blueprint. Safe to call every frame.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object|null} plan  what `runtime.blueprint()` returned
 * @param {{width:number,height:number,margin?:number,metresPerPixel?:number}} size
 */
export function drawBlueprint(ctx, plan, { width, height, margin = 14, metresPerPixel }) {
  ctx.clearRect(0, 0, width, height);
  if (!plan || plan.rooms.length === 0) return;

  ctx.fillStyle = STYLE.paper;
  ctx.fillRect(0, 0, width, height);

  const at = centredOn(plan, width, height, metresPerPixel ?? scaleFor(plan, width, height));

  for (const room of plan.rooms) {
    const x = at.x(room.min.x);
    const y = at.z(room.min.z);
    const w = (room.max.x - room.min.x) * at.scale;
    const h = (room.max.z - room.min.z) * at.scale;
    ctx.fillStyle = room.here ? STYLE.fillHere : STYLE.fill;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = room.here ? STYLE.inkHere : STYLE.ink;
    ctx.lineWidth = room.here ? 2 : 1;
    ctx.strokeRect(x, y, w, h);

    // What the room is for, written in it, where there is room to write it. A plan of a flat should
    // read as kitchen, bathroom, living room, not as four identical squares.
    if (!room.name || w < 46 || h < 18) continue;
    ctx.fillStyle = room.here ? STYLE.inkHere : STYLE.label;
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(room.name, x + w / 2, y + h / 2 + 3, w - 6);
    ctx.textAlign = "left";
  }

  // Buildings standing in the open: solid on the plan, because that is what they are on the ground.
  for (const block of plan.blocks ?? []) {
    const x = at.x(block.min.x);
    const y = at.z(block.min.z);
    ctx.fillStyle = STYLE.block;
    ctx.fillRect(x, y, (block.max.x - block.min.x) * at.scale, (block.max.z - block.min.z) * at.scale);
  }

  // Doors sit across the wall they are cut into: along Z when the wall normal is X, and the other way
  // round. A locked one is drawn in the colour of a door you cannot use yet.
  for (const door of plan.doors) {
    const half = (door.width / 2) * at.scale;
    const cx = at.x(door.center.x);
    const cy = at.z(door.center.z);
    ctx.strokeStyle = door.open ? DOOR_COLOR[door.kind] ?? STYLE.door : STYLE.doorShut;
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (door.axis === "x") {
      ctx.moveTo(cx, cy - half);
      ctx.lineTo(cx, cy + half);
    } else {
      ctx.moveTo(cx - half, cy);
      ctx.lineTo(cx + half, cy);
    }
    ctx.stroke();
  }

  const px = at.x(plan.player.x);
  const py = at.z(plan.player.z);
  ctx.fillStyle = STYLE.player;
  ctx.beginPath();
  ctx.arc(px, py, 3.5, 0, Math.PI * 2);
  ctx.fill();
  // A stalk pointing where the player faces: at yaw 0 that is -Z, which is up on this plan.
  ctx.strokeStyle = STYLE.player;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px - Math.sin(plan.player.yaw) * 11, py - Math.cos(plan.player.yaw) * 11);
  ctx.stroke();

  ctx.fillStyle = STYLE.label;
  ctx.font = "11px ui-monospace, monospace";
  ctx.fillText(plan.floor ? `${plan.label} (floor ${plan.floor})` : plan.label, margin / 2, height - 6);
}
