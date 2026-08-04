// runtime - names and speech, drawn as HTML over the canvas.
//
// Text lives in the DOM, not in the 3D scene. Glyphs in the scene are sized in metres, so a line
// looks fine across a room and swallows the screen when someone stands next to you, and they need a
// font atlas and a worker to render at all. A div sized in pixels is always legible, always the same
// size, wraps like text, and can be styled with CSS.
//
// A NAME hangs over whoever it belongs to, small and quiet, so you can tell people apart. What
// someone SAYS goes in one panel at the bottom of the screen, like any other piece of UI: a line
// that follows a walking NPC around is hard to read and ends up in your face when they stand next
// to you.

const MAX_DISTANCE = 28; // metres past which a name is not worth showing
const STYLE_ID = "duplexity-labels-style";

const CSS = `
.dx-labels { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 3; }
.dx-label { position: absolute; transform: translate(-50%, -100%); text-align: center;
  font: 12px/1.3 system-ui, sans-serif; color: #d7dee6; text-shadow: 0 1px 3px #000, 0 0 2px #000;
  white-space: nowrap; opacity: 0.82; }
.dx-dialogue { position: absolute; left: 50%; bottom: 24px; transform: translateX(-50%);
  max-width: min(560px, 76%); padding: 10px 14px; border-radius: 10px;
  background: rgba(10, 13, 18, 0.86); border: 1px solid rgba(159, 180, 194, 0.28);
  font: 14px/1.45 system-ui, sans-serif; color: #f2f5f8; display: none; }
.dx-dialogue .dx-who { display: block; margin-bottom: 3px; font-size: 11px; letter-spacing: 0.08em;
  text-transform: uppercase; color: #9fb4c2; }
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

  const nodes = new Map(); // id -> { el, name }

  // One panel, always in the same place: whoever spoke last, and what they said.
  const dialogue = doc.createElement("div");
  dialogue.className = "dx-dialogue";
  const who = doc.createElement("span");
  who.className = "dx-who";
  const said = doc.createElement("span");
  said.className = "dx-said";
  dialogue.append(who, said);
  root.appendChild(dialogue);

  function nodeFor(id) {
    let node = nodes.get(id);
    if (node) return node;
    const el = doc.createElement("div");
    el.className = "dx-label";
    root.appendChild(el);
    node = { el };
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
    let speaking = null;
    for (const entry of entries) {
      if (entry.says) speaking = entry;
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
      node.el.textContent = entry.name;
    }
    for (const [id, node] of nodes) {
      if (!live.has(id)) {
        node.el.remove();
        nodes.delete(id);
      }
    }

    dialogue.style.display = speaking ? "" : "none";
    if (speaking) {
      who.textContent = speaking.name;
      said.textContent = speaking.says;
    }
  }

  function dispose() {
    nodes.clear();
    root.remove();
  }

  return { sync, dispose, root };
}
