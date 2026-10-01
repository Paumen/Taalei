import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HELP = `kind-pick.mjs [--count 3] [--min 4] [--max 24] [--kits 2] [--render <dir>] [--dry]
             [--kind <id[,id]>] [--log <file>]

Picks --count random catalogue kinds with --min to --max models from at least
--kits kits, skipping every kind already in the log, and appends the picks to
the log (tools/renders/kind-review-log.json). --kind picks those kinds instead
and logs them too. --dry prints the picks without logging them.

--render <dir> renders each pick with kind-sheet.mjs into <dir>/<kind>, pbr
from iso at locked scale. A kind of more than 12 models also gets two halves
of at most 12, in <dir>/<kind>/pbr/c01 and c02.`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);
if (has('help')) {
  console.log(HELP);
  process.exit(0);
}

const count = Number(flag('count', '3'));
const min = Number(flag('min', '4'));
const max = Number(flag('max', '24'));
const minKits = Number(flag('kits', '2'));
const logPath = resolve(flag('log', join(ROOT, 'tools', 'renders', 'kind-review-log.json')));
const out = flag('render');

const catalog = JSON.parse(readFileSync(join(ROOT, 'catalog', 'build', 'catalog.json'), 'utf8'));
const log = existsSync(logPath) ? JSON.parse(readFileSync(logPath, 'utf8')) : [];
const done = new Set(log.map((e) => e.kind));

const byKind = new Map();
for (const m of catalog.models) {
  if (!byKind.has(m.kind)) byKind.set(m.kind, []);
  byKind.get(m.kind).push(m);
}
const kitsOf = (kind) => [...new Set(byKind.get(kind).map((m) => m.kit))];

let picks;
const named = flag('kind')?.split(',').filter(Boolean);
if (named) {
  for (const kind of named) if (!byKind.has(kind)) throw new Error(`no catalogue models of kind ${kind}`);
  picks = named;
} else {
  const pool = [...byKind.keys()].filter((kind) => {
    const n = byKind.get(kind).length;
    return n >= min && n <= max && kitsOf(kind).length >= minKits && !done.has(kind);
  });
  if (pool.length < count) throw new Error(`only ${pool.length} unreviewed kinds fit; clear entries from ${logPath}`);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  picks = pool.slice(0, count);
}

const date = new Date().toISOString().slice(0, 10);
for (const kind of picks) {
  const n = byKind.get(kind).length;
  console.log(`${kind}  ${n} models  kits: ${kitsOf(kind).join(', ')}`);
}

if (!has('dry')) {
  for (const kind of picks) if (!done.has(kind)) log.push({ kind, date });
  log.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
  writeFileSync(logPath, `${JSON.stringify(log, null, 1)}\n`);
}

if (out) {
  for (const kind of picks) {
    const n = byKind.get(kind).length;
    const sheetArgs = [join(ROOT, 'tools', 'renders', 'kind-sheet.mjs'), '--kind', kind, '--out', join(out, kind), '--modes', 'pbr'];
    sheetArgs.push(...(n > 12 ? ['--chunk', String(Math.ceil(n / 2))] : ['--no-chunks']));
    execFileSync(process.execPath, sheetArgs, { stdio: 'inherit' });
  }
}
