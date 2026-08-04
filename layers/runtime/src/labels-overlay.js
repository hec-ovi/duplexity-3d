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

// The panel is the city's UI, not a browser dialog: a hairline in the same cyan the pavements burn,
// a header bar naming who is talking, and the controls along the bottom.
const CSS = `
.dx-labels { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 3; }
.dx-label { position: absolute; transform: translate(-50%, -100%); text-align: center;
  font: 11px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.06em;
  color: #cfe6f2; text-shadow: 0 1px 3px #000, 0 0 6px rgba(42, 212, 230, 0.5);
  white-space: nowrap; opacity: 0.9; }
.dx-dialogue { position: absolute; left: 50%; bottom: 34px; transform: translateX(-50%);
  width: min(640px, 84%); display: none;
  background: linear-gradient(180deg, rgba(9, 16, 22, 0.94), rgba(7, 11, 16, 0.94));
  border: 1px solid rgba(42, 212, 230, 0.45);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6), 0 10px 34px rgba(0, 0, 0, 0.55),
    inset 0 0 24px rgba(42, 212, 230, 0.06);
  font: 15px/1.5 system-ui, sans-serif; color: #edf4f8; }
.dx-dialogue .dx-who { display: block; padding: 7px 14px;
  border-bottom: 1px solid rgba(42, 212, 230, 0.25);
  background: rgba(42, 212, 230, 0.09);
  font: 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.18em;
  text-transform: uppercase; color: #7fe4f2; }
.dx-dialogue .dx-said { display: block; padding: 14px 16px 12px; }
.dx-dialogue .dx-keys { display: block; padding: 0 16px 11px;
  font: 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.1em;
  color: #6f8595; }
.dx-dialogue .dx-keys b { color: #a9dbe8; font-weight: 600; }
`;

// What you can do while someone is talking to you. The panel says so, so nobody has to guess.
const KEYS = "<b>E</b> keep talking &middot; walk away to leave";

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

  // One panel, always in the same place: whoever spoke last, what they said, and what you can do.
  const dialogue = doc.createElement("div");
  dialogue.className = "dx-dialogue";
  const who = doc.createElement("span");
  who.className = "dx-who";
  const said = doc.createElement("span");
  said.className = "dx-said";
  const keys = doc.createElement("span");
  keys.className = "dx-keys";
  keys.innerHTML = KEYS;
  dialogue.append(who, said, keys);
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

    // Named, not cleared: the panel's own rule hides it, so clearing the inline style would hide it
    // again the moment someone spoke.
    dialogue.style.display = speaking ? "block" : "none";
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
