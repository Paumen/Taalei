import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HELP = `plan.mjs [--chunk 16] [--max 60] [--min 6] [--wave 8] [--done <file>] --out <plan.json>

Splits the catalogue into swarm selections and waves. A kind of --min to --max
models is one selection. A kind over --max is split by kit, kits filled up to
--max. Kinds under --min join their sibling kinds under the same parent into one
model list of up to --max. Each selection carries its models in chunks of
--chunk for the close-up lookers. --done names a JSON list of selections already
swept in full; they are left out. Waves hold --wave selections each, in kind
order, so siblings land in one wave.`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
if (args.includes('--help') || !flag('out')) {
  console.log(HELP);
  process.exit(args.includes('--help') ? 0 : 1);
}
const CHUNK = Number(flag('chunk', 16));
const MAX = Number(flag('max', 60));
const MIN = Number(flag('min', 6));
const WAVE = Number(flag('wave', 8));
const done = new Set(flag('done') ? JSON.parse(readFileSync(flag('done'), 'utf8')) : []);

const { models } = JSON.parse(readFileSync(join(ROOT, 'catalog', 'build', 'catalog.json'), 'utf8'));
const idOf = (m) => `${m.kit}/${m.name}`;
const byKind = new Map();
for (const m of models) {
  if (!byKind.has(m.kind)) byKind.set(m.kind, []);
  byKind.get(m.kind).push(m);
}
const parentOf = (kind) => (kind.includes('-') ? kind.slice(0, kind.lastIndexOf('-')) : kind);
const chunk = (ids) => {
  const out = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(ids.slice(i, i + CHUNK));
  return out;
};

const selections = [];
const sorted = (list) => list.sort((a, b) => idOf(a).localeCompare(idOf(b)));
const groups = new Map();
for (const kind of [...byKind.keys()].sort()) {
  const list = sorted(byKind.get(kind));
  if (list.length > MAX) {
    const byKit = new Map();
    for (const m of list) {
      if (!byKit.has(m.kit)) byKit.set(m.kit, []);
      byKit.get(m.kit).push(idOf(m));
    }
    let bin = [];
    let part = 1;
    for (const ids of [...byKit.values()].sort((a, b) => b.length - a.length)) {
      if (bin.length && bin.length + ids.length > MAX) {
        selections.push({ sel: bin.join(','), label: `${kind} part ${part++}`, kinds: [kind], ids: bin });
        bin = [];
      }
      bin.push(...ids);
    }
    if (bin.length) selections.push({ sel: bin.join(','), label: `${kind} part ${part}`, kinds: [kind], ids: bin });
    continue;
  }
  const parent = parentOf(kind);
  if (!groups.has(parent)) groups.set(parent, []);
  groups.get(parent).push({ kind, list });
}
const pending = [];
for (const [parent, kinds] of [...groups.entries()].sort()) {
  let bin = [];
  const flush = () => {
    if (!bin.length) return;
    const ms = bin.flatMap((k) => k.list);
    pending.push({ parent, kinds: bin.map((k) => k.kind), ms });
    bin = [];
  };
  for (const k of kinds) {
    if (bin.length && bin.reduce((n, b) => n + b.list.length, 0) + k.list.length > MAX) flush();
    bin.push(k);
  }
  flush();
}
for (let i = 0; i < pending.length; i++) {
  const p = pending[i];
  const next = pending[i + 1];
  if (p.ms.length < MIN && next && p.ms.length + next.ms.length <= MAX + MIN) {
    next.kinds.unshift(...p.kinds);
    next.ms.unshift(...p.ms);
    next.parent = p.parent === next.parent ? p.parent : `${p.parent} + ${next.parent}`;
    continue;
  }
  const ids = p.ms.map(idOf);
  const sel = p.kinds.length === 1 && byKind.get(p.kinds[0]).length === ids.length ? p.kinds[0] : ids.join(',');
  selections.push({ sel, label: sel === p.kinds[0] ? sel : `${p.kinds.length} kinds under ${p.parent}`, kinds: p.kinds, ids });
}

selections.sort((a, b) => a.kinds[0].localeCompare(b.kinds[0]));
const todo = selections.filter((s) => !done.has(s.label ?? s.sel));
const entries = todo.map((s) => ({ sel: s.sel, label: s.label ?? s.sel, kinds: s.kinds, count: s.ids.length, chunks: chunk(s.ids) }));
const waves = [];
for (let i = 0; i < entries.length; i += WAVE) waves.push(entries.slice(i, i + WAVE));

const agents = entries.reduce((n, e) => n + 1 + e.chunks.length + 2, 0);
writeFileSync(flag('out'), JSON.stringify({ chunk: CHUNK, max: MAX, min: MIN, selections: entries.length, models: entries.reduce((n, e) => n + e.count, 0), agentsAtMost: agents, waves }, null, 1) + '\n');
console.log(`${entries.length} selections, ${entries.reduce((n, e) => n + e.count, 0)} models, ${waves.length} waves, at most ${agents} agents -> ${flag('out')}`);
