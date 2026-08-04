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
  player: "#ffffff",
  label: "#9fb4c2",
};

const DOOR_COLOR = {
  room: STYLE.door,
  enter: STYLE.door,
  leave: STYLE.door,
  stairs_up: STYLE.stairs,
  stairs_down: STYLE.stairs,
  exit: STYLE.exit,
};

// Fit the drawn rooms into the canvas with a margin, keeping the aspect square so a floor plan is not
// stretched. Returns world -> canvas projection.
function fitProjection(plan, width, height, margin) {
  const xs = plan.rooms.flatMap((r) => [r.min.x, r.max.x]);
  const zs = plan.rooms.flatMap((r) => [r.min.z, r.max.z]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const scale = Math.min(
    (width - margin * 2) / Math.max(maxX - minX, 1e-6),
    (height - margin * 2) / Math.max(maxZ - minZ, 1e-6)
  );
  const offX = (width - (maxX - minX) * scale) / 2 - minX * scale;
  const offZ = (height - (maxZ - minZ) * scale) / 2 - minZ * scale;
  return { x: (wx) => wx * scale + offX, z: (wz) => wz * scale + offZ, scale };
}

/**
 * Draw one blueprint. Safe to call every frame.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object|null} plan  what `runtime.blueprint()` returned
 * @param {{width:number,height:number,margin?:number}} size
 */
export function drawBlueprint(ctx, plan, { width, height, margin = 14 }) {
  ctx.clearRect(0, 0, width, height);
  if (!plan || plan.rooms.length === 0) return;

  ctx.fillStyle = STYLE.paper;
  ctx.fillRect(0, 0, width, height);

  const at = fitProjection(plan, width, height, margin);

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
