import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const read = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));

export const VARS = read('lint/variables.json');

export const widthsOf = (findings, keys) =>
  Object.fromEntries(keys.map((key) => [key, Math.max(...findings.map((f) => String(f[key]).length), 0)]));

export function printTally(findings, key, { levels = true, width = 3, pad = true } = {}) {
  const tally = new Map();
  for (const f of findings) {
    const row = tally.get(f[key]) ?? { errors: 0, warnings: 0 };
    row[levels ? `${f.level}s` : 'errors']++;
    tally.set(f[key], row);
  }
  if (!tally.size) return;
  console.log('');
  const kw = pad ? Math.max(...[...tally.keys()].map((k) => k.length)) : 0;
  for (const [name, row] of [...tally].sort(([a], [b]) => a.localeCompare(b))) {
    const warnings = levels ? `  ${String(row.warnings).padStart(width)} warnings` : '';
    console.log(`${name.padEnd(kw)}  ${String(row.errors).padStart(width)} errors${warnings}`);
  }
}
