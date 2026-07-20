// Standalone sanity check (`npm run schemas`): compile every registered schema and report.
// Fails loud if a schema is missing a $id, has a duplicate $id, or has an unresolvable $ref.
import { ajv, registeredIds } from "./schemas.js";

try {
  const a = ajv();
  const ids = registeredIds();
  for (const id of ids) {
    const v = a.getSchema(id);
    if (!v) throw new Error(`schema failed to compile: ${id}`);
  }
  console.log(`ok: ${ids.length} schemas compiled and cross-refs resolved`);
} catch (err) {
  console.error(`schema check failed: ${err.message}`);
  process.exit(1);
}
