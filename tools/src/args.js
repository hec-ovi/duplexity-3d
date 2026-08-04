// tools - the smallest argument parser that does the job: `--key value` and `--flag`.

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      out._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

export function asInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** "2,1,3" -> [2,1,3] */
export function asIntList(value) {
  if (!value || value === true) return undefined;
  return String(value)
    .split(",")
    .map((piece) => Number.parseInt(piece.trim(), 10))
    .filter((n) => Number.isFinite(n));
}
