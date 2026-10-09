import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HELP = `kind-pick.mjs [--count 3] [--min 4] [--max 48] [--kits 2] [--render <dir>] [--dry]
             [--kind <id[,id]>] [--log <file>]
kind-pick.mjs --record <file.json> [--log <file>]
kind-pick.mjs --check <file.json> [--log <file>]
kind-pick.mjs --stats [--log <file>]

Picks --count random catalogue kinds with --min to --max models from at least
--kits kits, skipping every kind already in the log, and appends the picks to
the log (tools/renders/kind-review-log.json). --kind picks those kinds instead
and logs them too. --dry prints the picks without logging them.

--render <dir> renders each pick with kind-sheet.mjs into <dir>/<kind>, pbr
from iso, each tile fitted to its own model. A kind of more than 16 models also gets
even sheets of at most 16, in <dir>/<kind>/pbr/c01, c02, ….

--record <file.json> sets the suggestions of logged kinds from a file holding
one entry or a list of entries:
  { "kind": "<id>", "suggestions": [ {
      "by": "claude" | "po",
      "category": "colour" | "artefact" | "shape" | "detail" | "scale" |
                  "placement" | "duplicate" | "kind" | "material" | "look",
      "models": ["kit/name" | "kit/*", …],
      "text": "what was seen",
      "options": ["…", …],
      "picked": ["…"]   chosen options, verbatim or as written by the PO; [] when
                        declined, null while unanswered
  } ] }

--check <file.json> records the PO's verdict on changes an agent decided on its
own, from a file holding a list of entries:
  { "kind": "<id>", "id": "kit/name", "category": "<as above>",
    "change": "what was done, or proposed and left",
    "doubt": true | false,   whether the agent listed it as doubtful
    "applied": true | false,
    "verdict": "ok" | "nok" | null   null while unchecked }
An entry replaces the check of the same model and change in that kind.

--stats prints, per category and per proposer, how many suggestions were made,
answered and picked, and the options picked most; then, per category, how the
autonomous calls were judged: doubtful or not, against ok and nok, with the
changes judged nok.`;

const CATEGORIES = ['colour', 'artefact', 'shape', 'detail', 'scale', 'placement', 'duplicate', 'kind', 'material', 'look'];

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
const max = Number(flag('max', '48'));
const minKits = Number(flag('kits', '2'));
const logPath = resolve(flag('log', join(ROOT, 'tools', 'renders', 'kind-review-log.json')));
const out = flag('render');

const log = existsSync(logPath) ? JSON.parse(readFileSync(logPath, 'utf8')) : [];
const done = new Set(log.map((e) => e.kind));
const save = () => {
  log.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
  writeFileSync(logPath, `${JSON.stringify(log, null, 1)}\n`);
};

if (flag('record')) {
  const input = JSON.parse(readFileSync(resolve(flag('record')), 'utf8'));
  for (const { kind, suggestions } of [input].flat()) {
    const entry = log.find((e) => e.kind === kind);
    if (!entry) throw new Error(`${kind} is not in the log; pick it first`);
    if (!Array.isArray(suggestions)) throw new Error(`${kind}: suggestions must be a list`);
    for (const s of suggestions) {
      if (!['claude', 'po'].includes(s.by)) throw new Error(`${kind}: by must be claude or po`);
      if (!CATEGORIES.includes(s.category)) throw new Error(`${kind}: category ${s.category} is not one of ${CATEGORIES.join(', ')}`);
      if (!s.text || !Array.isArray(s.options) || !Array.isArray(s.models)) throw new Error(`${kind}: text, options and models are required`);
      if (s.picked !== null && !Array.isArray(s.picked)) throw new Error(`${kind}: picked must be a list or null`);
    }
    entry.suggestions = suggestions;
    console.log(`${kind}: ${suggestions.length} suggestions recorded`);
  }
  save();
  process.exit(0);
}

if (flag('check')) {
  const input = [JSON.parse(readFileSync(resolve(flag('check')), 'utf8'))].flat();
  for (const c of input) {
    const entry = log.find((e) => e.kind === c.kind);
    if (!entry) throw new Error(`${c.kind} is not in the log; pick it first`);
    if (!CATEGORIES.includes(c.category)) throw new Error(`${c.id}: category ${c.category} is not one of ${CATEGORIES.join(', ')}`);
    if (!c.id || !c.change || typeof c.doubt !== 'boolean' || typeof c.applied !== 'boolean') throw new Error(`${c.id}: id, change, doubt and applied are required`);
    if (![null, 'ok', 'nok'].includes(c.verdict)) throw new Error(`${c.id}: verdict must be ok, nok or null`);
    const { kind, ...check } = c;
    entry.checks = (entry.checks ?? []).filter((x) => x.id !== check.id || x.change !== check.change);
    entry.checks.push(check);
  }
  console.log(`${input.length} checks recorded`);
  save();
  process.exit(0);
}

if (has('stats')) {
  const rows = new Map();
  const row = (key) => {
    if (!rows.has(key)) rows.set(key, { made: 0, answered: 0, picked: 0, options: new Map() });
    return rows.get(key);
  };
  for (const entry of log) {
    for (const s of entry.suggestions ?? []) {
      for (const r of [row(`category ${s.category}`), row(`by ${s.by}`), row('all')]) {
        r.made++;
        if (s.picked === null) continue;
        r.answered++;
        if (s.picked.length) r.picked++;
        for (const o of s.picked) r.options.set(o, (r.options.get(o) ?? 0) + 1);
      }
    }
  }
  const kinds = log.length;
  const reviewed = log.filter((e) => e.suggestions).length;
  console.log(`${kinds} kinds logged, ${reviewed} with suggestions recorded`);
  for (const [key, r] of [...rows].sort((a, b) => b[1].made - a[1].made)) {
    const rate = r.answered ? `${Math.round((100 * r.picked) / r.answered)}%` : '—';
    console.log(`${key.padEnd(20)} made ${String(r.made).padStart(3)}  answered ${String(r.answered).padStart(3)}  picked ${String(r.picked).padStart(3)}  ${rate}`);
    if (!key.startsWith('category')) continue;
    const top = [...r.options].sort((a, b) => b[1] - a[1]).slice(0, 3);
    for (const [o, n] of top) console.log(`${''.padEnd(22)}${n}× ${o}`);
  }
  const checks = log.flatMap((e) => e.checks ?? []);
  if (checks.length) {
    console.log('\nautonomous calls       doubtful ok/nok/open   not doubtful ok/nok/open');
    const cats = [...new Set(checks.map((c) => c.category))].sort();
    const tally = (list) => ['ok', 'nok', null].map((v) => list.filter((c) => c.verdict === v).length).join('/');
    for (const cat of cats) {
      const list = checks.filter((c) => c.category === cat);
      console.log(`category ${cat.padEnd(13)} ${tally(list.filter((c) => c.doubt)).padStart(12)}   ${tally(list.filter((c) => !c.doubt)).padStart(16)}`);
      for (const c of list.filter((x) => x.verdict === 'nok')) console.log(`${''.padEnd(22)}nok ${c.applied ? 'applied' : 'left'}: ${c.id}: ${c.change}`);
    }
  }
  process.exit(0);
}

const catalog = JSON.parse(readFileSync(join(ROOT, 'catalog', 'build', 'catalog.json'), 'utf8'));

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
  save();
}

if (out) {
  for (const kind of picks) {
    const n = byKind.get(kind).length;
    const sheetArgs = [join(ROOT, 'tools', 'renders', 'kind-sheet.mjs'), '--kind', kind, '--out', join(out, kind), '--modes', 'pbr', '--free-scale'];
    sheetArgs.push(...(n > 16 ? ['--chunk', String(Math.ceil(n / Math.ceil(n / 16)))] : ['--no-chunks']));
    execFileSync(process.execPath, sheetArgs, { stdio: 'inherit' });
  }
}
