import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, copyFileSync, renameSync } from 'node:fs';
import { execFileSync, execFile } from 'node:child_process';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HELP = `sheepdog.mjs pick [--out <dir>] [--count 6] [--kits 2] [--max 0] [--per-sheet 12] [--jobs 3]
                  [--kind <id[,id]>] [--dry] [--no-render]
sheepdog.mjs record --run <dir>
sheepdog.mjs review [--run <id>] [--out <list.json>] [--base origin/main]
sheepdog.mjs verdicts (--file <verdicts> | --ok <id[,id]> --nok <id[,id]>)
sheepdog.mjs brief
sheepdog.mjs stats
sheepdog.mjs open

pick    draws --count random catalogue kinds with models from at least --kits
        kits, skipping every kind in the log (--max caps the model count, 0 is
        no cap), and starts a run: the log gets one entry per kind with the
        file hash and tags of every model as they are now, and <out>/<kind>/
        gets the kind's dossier, its files under src/ and one pbr sheet per
        --per-sheet models, each tile fitted to its model, c01.png, c02.png, ….
        <out> defaults to kits/.cache/sheepdog/<run>. --kind takes those kinds
        instead of random ones. --dry prints the pool and the draw only.

record  reads <run>/<kind>/result.json for every kind of the run, applies its
        tag edits to catalog/data/tags.json, lints every changed model against
        its file before the run and flags new findings as doubt, stores the
        changes in the log.

        result.json:
        { "kind": "<id>",
          "changes": [ { "id": "kit/name",
                         "category": "colour" | "glitch" | "shape" | "detail" | "scale" |
                                     "placement" | "material" | "tag" | "kind" | "look",
                         "change": "what was done, 60 characters at most",
                         "doubt": true | false,
                         "why": "what makes it doubtful, 50 at most" } ],
          "tags": { "kit/name": { "add": ["id"], "remove": ["id"] } },
          "notes": [ "what was seen and left, for the PO" ] }
        A tag edit is also listed under changes with category tag or kind.

review  writes a list for tools/review/review.mjs build: one item per model
        changed in --run (default the latest) or doubted and not judged in an
        earlier run, high doubt when one of its changes is doubted, low when
        none is, grouped by kind. --base is the commit before the run.

verdicts takes the review page's verdicts (the file review.mjs apply reads):
        keep, keepbut, relax and other are ok; revert and retry are nok and put
        the model back as it was before the run, file and tags; later stays
        open. The verdict lands on every change of that model in its run.
        --ok and --nok take ids instead of a file.

brief   prints what the verdicts so far say per category, with the changes
        judged nok and the doubted ones judged ok, for the agents' briefing.
stats   prints counts per category and per run.
open    prints the doubted models not judged yet.`;

const CATEGORIES = ['colour', 'glitch', 'shape', 'detail', 'scale', 'placement', 'material', 'tag', 'kind', 'look'];

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LOG = join(ROOT, 'tools', 'sheepdog', 'log.json');
const TAGS = join(ROOT, 'catalog', 'data', 'tags.json');
const CATALOG = join(ROOT, 'catalog', 'build', 'catalog.json');
const KIND_SHEET = join(ROOT, 'tools', 'renders', 'kind-sheet.mjs');
const RENDER = join(ROOT, 'tools', 'renders', 'render.mjs');
const GLB_LINT = join(ROOT, 'lint', 'glb-lint.mjs');
const COLORMAP = join(ROOT, 'kits', 'colormap.png');

const args = process.argv.slice(2);
const command = args[0];
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);
const list = (name) => flag(name)?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];

if (!command || has('help')) {
  console.log(HELP);
  process.exit(0);
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const writeJson = (file, data) => writeFileSync(file, `${JSON.stringify(data, null, 1)}\n`);
const log = existsSync(LOG) ? readJson(LOG) : [];
const saveLog = () => {
  log.sort((a, b) => a.run.localeCompare(b.run) || a.kind.localeCompare(b.kind));
  writeJson(LOG, log);
};
const workfile = (id) => join(ROOT, 'kits', 'workfiles', `${id}.glb`);
const git = (argv, opts = {}) => execFileSync('git', argv, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28, ...opts });
const blobOf = (file) => git(['hash-object', '-w', file]).trim();

function tagsOf(id, tags) {
  return tags.tags.filter((t) => t.models?.includes(id)).map((t) => t.id);
}

function setTags(id, wanted, tags) {
  const want = new Set(wanted);
  for (const t of tags.tags) {
    const i = t.models?.indexOf(id) ?? -1;
    if (want.has(t.id) && i === -1) (t.models ??= []).push(id);
    if (!want.has(t.id) && i !== -1) t.models.splice(i, 1);
  }
}

function openChanges() {
  const notes = new Map();
  for (const entry of log) {
    for (const c of entry.changes ?? []) {
      if (!c.doubt || c.verdict !== null) continue;
      const text = `${c.category}: ${c.change}${c.why ? ` (${c.why})` : ''}${c.lint?.length ? ` [lint: ${c.lint.map((f) => f.split(':')[0]).join(', ')}]` : ''}`;
      notes.set(c.id, [...(notes.get(c.id) ?? []), text]);
    }
  }
  return [...notes].sort(([a], [b]) => a.localeCompare(b)).map(([id, texts]) => ({ id, note: texts.join(' · ') }));
}

function lintFindings(files) {
  const dir = join(tmpdir(), `sheepdog-lint-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(dir, 'Textures'), { recursive: true });
  copyFileSync(COLORMAP, join(dir, 'Textures', 'colormap.png'));
  const names = new Map();
  for (const [name, source] of files) {
    const target = join(dir, `${name}.glb`);
    if (Buffer.isBuffer(source)) writeFileSync(target, source);
    else copyFileSync(source, target);
    names.set(target, name);
  }
  const report = join(dir, 'report.json');
  try {
    execFileSync('node', [GLB_LINT, dir, '--only-problems', '--json', report], { cwd: ROOT, stdio: 'pipe', maxBuffer: 1 << 26 });
  } catch (e) {
    if (!existsSync(report)) throw new Error(`glb-lint failed: ${e.stderr?.toString().trim() || e.message}`);
  }
  const out = new Map();
  for (const entry of readJson(report)) {
    const name = basename(entry.file, '.glb');
    out.set(name, (entry.findings ?? []).map((f) => `${f.check}: ${f.msg}`));
  }
  rmSync(dir, { recursive: true, force: true });
  return out;
}

const runAll = (tasks, jobs) =>
  new Promise((done, fail) => {
    let next = 0;
    let active = 0;
    let failed = false;
    const step = () => {
      if (failed) return;
      if (next >= tasks.length && active === 0) return done();
      while (active < jobs && next < tasks.length) {
        active++;
        tasks[next++]().then(() => { active--; step(); }, (e) => { failed = true; fail(e); });
      }
    };
    step();
  });

const spawn = (argv) =>
  new Promise((done, fail) => {
    execFile('node', argv, { cwd: ROOT, maxBuffer: 1 << 26 }, (e, stdout, stderr) => {
      if (e) fail(new Error(`${basename(argv[0])} failed: ${stderr?.toString().trim() || e.message}`));
      else done(stdout);
    });
  });

async function pick() {
  const count = Number(flag('count', '6'));
  const minKits = Number(flag('kits', '2'));
  const max = Number(flag('max', '0'));
  const perSheet = Number(flag('per-sheet', '12'));
  const jobs = Number(flag('jobs', '3'));
  const catalog = readJson(CATALOG);
  const byKind = new Map();
  for (const m of catalog.models) {
    if (!byKind.has(m.kind)) byKind.set(m.kind, []);
    byKind.get(m.kind).push(`${m.kit}/${m.name}`);
  }
  const kitsOf = (kind) => new Set(byKind.get(kind).map((id) => id.split('/')[0])).size;
  const done = new Set(log.map((e) => e.kind));

  let kinds = list('kind');
  if (kinds.length) {
    for (const kind of kinds) if (!byKind.has(kind)) throw new Error(`no catalogue models of kind ${kind}`);
  } else {
    const pool = [...byKind.keys()].filter((kind) => {
      const n = byKind.get(kind).length;
      return kitsOf(kind) >= minKits && (max === 0 || n <= max) && !done.has(kind);
    });
    if (pool.length < count) throw new Error(`only ${pool.length} kinds left to pick; ${done.size} are in ${LOG}`);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    kinds = pool.slice(0, count);
    console.log(`${pool.length} kinds in the pool, ${done.size} logged`);
  }
  for (const kind of kinds) console.log(`${kind}  ${byKind.get(kind).length} models from ${kitsOf(kind)} kits`);
  if (has('dry')) return;

  const run = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
  const out = resolve(flag('out', join(ROOT, 'kits', '.cache', 'sheepdog', run)));
  const tags = readJson(TAGS);
  for (const kind of kinds) {
    const models = byKind.get(kind).sort().map((id) => ({ id, before: blobOf(workfile(id)), tags: tagsOf(id, tags) }));
    const open = log.find((e) => e.kind === kind && e.changes.some((c) => c.doubt && c.verdict === null));
    if (open) throw new Error(`${kind} still has open changes from run ${open.run}; review those first`);
    log.push({ kind, run, models, changes: [], notes: [] });
  }
  saveLog();

  const runFile = { run, dir: out, perSheet, kinds: [] };
  mkdirSync(out, { recursive: true });
  const tasks = kinds.map((kind) => async () => {
    const dir = join(out, kind);
    const n = byKind.get(kind).length;
    const chunk = n > perSheet ? Math.ceil(n / Math.ceil(n / perSheet)) : 0;
    await spawn([KIND_SHEET, '--kind', kind, '--out', dir, '--no-render', '--no-glb-lint', ...(chunk ? ['--chunk', String(chunk)] : ['--no-chunks'])]);
    const dossier = readJson(join(dir, 'dossier.json'));
    const sources = dossier.chunks.length ? dossier.chunks.map((c) => [c.name, join(dir, 'src', c.name), c.models]) : [['c01', join(dir, 'src'), dossier.models.map((m) => m.id)]];
    const sheets = [];
    for (const [name, src, ids] of sources) {
      const target = join(dir, 'sheets', name);
      if (!has('no-render')) {
        await spawn([RENDER, src, '--out', target, '--modes', 'pbr', '--views', 'iso', '--sheet', '--sheet-only']);
        renameSync(join(target, 'sheet.png'), join(dir, `${name}.png`));
        rmSync(target, { recursive: true, force: true });
      }
      sheets.push({ sheet: join(dir, `${name}.png`), models: ids });
    }
    rmSync(join(dir, 'sheets'), { recursive: true, force: true });
    runFile.kinds.push({ kind, dir, dossier: join(dir, 'dossier.json'), count: n, sheets });
    console.log(`${kind}: ${sheets.length} sheet${sheets.length === 1 ? '' : 's'} in ${dir}`);
  });
  await runAll(tasks, jobs);
  runFile.kinds.sort((a, b) => a.kind.localeCompare(b.kind));
  writeJson(join(out, 'run.json'), runFile);
  console.log(`run ${run}: ${kinds.length} kinds -> ${join(out, 'run.json')}`);
}

function record() {
  const dir = resolve(flag('run') ?? '');
  if (!flag('run')) throw new Error('--run <dir> is required');
  const runFile = readJson(join(dir, 'run.json'));
  const tags = readJson(TAGS);
  const rows = new Map(tags.tags.map((t) => [t.id, t]));
  const changedFiles = [];
  let total = 0;
  let doubted = 0;
  for (const { kind } of runFile.kinds) {
    const entry = log.find((e) => e.kind === kind && e.run === runFile.run);
    if (!entry) throw new Error(`${kind} is not in the log for run ${runFile.run}`);
    const file = join(dir, kind, 'result.json');
    if (!existsSync(file)) {
      console.log(`${kind}: no result.json, skipped`);
      continue;
    }
    const result = readJson(file);
    if (result.kind !== kind) throw new Error(`${file} is for ${result.kind}, not ${kind}`);
    const known = new Set(entry.models.map((m) => m.id));
    for (const [id, edit] of Object.entries(result.tags ?? {})) {
      if (!known.has(id)) throw new Error(`${kind}: ${id} is not a model of this kind`);
      const current = new Set(tagsOf(id, tags));
      for (const t of edit.remove ?? []) current.delete(t);
      for (const t of edit.add ?? []) {
        const row = rows.get(t);
        if (!row) throw new Error(`${id}: no tag ${t} in tags.json`);
        if (row.po) throw new Error(`${id}: ${t} is the PO's to assign`);
        if (row.type === 'kind') for (const other of current) if (rows.get(other)?.type === 'kind') current.delete(other);
        if (row.parent) current.delete(row.parent);
        if ([...current].some((other) => rows.get(other)?.parent === t)) throw new Error(`${id}: ${t} is the parent of a subtype the model carries`);
        current.add(t);
      }
      setTags(id, [...current], tags);
    }
    for (const c of result.changes ?? []) {
      if (!known.has(c.id)) throw new Error(`${kind}: ${c.id} is not a model of this kind`);
      if (!CATEGORIES.includes(c.category)) throw new Error(`${c.id}: category ${c.category} is not one of ${CATEGORIES.join(', ')}`);
      if (!c.change || typeof c.doubt !== 'boolean') throw new Error(`${c.id}: change and doubt are required`);
      if (c.doubt && !c.why) throw new Error(`${c.id}: a doubted change needs a why`);
      if (c.change.length > 60) throw new Error(`${c.id}: change over 60 characters: ${c.change}`);
      if ((c.why ?? '').length > 50) throw new Error(`${c.id}: why over 50 characters: ${c.why}`);
      entry.changes = entry.changes.filter((x) => x.id !== c.id || x.change !== c.change);
      entry.changes.push({ id: c.id, category: c.category, change: c.change, doubt: c.doubt, why: c.why ?? null, lint: [], verdict: null });
      total++;
    }
    entry.notes = result.notes ?? [];
    for (const m of entry.models) {
      const after = blobOf(workfile(m.id));
      if (after !== m.before) changedFiles.push([kind, m]);
    }
  }
  writeJson(TAGS, tags);

  if (changedFiles.length) {
    const before = lintFindings(changedFiles.map(([, m]) => [m.id.replace('/', '__'), git(['cat-file', 'blob', m.before], { encoding: 'buffer' })]));
    const after = lintFindings(changedFiles.map(([, m]) => [m.id.replace('/', '__'), workfile(m.id)]));
    for (const [kind, m] of changedFiles) {
      const name = m.id.replace('/', '__');
      const shape = (f) => f.replace(/[\d.,]+/g, '#');
      const had = new Set((before.get(name) ?? []).map(shape));
      const fresh = (after.get(name) ?? []).filter((f) => !had.has(shape(f)));
      const entry = log.find((e) => e.kind === kind && e.run === runFile.run);
      const own = entry.changes.filter((c) => c.id === m.id);
      if (!own.length) {
        entry.changes.push({ id: m.id, category: 'look', change: 'file changed without a listed change', doubt: true, why: 'unlisted', lint: fresh, verdict: null });
        total++;
      } else if (fresh.length) {
        for (const c of own) {
          c.lint = fresh;
          c.doubt = true;
          c.why = c.why ?? 'new lint findings';
        }
      }
    }
  }
  for (const { kind } of runFile.kinds) {
    const entry = log.find((e) => e.kind === kind && e.run === runFile.run);
    doubted += entry.changes.filter((c) => c.doubt && c.verdict === null).length;
  }
  saveLog();
  console.log(`${total} changes recorded, ${doubted} doubted; ${changedFiles.length} files changed; ${openChanges().length} models open`);
}

function review() {
  const run = flag('run', log.map((e) => e.run).sort().at(-1));
  const items = new Map();
  for (const entry of log) {
    for (const c of entry.changes) {
      if (c.verdict !== null || (entry.run !== run && !c.doubt)) continue;
      const item = items.get(c.id) ?? { model: c.id, group: entry.kind, change: [], note: [], doubt: 'low' };
      item.change.push(c.change);
      if (c.doubt) {
        item.doubt = 'high';
        item.note.push(`${c.why}${c.lint?.length ? ` [lint: ${c.lint.map((f) => f.split(':')[0]).join(', ')}]` : ''}`);
      }
      items.set(c.id, item);
    }
  }
  const list = {
    title: `Sheepdog ${run}`,
    base: flag('base', 'origin/main'),
    items: [...items.values()]
      .sort((a, b) => (a.doubt === b.doubt ? a.group.localeCompare(b.group) || a.model.localeCompare(b.model) : a.doubt === 'high' ? -1 : 1))
      .map((i) => ({ ...i, change: i.change.join('; '), note: i.note.join('; ') })),
  };
  const out = resolve(flag('out', join(tmpdir(), 'sheepdog-review.json')));
  writeJson(out, list);
  console.log(`${list.items.length} models, ${list.items.filter((i) => i.doubt === 'high').length} doubted -> ${out}`);
}

const OK = new Set(['keep', 'keepbut', 'relax', 'other']);
const NOK = new Set(['revert', 'retry']);

function verdicts() {
  const ok = new Set(list('ok'));
  const nok = new Set(list('nok'));
  if (flag('file')) {
    const text = readFileSync(resolve(flag('file')), 'utf8');
    const items = text.trim().startsWith('{')
      ? JSON.parse(text).items
      : text.split('\n').filter((l) => l.includes(':')).map((l) => ({ model: l.slice(0, l.indexOf(':')).trim(), verdict: l.slice(l.indexOf(':') + 1).trim().split(/\s+[—-]\s+/)[0].trim().toLowerCase() }));
    for (const { model, verdict } of items) {
      if (OK.has(verdict)) ok.add(model);
      else if (NOK.has(verdict)) nok.add(model);
      else console.log(`${model}: ${verdict}, left open`);
    }
  }
  if (!ok.size && !nok.size) throw new Error('nothing to apply: give --file, or --ok and --nok');
  const tags = readJson(TAGS);
  let judged = 0;
  let reverted = 0;
  for (const id of [...ok, ...nok]) {
    const verdict = nok.has(id) ? 'nok' : 'ok';
    const entries = log.filter((e) => e.changes.some((c) => c.id === id && c.verdict === null));
    if (!entries.length) {
      console.log(`${id}: no open change, skipped`);
      continue;
    }
    for (const entry of entries) {
      for (const c of entry.changes) if (c.id === id) c.verdict = verdict;
      if (verdict === 'nok') {
        const m = entry.models.find((x) => x.id === id);
        writeFileSync(workfile(id), git(['cat-file', 'blob', m.before], { encoding: 'buffer' }));
        setTags(id, m.tags, tags);
        reverted++;
      }
      judged++;
    }
  }
  writeJson(TAGS, tags);
  saveLog();
  console.log(`${judged} models judged, ${reverted} put back; ${openChanges().length} still open`);
}

function brief() {
  const changes = log.flatMap((e) => e.changes.map((c) => ({ ...c, kind: e.kind, run: e.run })));
  const judged = changes.filter((c) => c.verdict);
  console.log(`${log.length} kinds in ${new Set(log.map((e) => e.run)).size} runs, ${changes.length} changes, ${judged.length} judged`);
  if (!judged.length) return;
  console.log('\ncategory       doubted ok/nok   not doubted ok/nok');
  for (const cat of CATEGORIES) {
    const of = (doubt) => judged.filter((c) => c.category === cat && c.doubt === doubt);
    const tally = (l) => `${l.filter((c) => c.verdict === 'ok').length}/${l.filter((c) => c.verdict === 'nok').length}`;
    if (of(true).length + of(false).length) console.log(`${cat.padEnd(14)} ${tally(of(true)).padStart(12)}   ${tally(of(false)).padStart(16)}`);
  }
  const show = (title, l) => {
    if (!l.length) return;
    console.log(`\n${title}`);
    for (const c of l.slice(-30)) console.log(`- ${c.kind} ${c.id} [${c.category}${c.doubt ? ', doubted' : ''}]: ${c.change}${c.why ? ` (${c.why})` : ''}`);
  };
  show('Judged nok, so not wanted on that model; the same category elsewhere is still made, doubted:',judged.filter((c) => c.verdict === 'nok'));
  show('Doubted but judged ok, so less doubt is due:', judged.filter((c) => c.verdict === 'ok' && c.doubt));
}

function stats() {
  const changes = log.flatMap((e) => e.changes.map((c) => ({ ...c, kind: e.kind, run: e.run })));
  const tally = (l) => `${l.length} changes, ${l.filter((c) => c.doubt).length} doubted, ok ${l.filter((c) => c.verdict === 'ok').length}, nok ${l.filter((c) => c.verdict === 'nok').length}, open ${l.filter((c) => c.doubt && !c.verdict).length}`;
  console.log(`all: ${tally(changes)}`);
  for (const cat of CATEGORIES) {
    const l = changes.filter((c) => c.category === cat);
    if (l.length) console.log(`${cat.padEnd(12)} ${tally(l)}`);
  }
  console.log('');
  for (const run of [...new Set(log.map((e) => e.run))].sort()) {
    const entries = log.filter((e) => e.run === run);
    console.log(`run ${run}: ${entries.map((e) => e.kind).join(', ')}; ${tally(entries.flatMap((e) => e.changes))}`);
  }
}

const commands = { pick, record, review, verdicts, brief, stats, open: () => console.log(JSON.stringify(openChanges(), null, 1)) };
if (!commands[command]) throw new Error(`unknown command ${command}; see --help`);
await commands[command]();
