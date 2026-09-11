// Merges a tag-edits export from the catalogue's model panel or swipe page into
// catalog/tags.json.
//
//   node tools/apply-tag-edits.mjs <export.json>          apply
//   node tools/apply-tag-edits.mjs <export.json> --dry     show what it would do
//
// The export is a diff: per tag, `add` ids to append to that tag's `models` and `remove`
// ids to drop. Applying it by hand is how it was done before, and a session is easily
// fifteen models across fourteen tags.
//
// Nothing is written unless the whole file passes: a half-applied diff would leave models
// with two kinds or none, which the build only notices afterwards. Re-applying the same
// file is a no-op.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readKindTree } from '../catalog/tools/kinds.mjs';
import { USES } from '../catalog/tools/kinds.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const TAGS = join(ROOT, 'catalog/tags.json');
const CATALOG = join(ROOT, 'catalog/catalog.json');

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('usage: node tools/apply-tag-edits.mjs <export.json> [--dry]');
  process.exit(2);
}

const exported = JSON.parse(readFileSync(file, 'utf8'));
const diff = exported.tags ?? {};
const source = JSON.parse(readFileSync(TAGS, 'utf8'));
const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'));

const byId = new Map(source.tags.map((t) => [t.id, t]));
const known = new Set(catalog.models.map((m) => `${m.kit}/${m.name}`));
const tree = readKindTree();

const problems = [];
const push = (line) => problems.push(line);

for (const [tag, entry] of Object.entries(diff)) {
  if (!byId.has(tag)) { push(`no such tag: ${tag}`); continue; }
  const add = entry.add ?? [];
  const remove = entry.remove ?? [];
  for (const id of [...add, ...remove]) {
    if (!known.has(id)) push(`${tag}: no such model: ${id}`);
  }
  // the shape the editor produced while it read a staged value as the catalogue's own
  const both = add.filter((id) => remove.includes(id));
  for (const id of both) push(`${tag}: ${id} is in both add and remove`);
}

// K1 and U1 checked against the result, not the current state
const touched = [...new Set(Object.values(diff).flatMap((e) => [...(e.add ?? []), ...(e.remove ?? [])]))];
const typeOf = (id) => byId.get(id)?.type ?? 'tag';
const after = new Map();
for (const id of touched) {
  const own = new Set(source.tags.filter((t) => (t.models ?? []).includes(id)).map((t) => t.id));
  for (const [tag, e] of Object.entries(diff)) {
    if ((e.add ?? []).includes(id)) own.add(tag);
    if ((e.remove ?? []).includes(id)) own.delete(tag);
  }
  after.set(id, own);
  const kinds = [...own].filter((t) => typeOf(t) === 'kind');
  if (kinds.length !== 1) push(`${id}: ${kinds.length} kinds after applying (${kinds.join(', ') || 'none'}) — K1 wants exactly one`);
  for (const k of kinds) if (!tree.has(k)) push(`${id}: ${k} is not in Appendix B`);
  for (const u of [...own].filter((t) => typeOf(t) === 'use')) {
    if (!USES.includes(u.replace(/^use:/, ''))) push(`${id}: ${u} is not one of the eight uses`);
  }
}

if (problems.length) {
  console.error(`${problems.length} problem(s); nothing written:`);
  for (const line of problems) console.error(`  ${line}`);
  process.exit(1);
}

// what changes, per model, so the diff is reviewable before it lands
const kindsOf = (set) => [...set].filter((t) => typeOf(t) === 'kind');
console.log(`${touched.length} model(s) in ${Object.keys(diff).length} tag(s)${DRY ? ' — dry run' : ''}\n`);
for (const id of [...touched].sort()) {
  const before = source.tags.filter((t) => (t.models ?? []).includes(id)).map((t) => t.id);
  const was = kindsOf(new Set(before)).join(', ') || '—';
  const now = kindsOf(after.get(id)).join(', ') || '—';
  const gained = [...after.get(id)].filter((t) => !before.includes(t) && typeOf(t) !== 'kind');
  const lost = before.filter((t) => !after.get(id).has(t) && typeOf(t) !== 'kind');
  const extra = [...gained.map((t) => `+${t}`), ...lost.map((t) => `-${t}`)].join(' ');
  console.log(`  ${id.padEnd(44)} ${was} → ${now}${extra ? `   ${extra}` : ''}`);
}

if (DRY) process.exit(0);

let added = 0;
let removed = 0;
for (const [tag, entry] of Object.entries(diff)) {
  const t = byId.get(tag);
  const models = new Set(t.models ?? []);
  for (const id of entry.add ?? []) { if (!models.has(id)) { models.add(id); added++; } }
  for (const id of entry.remove ?? []) { if (models.delete(id)) removed++; }
  t.models = [...models].sort();
}

writeFileSync(TAGS, JSON.stringify(source, null, 1) + '\n');
console.log(`\n${added} added, ${removed} removed → catalog/tags.json`);
console.log('now run: node catalog/tools/build-catalog.mjs');
