// asset-registry - the catalog of usable 3D pieces. Leaf layer; imports no other layer's src.

export class AssetNotFoundError extends Error {
  constructor(id) {
    super(`asset not found: ${id}`);
    this.code = "ASSET_NOT_FOUND";
  }
}
export class LicenseMissingError extends Error {
  constructor() {
    super("register rejected: license missing or not commercial-use-clear");
    this.code = "LICENSE_MISSING";
  }
}
export class InvalidAssetEntryError extends Error {
  constructor(msg) {
    super(`register rejected: ${msg}`);
    this.code = "INVALID_ASSET_ENTRY";
  }
}

const SEED = [
  {
    id: "kaykit.dungeon.floor",
    kind: "room-floor",
    tags: ["dungeon", "floor"],
    theme: "dungeon",
    size: [2, 0.2, 2],
    glbUrl: "kits/kaykit/dungeon/floor.glb",
    license: "CC0-1.0",
    source: "kit",
  },
  {
    id: "kaykit.dungeon.wall",
    kind: "wall",
    tags: ["dungeon", "wall"],
    theme: "dungeon",
    size: [2, 3, 0.3],
    glbUrl: "kits/kaykit/dungeon/wall.glb",
    license: "CC0-1.0",
    source: "kit",
  },
  {
    id: "kaykit.character.skeleton",
    kind: "character",
    tags: ["dungeon", "enemy"],
    theme: "dungeon",
    size: [0.6, 1.8, 0.6],
    glbUrl: "kits/kaykit/characters/skeleton.glb",
    license: "CC0-1.0",
    source: "kit",
    animations: ["idle", "walk", "attack", "hit", "die"],
  },
  {
    id: "kaykit.character.dwarf",
    kind: "character",
    tags: ["dungeon", "npc"],
    theme: "dungeon",
    size: [0.5, 1.6, 0.5],
    glbUrl: "kits/kaykit/characters/dwarf.glb",
    license: "CC0-1.0",
    source: "kit",
    animations: ["idle", "walk", "talk"],
  },
  {
    id: "kaykit.props.chest",
    kind: "prop",
    tags: ["dungeon", "container"],
    theme: "dungeon",
    size: [1, 1, 0.6],
    glbUrl: "kits/kaykit/props/chest.glb",
    license: "CC0-1.0",
    source: "kit",
  },
];

export function createRegistry(entries = SEED) {
  const store = new Map(entries.map((e) => [e.id, structuredClone(e)]));

  return {
    query(q = {}) {
      return [...store.values()].filter((e) => {
        if (q.kind && e.kind !== q.kind) return false;
        if (q.theme && e.theme !== q.theme) return false;
        if (q.tags && !q.tags.every((t) => e.tags.includes(t))) return false;
        if (q.sizeConstraints) {
          const { maxSize, minSize } = q.sizeConstraints;
          if (maxSize && e.size.some((d, i) => d > maxSize[i])) return false;
          if (minSize && e.size.some((d, i) => d < minSize[i])) return false;
        }
        return true;
      });
    },

    get(id) {
      if (!store.has(id)) throw new AssetNotFoundError(id);
      return structuredClone(store.get(id));
    },

    register(entry) {
      if (!entry.license) throw new LicenseMissingError();
      if (!entry.glbUrl) throw new InvalidAssetEntryError("asset entry must have a resolvable glbUrl");
      if (entry.kind === "character" && !(entry.animations?.length > 0)) {
        throw new InvalidAssetEntryError("character asset must declare animations");
      }
      store.set(entry.id, structuredClone(entry));
      return entry.id;
    },
  };
}
