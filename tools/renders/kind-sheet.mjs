import { mkdirSync, rmSync, copyFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HELP = `kind-sheet.mjs (--kind <id[,id]> | --prefix <id> | --models <kit/name[,kit/name]>) --out <dir>
               [--ref <git rev>] [--views iso] [--modes pbr,claywire] [--ss 1] [--chunk 16]
               [--no-render] [--no-glb-lint] [--no-chunks] [--each] [--free-scale]

Gathers every catalogue model of a kind, of every kind under a prefix, or of a
list, into <out>/src with the colormap beside them, and renders them on one
sheet per mode at locked scale, so each model is seen beside its peers at a
comparable size. More than --chunk models also get sheets of --chunk models
each, at larger tiles, in <out>/<mode>/c01, c02, …; those are not scale-locked
across chunks. --free-scale fits each tile to its own model instead of locking
the scale. --ref takes the files from that git revision instead of the
working tree, so a before sheet is one extra run.

--each also renders every model on its own, close: pbr and claywire, from iso,
205/45 and a low view at 30/-20, in <out>/each/<tile>.png. These are where
triangle-level faults show: a jagged band edge, light and dark triangles side
by side, slivers, a wobbling surface, backfaces.

<out>/dossier.json carries, per model, what catalog/build/catalog.json records
(size, extents, triangles, bands and their names, colours, tags, variant group,
lint), its ratio to the kind median for triangles, tris per unit and longest
extent, the findings of lint/glb-lint.mjs on the gathered files, and the tile
name it carries on the sheets.`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RENDER = join(ROOT, 'tools', 'renders', 'render.mjs');
const GLB_LINT = join(ROOT, 'lint', 'glb-lint.mjs');
const COLORMAP = join(ROOT, 'kits', 'colormap.png');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);
if (has('help') || args.length === 0) {
  console.log(HELP);
  process.exit(0);
}

const out = flag('out');
if (!out) throw new Error('--out is required');
const kinds = flag('kind')?.split(',').filter(Boolean) ?? [];
const prefix = flag('prefix');
const only = flag('models')?.split(',').filter(Boolean) ?? [];
const ref = flag('ref');
const views = flag('views', 'iso');
const modes = flag('modes', 'pbr,claywire').split(',').filter(Boolean);
const ss = flag('ss', '1');
const chunk = Number(flag('chunk', '16'));

const catalog = JSON.parse(readFileSync(join(ROOT, 'catalog', 'build', 'catalog.json'), 'utf8'));
const lanes = JSON.parse(readFileSync(join(ROOT, 'lint', 'materials.json'), 'utf8')).bands;
const bandOfCell = new Map(Object.entries(lanes).filter(([, cell]) => cell).map(([band, cell]) => [cell, band]));
const groupOf = new Map();
for (const group of Object.values(catalog.variants ?? {})) for (const id of group.members ?? []) groupOf.set(id, group.id);

const idOf = (m) => `${m.kit}/${m.name}`;
const models = catalog.models.filter((m) => {
  if (only.length) return only.includes(idOf(m));
  if (kinds.length) return kinds.includes(m.kind);
  if (prefix) return m.kind === prefix || m.kind.startsWith(`${prefix}-`);
  return false;
});
if (!models.length) throw new Error('no catalogue models match');
models.sort((a, b) => idOf(a).localeCompare(idOf(b)));

const tileOf = (m) => `${m.kit}__${m.name}`;
const workfile = (m) => join(ROOT, 'kits', 'workfiles', m.kit, `${m.name}.glb`);

function place(dir, list) {
  mkdirSync(join(dir, 'Textures'), { recursive: true });
  copyFileSync(COLORMAP, join(dir, 'Textures', 'colormap.png'));
  for (const m of list) {
    const target = join(dir, `${tileOf(m)}.glb`);
    if (ref) {
      const bytes = execFileSync('git', ['show', `${ref}:kits/workfiles/${m.kit}/${m.name}.glb`], { cwd: ROOT, maxBuffer: 1 << 28 });
      writeFileSync(target, bytes);
    } else {
      copyFileSync(workfile(m), target);
    }
  }
}

rmSync(out, { recursive: true, force: true });
const src = join(out, 'src');
place(src, models);

const chunks = [];
if (!has('no-chunks') && chunk > 0 && models.length > chunk) {
  for (let i = 0; i < models.length; i += chunk) {
    const name = `c${String(chunks.length + 1).padStart(2, '0')}`;
    const list = models.slice(i, i + chunk);
    place(join(src, name), list);
    chunks.push({ name, models: list.map(idOf) });
  }
}

const median = (values) => {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const longest = (m) => Math.max(...(m.wdh ?? [0]));
const medians = {
  tris: median(models.map((m) => m.tris)),
  tpu: median(models.map((m) => m.tpu)),
  bands: median(models.map((m) => m.bands)),
  longest: median(models.map(longest)),
  minTube: median(models.map((m) => m.minTube).filter((v) => v > 0)),
  anglePct: median(models.map((m) => m.anglePct)),
};
const ratio = (v, med) => (med ? Number((v / med).toFixed(2)) : null);

const glbFindings = new Map();
if (!has('no-glb-lint')) {
  const report = join(out, 'glb-lint.json');
  try {
    execFileSync('node', [GLB_LINT, src, '--only-problems', '--json', report], { cwd: ROOT, stdio: 'pipe', maxBuffer: 1 << 26 });
  } catch (e) {
    if (!existsSync(report)) console.error(`glb-lint failed: ${e.stderr?.toString().trim() || e.message}`);
  }
  if (existsSync(report)) {
    for (const entry of JSON.parse(readFileSync(report, 'utf8'))) {
      const tile = entry.file.split('/').pop().replace(/\.glb$/, '');
      glbFindings.set(tile, { findings: entry.findings ?? [], stats: entry.stats ?? null });
    }
  }
}

const dossier = {
  selection: only.length ? { models: only } : kinds.length ? { kinds } : { prefix },
  ref: ref ?? 'worktree',
  count: models.length,
  medians,
  sheets: {},
  chunks,
  models: models.map((m) => ({
    id: idOf(m),
    tile: tileOf(m),
    file: `kits/workfiles/${m.kit}/${m.name}.glb`,
    kind: m.kind,
    size: m.size,
    wdh: m.wdh,
    longest: longest(m),
    tris: m.tris,
    tpu: m.tpu,
    mat: m.mat,
    bands: m.bands,
    bandNames: Object.keys(m.spread ?? {}).map((cell) => bandOfCell.get(cell) ?? cell),
    colors: m.colors,
    calls: m.calls,
    minTube: m.minTube,
    minEdge: m.minEdge,
    anglePct: m.anglePct,
    grad: m.grad,
    tags: m.tags,
    variantGroup: groupOf.get(idOf(m)) ?? null,
    lint: m.lint ?? [],
    glbLint: glbFindings.get(tileOf(m)) ?? null,
    vsKind: {
      tris: ratio(m.tris, medians.tris),
      tpu: ratio(m.tpu, medians.tpu),
      longest: ratio(longest(m), medians.longest),
    },
  })),
};

function render(dir, target, mode) {
  const argv = [RENDER, dir, '--out', target, '--modes', mode, '--views', views, '--sheet', '--sheet-only', ...(has('free-scale') ? [] : ['--lock-scale']), '--ss', ss];
  execFileSync('node', argv, { cwd: ROOT, stdio: 'pipe', maxBuffer: 1 << 26 });
  return join(target, 'sheet.png');
}

if (!has('no-render')) {
  for (const mode of modes) {
    const target = join(out, mode);
    dossier.sheets[mode] = { full: render(src, target, mode), chunks: [] };
    for (const c of chunks) dossier.sheets[mode].chunks.push(render(join(src, c.name), join(target, c.name), mode));
  }
}
{
  if (has('each')) {
    const each = join(out, 'each');
    const raw = join(out, 'each-raw');
    execFileSync('node', [RENDER, src, '--out', raw, '--modes', 'pbr,claywire', '--views', 'iso,205/45,30/-20', '--sheet-only', '--sheet-each', '--ss', ss], { cwd: ROOT, stdio: 'pipe', maxBuffer: 1 << 26 });
    mkdirSync(each, { recursive: true });
    for (const m of dossier.models) {
      const found = execFileSync('find', [raw, '-name', '*.png', '-path', `*${m.tile}*`], { encoding: 'utf8' }).split('\n').filter(Boolean);
      const sheet = found.find((p) => /sheet/.test(p)) ?? found[0];
      if (!sheet) continue;
      const target = join(each, `${m.tile}.png`);
      copyFileSync(sheet, target);
      m.closeUp = target;
    }
    rmSync(raw, { recursive: true, force: true });
  }
}

writeFileSync(join(out, 'dossier.json'), JSON.stringify(dossier, null, 1) + '\n');
console.log(`${models.length} models -> ${join(out, 'dossier.json')}`);
for (const [mode, s] of Object.entries(dossier.sheets)) {
  console.log(`${mode}: ${s.full}${s.chunks.length ? ` + ${s.chunks.length} chunk sheets` : ''}`);
}
