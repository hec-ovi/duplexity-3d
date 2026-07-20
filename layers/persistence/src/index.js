// persistence - the Adventure store. Leaf layer: it imports no other layer's src.
//
// Validation is injected (`validateAdventure`) so this src never depends on the shared test
// harness. In production, persistence wires its own Ajv against schema/adventure.schema.json and
// passes it in the same way. The rest is a plain in-memory store for Phase 1.

export class NotFoundError extends Error {
  constructor(id) {
    super(`adventure not found: ${id}`);
    this.code = "NOT_FOUND";
  }
}

export class SchemaInvalidError extends Error {
  constructor(errors) {
    super("adventure failed schema validation");
    this.code = "SCHEMA_INVALID";
    this.errors = errors ?? [];
  }
}

export function createPersistence({ validateAdventure } = {}) {
  const store = new Map();

  function assertValid(adventure) {
    if (!validateAdventure) return;
    const { ok, errors } = validateAdventure(adventure);
    if (!ok) throw new SchemaInvalidError(errors);
  }

  const api = {
    save(adventure) {
      assertValid(adventure);
      const id = adventure?.meta?.id;
      if (!id) throw new SchemaInvalidError([{ message: "meta.id is required" }]);
      store.set(id, structuredClone(adventure));
      return { id };
    },

    load(id) {
      if (!store.has(id)) throw new NotFoundError(id);
      return structuredClone(store.get(id));
    },

    list() {
      return [...store.values()].map((a) => ({ id: a.meta.id, title: a.meta.title }));
    },

    export(id) {
      const adventure = api.load(id);
      // Kit assets stay referenced by id; only generated (non-kit) bytes would be embedded here.
      return { adventure, generatedAssets: [] };
    },

    import(bundle) {
      const adventure = bundle?.adventure;
      assertValid(adventure);
      store.set(adventure.meta.id, structuredClone(adventure));
      return structuredClone(adventure);
    },

    appendHistory(id, record) {
      if (!store.has(id)) throw new NotFoundError(id);
      store.get(id).history.push(structuredClone(record));
    },
  };

  return api;
}
