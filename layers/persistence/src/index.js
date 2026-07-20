// persistence - the Adventure store. Leaf layer: it imports no other layer's src.
//
// Validation is injected (`validateAdventure`) so this src never depends on the shared test
// harness. In production, persistence wires its own Ajv against schema/adventure.schema.json and
// passes it in the same way. The rest is a plain in-memory store for Phase 1.
//
// Phase 7 makes export/import a real, portable-file round-trip: `exportFile` serializes a Bundle to a
// transferable JSON string and `importFile` reads one back, running it through `migrateForward` so an
// older (same-major) export opens on the current schema, and refusing a newer major it cannot read.

export const CURRENT_CONTRACT_VERSION = "1.0.0";

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

export class MigrationFailedError extends Error {
  constructor(detail) {
    super(`could not migrate imported adventure: ${detail}`);
    this.code = "MIGRATION_FAILED";
  }
}

export class BadBundleError extends Error {
  constructor(detail) {
    super(`import rejected: ${detail}`);
    this.code = "BAD_BUNDLE";
  }
}

function isObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

function majorOf(version) {
  return Number.parseInt(String(version ?? "").split(".")[0], 10);
}

// Bring an imported Adventure up to the current schema: reject a newer MAJOR contractVersion (we cannot
// know its shape), and backfill fields an older same-major export may lack. Per-version transforms would
// key off major/minor here as the schema evolves (add-new-alongside-old, migrate, remove).
export function migrateForward(adventure) {
  if (!isObject(adventure)) throw new BadBundleError("bundle.adventure is missing or not an object");
  const version = adventure?.meta?.contractVersion;
  const major = majorOf(version);
  const currentMajor = majorOf(CURRENT_CONTRACT_VERSION);
  if (Number.isNaN(major)) throw new MigrationFailedError(`missing or invalid contractVersion: ${version}`);
  if (major > currentMajor) {
    throw new MigrationFailedError(
      `bundle contractVersion ${version} is newer than supported ${CURRENT_CONTRACT_VERSION}`,
    );
  }
  const migrated = structuredClone(adventure);
  if (!Array.isArray(migrated.history)) migrated.history = []; // older exports may omit an empty history
  return migrated;
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
      return [...store.values()].map((a) => ({
        id: a.meta.id,
        title: a.meta.title,
        instanceCount: a.instances?.length ?? 0,
      }));
    },

    export(id) {
      const adventure = api.load(id);
      // Kit assets stay referenced by id; only generated (non-kit) bytes would be embedded here.
      return { adventure, generatedAssets: [] };
    },

    // Serialize a Bundle to a portable JSON string (the transfer format saved to / uploaded from a file).
    exportFile(id) {
      return JSON.stringify(api.export(id), null, 2);
    },

    import(bundle) {
      if (!isObject(bundle)) throw new BadBundleError("bundle is missing or not an object");
      const migrated = migrateForward(bundle.adventure);
      assertValid(migrated);
      store.set(migrated.meta.id, structuredClone(migrated));
      return structuredClone(migrated);
    },

    // Deserialize a portable JSON string produced by exportFile and import it.
    importFile(text) {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new BadBundleError("bundle is not valid JSON");
      }
      return api.import(parsed);
    },

    appendHistory(id, record) {
      if (!store.has(id)) throw new NotFoundError(id);
      store.get(id).history.push(structuredClone(record));
    },
  };

  return api;
}
