import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const HERE = dirname(fileURLToPath(import.meta.url));
const LAYERS_DIR = join(HERE, "..", "layers");
const BASE = "https://doplexity-3d.dev/schema";

/**
 * Canonical `$id` map. Tests and stubs reference schemas through these symbols so a URI is written
 * in exactly one place. Grouped by owning layer. `persistence` owns every shape embedded in the
 * Adventure document; other layers may ship thin `$ref` wrappers that point back here.
 */
export const SCHEMA_ID = {
  persistence: {
    adventure: `${BASE}/persistence/adventure.schema.json`,
    meta: `${BASE}/persistence/meta.json`,
    creativeBrief: `${BASE}/persistence/creative-brief.json`,
    progression: `${BASE}/persistence/progression.json`,
    instance: `${BASE}/persistence/instance.json`,
    room: `${BASE}/persistence/room.json`,
    portal: `${BASE}/persistence/portal.json`,
    object: `${BASE}/persistence/object.json`,
    npcDef: `${BASE}/persistence/npc-def.json`,
    goal: `${BASE}/persistence/goal.json`,
    mode: `${BASE}/persistence/mode.json`,
    spawn: `${BASE}/persistence/spawn.json`,
    vec3: `${BASE}/persistence/vec3.json`,
    vec2: `${BASE}/persistence/vec2.json`,
    interactionRecord: `${BASE}/persistence/interaction-record.json`,
    bundle: `${BASE}/persistence/bundle.json`,
  },
  interviewer: {
    creativeBrief: `${BASE}/interviewer/creative-brief.json`,
    messageIn: `${BASE}/interviewer/interview-message.in.json`,
    messageOut: `${BASE}/interviewer/interview-message.out.json`,
    skipIn: `${BASE}/interviewer/interview-skip.in.json`,
  },
  narrator: {
    adventurePlan: `${BASE}/narrator/adventure-plan.json`,
    instanceRuntimeState: `${BASE}/narrator/instance-runtime-state.json`,
    goalResult: `${BASE}/narrator/goal-result.json`,
    interactionRecord: `${BASE}/narrator/interaction-record.json`,
    historyAppended: `${BASE}/narrator/history-appended.event.json`,
    progressionAdvanced: `${BASE}/narrator/progression-advanced.event.json`,
  },
  scenarioCreator: {
    instanceSpec: `${BASE}/scenario-creator/instance-spec.json`,
    instance: `${BASE}/scenario-creator/instance.json`,
    validationReport: `${BASE}/scenario-creator/validation-report.json`,
  },
  npc: {
    npcDef: `${BASE}/npc/npc-def.json`,
    selfContext: `${BASE}/npc/self-context.json`,
    interaction: `${BASE}/npc/interaction.json`,
    interactionResult: `${BASE}/npc/interaction-result.json`,
    rosterSpec: `${BASE}/npc/roster-spec.json`,
  },
  assetRegistry: {
    assetEntry: `${BASE}/asset-registry/asset-entry.json`,
    assetQuery: `${BASE}/asset-registry/asset-query.json`,
    assetRegistered: `${BASE}/asset-registry/asset-registered.event.json`,
  },
  assetGen: {
    genRequest: `${BASE}/asset-gen/gen-request.json`,
    genStatus: `${BASE}/asset-gen/gen-status.json`,
    genCompleted: `${BASE}/asset-gen/gen-completed.event.json`,
    genFailed: `${BASE}/asset-gen/gen-failed.event.json`,
  },
  runtime: {
    loadInput: `${BASE}/runtime/load-input.json`,
  },
};

function collectSchemaFiles() {
  const files = [];
  let layers;
  try {
    layers = readdirSync(LAYERS_DIR, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const layer of layers) {
    if (!layer.isDirectory()) continue;
    const schemaDir = join(LAYERS_DIR, layer.name, "schema");
    let entries;
    try {
      entries = readdirSync(schemaDir);
    } catch {
      continue;
    }
    for (const f of entries) {
      if (f.endsWith(".json")) files.push(join(schemaDir, f));
    }
  }
  return files;
}

let _ajv;

/** The shared Ajv instance with every layer schema loaded and cross-refs resolvable. */
export function ajv() {
  if (_ajv) return _ajv;
  const a = new Ajv2020({ allErrors: true, strict: false });
  addFormats(a);
  const seen = new Map();
  for (const file of collectSchemaFiles()) {
    const schema = JSON.parse(readFileSync(file, "utf8"));
    if (!schema.$id) throw new Error(`schema is missing "$id": ${file}`);
    if (seen.has(schema.$id)) {
      throw new Error(`duplicate $id ${schema.$id} in ${file} and ${seen.get(schema.$id)}`);
    }
    seen.set(schema.$id, file);
    a.addSchema(schema);
  }
  _ajv = a;
  return a;
}

/** The compiled validate function for a schema `$id` (throws if unknown). */
export function validator(id) {
  const v = ajv().getSchema(id);
  if (!v) throw new Error(`no schema registered for $id: ${id}`);
  return v;
}

/** Validate one payload against a schema `$id`. Returns `{ ok, errors }`. */
export function validate(id, data) {
  const v = validator(id);
  const ok = v(data);
  return { ok: Boolean(ok), errors: v.errors ?? [] };
}

/** Every `$id` the loader registered (used by the meta schema test). */
export function registeredIds() {
  const a = ajv();
  return [...new Set(collectSchemaFiles().map((f) => JSON.parse(readFileSync(f, "utf8")).$id))].filter(
    (id) => a.getSchema(id),
  );
}
