// runtime - names and speech, drawn as HTML over the canvas.
//
// Text lives in the DOM, not in the 3D scene. Glyphs in the scene are sized in metres, so a line
// looks fine across a room and swallows the screen when someone stands next to you, and they need a
// font atlas and a worker to render at all. A div sized in pixels is always legible, always the same
// size, wraps like text, and can be styled with CSS.
//
// Each entry is projected from its world position to a screen position once a frame. Anything behind
// the camera, or too far to read, is hidden.

const MAX_DISTANCE = 28; // metres past which a name is not worth showing
const STYLE_ID = "duplexity-labels-style";

const CSS = `
.dx-labels { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 3; }
.dx-label { position: absolute; transform: translate(-50%, -100%); text-align: center;
  font: 13px/1.35 system-ui, sans-serif; color: #eef2f6; text-shadow: 0 1px 3px #000, 0 0 2px #000;
  white-space: nowrap; }
.dx-label .dx-says { display: block; max-width: 22ch; margin: 0 auto 4px; padding: 5px 9px;
  background: rgba(12, 16, 22, 0.85); border: 1px solid rgba(159, 180, 194, 0.35); border-radius: 8px;
  color: #f2f5f8; white-space: normal; text-align: left; }
`;

function ensureStyle(doc) {
  if (!doc || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head?.appendChild(style);
}

/**
 * Mount the overlay into a container (the same element the canvas sits in).
 *
 * @param {HTMLElement} container
 * @param {{document?: Document}} [deps]
 * @returns {{ sync(entries, camera, size): void, dispose(): void, root: HTMLElement }}
 */
export function createLabelsOverlay(container, { document: doc = globalThis.document } = {}) {
  ensureStyle(doc);
  const root = doc.createElement("div");
  root.className = "dx-labels";
  container.appendChild(root);

  const nodes = new Map(); // id -> { el, name, says }

  function nodeFor(id) {
    let node = nodes.get(id);
    if (node) return node;
    const el = doc.createElement("div");
    el.className = "dx-label";
    const says = doc.createElement("span");
    says.className = "dx-says";
    const name = doc.createElement("span");
    name.className = "dx-name";
    el.append(says, name);
    root.appendChild(el);
    node = { el, name, says };
    nodes.set(id, node);
    return node;
  }

  /**
   * @param {Array<{id:string,name:string,says?:string|null,position:{x:number,y:number,z:number},height?:number}>} entries
   * @param {{project(v):void}} camera  a three.js camera (used through project())
   * @param {{width:number,height:number,project:Function}} view  screen size + a world->NDC projector
   */
  function sync(entries, camera, view) {
    const live = new Set();
    for (const entry of entries) {
      const p = view.project(entry.position, entry.height ?? 1.8, camera);
      const node = nodeFor(entry.id);
      live.add(entry.id);
      if (!p || p.distance > MAX_DISTANCE) {
        node.el.style.display = "none";
        continue;
      }
      node.el.style.display = "";
      node.el.style.left = `${p.x * view.width}px`;
      node.el.style.top = `${p.y * view.height}px`;
      node.name.textContent = entry.name;
      node.says.textContent = entry.says ?? "";
      node.says.style.display = entry.says ? "" : "none";
    }
    for (const [id, node] of nodes) {
      if (!live.has(id)) {
        node.el.remove();
        nodes.delete(id);
      }
    }
  }

  function dispose() {
    nodes.clear();
    root.remove();
  }

  return { sync, dispose, root };
}
