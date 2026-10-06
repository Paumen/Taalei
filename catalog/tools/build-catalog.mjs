import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { readKindTree, kindIs, SIZES, sizeOf } from './kinds.mjs';
import { buildScaleGroups, byLongest } from './scale-groups.mjs';
import { atlasKey, readAtlas, hex, round, COLUMNS, ROWS } from './measure.mjs';
import { attributeKinds, buildChecks, buildKitScales, checkModel, limitsForModel, SCALE_PREFIX } from '../../lint/rules.mjs';
import { BRONKITS } from './bronkits.mjs';
import { stampPages } from './stamp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CATALOG_DIR = join(ROOT, 'catalog');
const DATA_DIR = join(CATALOG_DIR, 'data');
const BUILD_DIR = join(CATALOG_DIR, 'build');
const KITS_DIR = join(ROOT, 'kits');
const MODEL_DIR = join(KITS_DIR, 'workfiles');
const MODEL_PATH = 'kits/workfiles';



const LINT_VARS = JSON.parse(readFileSync(join(ROOT, 'lint', 'variables.json'), 'utf8'));
const LINT_MATERIALS = JSON.parse(readFileSync(join(ROOT, LINT_VARS.materials), 'utf8'));
const LINT_CHECKS = buildChecks({
  vars: LINT_VARS,
  kinds: JSON.parse(readFileSync(join(ROOT, LINT_VARS.kinds), 'utf8')),
  materials: LINT_MATERIALS,
  measures: JSON.parse(readFileSync(join(ROOT, LINT_VARS.measures), 'utf8')),
});
const MATERIAL_TREE = LINT_CHECKS.materialIds;
const BACKFACES = existsSync(join(ROOT, LINT_VARS.backface.file))
  ? JSON.parse(readFileSync(join(ROOT, LINT_VARS.backface.file), 'utf8')).models
  : {};
const noBackface = [];
function backfaceOf(id, hash) {
  const m = BACKFACES[id];
  if (m?.hash !== hash) { noBackface.push(id); return {}; }
  return m.share >= LINT_VARS.backface.warn ? { backface: { share: m.share, view: m.view, causes: m.causes } } : {};
}
const stripNull = (key, value) => (value === null ? undefined : value);

function readKitMetadata() {
  const source = readFileSync(join(DATA_DIR, 'manifest.js'), 'utf8');
  const context = { window: {} };
  runInNewContext(source, context, { timeout: 5000, filename: 'catalog/data/manifest.js' });

  const kits = context.window.KENNEY_KITS;
  if (!Array.isArray(kits)) {
    throw new Error('catalog/data/manifest.js does not set a window.KENNEY_KITS array');
  }

  const meta = new Map();
  const collections = [];
  for (const kit of kits) {
    if (kit.collection) {
      collections.push({ slug: kit.collection, name: kit.name ?? kit.collection, note: kit.note ?? null, kits: kit.kits });
      continue;
    }
    meta.set(kit.slug, {
      name: kit.name ?? kit.slug,
      url: kit.url,
      note: kit.note ?? null,
      ownPalette: kit.ownPalette === true,
      licenseLabel: kit.licenseLabel ?? 'CC0',
    });
  }
  for (const c of collections) {
    const unknown = c.kits.filter((k) => !meta.has(k));
    if (unknown.length) throw new Error(`manifest.js collection ${c.slug} names unknown kits: ${unknown.join(', ')}`);
  }
  return { meta, collections };
}

function readVariants(idsInCatalog) {
  const file = join(DATA_DIR, 'asset_variants.json');
  if (!existsSync(file)) return { groups: [], perModel: new Map() };

  const source = JSON.parse(readFileSync(file, 'utf8'));
  const groups = [];
  const perModel = new Map();

  source.clusters?.forEach((cluster, n) => {
    const members = cluster.members.filter((id) => idsInCatalog.has(id));
    if (members.length < 2) return;
    const id = `v${String(n + 1).padStart(2, '0')}`;
    const main = members.includes(cluster.main) ? cluster.main : members[0];
    groups.push({ id, type: cluster.type, main, members });
    for (const member of members) perModel.set(member, id);
  });

  return { groups, perModel };
}

function laneColor(atlas, lane) {
  const [column, row] = lane.split(',').map(Number);
  const cellWidth = atlas.width / COLUMNS;
  const cellHeight = atlas.height / ROWS;
  const x = Math.floor(column * cellWidth + cellWidth / 2);
  const y = Math.floor(row * cellHeight + cellHeight / 2);
  const i4 = (y * atlas.width + x) * 4;
  return hex(atlas.pixels[i4], atlas.pixels[i4 + 1], atlas.pixels[i4 + 2]);
}

const { meta: kitMeta, collections } = readKitMetadata();
const collectionOf = new Map(collections.flatMap((c) => c.kits.map((k) => [k, c.slug])));
const kitSlugs = readdirSync(MODEL_DIR)
  .filter((name) => statSync(join(MODEL_DIR, name)).isDirectory())
  .sort();

const CACHE_FILE = join(KITS_DIR, '.cache', 'build-catalog.json');
const TOOLING = createHash('sha256')
  .update(['build-catalog.mjs', 'measure.mjs', 'glb.mjs', 'png.mjs'].map((f) => readFileSync(join(CATALOG_DIR, 'tools', f), 'utf8')).join(''))
  .digest('hex')
  .slice(0, 12);
const oldCache = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, 'utf8')) : {};
const cache = oldCache.tooling === TOOLING ? oldCache.models : {};
const newCache = {};
let fromCache = 0;

function kitFiles(slug) {
  return readdirSync(join(MODEL_DIR, slug))
    .filter((n) => n.endsWith('.glb'))
    .sort();
}

const hashes = new Map();
function fileHash(dir, file) {
  const path = join(dir, file);
  if (!hashes.has(path)) {
    const bytes = readFileSync(path);
    hashes.set(path, { hash: createHash('sha256').update(bytes).digest('hex').slice(0, 16), bytes: bytes.length });
  }
  return hashes.get(path);
}

function isFresh(cached, hash) {
  return cached?.hash === hash && (!cached.atlas || atlasKey(join(ROOT, cached.atlas)) === cached.atlasKey);
}

async function measureAll(todo, jobs) {
  const results = new Map();
  let next = 0;
  const run = () => new Promise((done, fail) => {
    const worker = new Worker(new URL('./measure.mjs', import.meta.url));
    const send = () => {
      if (next >= todo.length) { worker.terminate().then(() => done()); return; }
      const item = todo[next++];
      worker.removeAllListeners('message');
      worker.on('message', ({ result, error }) => {
        if (error) { worker.terminate(); fail(new Error(error)); return; }
        results.set(item.path, result);
        send();
      });
      worker.postMessage({ dir: item.dir, file: item.file });
    };
    worker.on('error', fail);
    send();
  });
  await Promise.all(Array.from({ length: Math.min(jobs, todo.length) }, run));
  return results;
}

const jobsArg = process.argv.indexOf('--jobs');
const JOBS = Math.max(1, Number(jobsArg === -1 ? availableParallelism() : process.argv[jobsArg + 1]) || 1);
const todo = [];
for (const slug of kitSlugs) {
  const dir = join(MODEL_DIR, slug);
  for (const file of kitFiles(slug)) {
    const path = `${MODEL_PATH}/${slug}/${file}`;
    if (!isFresh(cache[path], fileHash(dir, file).hash)) todo.push({ dir, file, path });
  }
}
const fresh = await measureAll(todo, JOBS);

function measured(dir, file, path) {
  const { hash, bytes } = fileHash(dir, file);
  const cached = cache[path];
  const entry = fresh.has(path) ? JSON.parse(JSON.stringify({ hash, bytes, ...fresh.get(path) })) : cached;
  if (!fresh.has(path)) fromCache++;
  newCache[path] = entry;
  return entry;
}

const kits = [];
const models = [];
const colorPerModel = new Map();
const noMetadata = [];
const noColor = [];

for (const slug of kitSlugs) {
  const dir = join(MODEL_DIR, slug);
  const meta = kitMeta.get(slug);
  if (!meta) noMetadata.push(slug);

  const files = kitFiles(slug);
  if (files.length === 0) continue;

  const scales = {};
  const smooth = {};
  const origins = {};
  const tally = (counts, key) => { counts[key] = (counts[key] ?? 0) + 1; };

  for (const file of files) {
    const name = file.replace(/\.glb$/, '');
    const path = `${MODEL_PATH}/${slug}/${file}`;
    const entry = measured(dir, file, path);
    tally(scales, entry.schaal);
    tally(smooth, entry.smooth ? 'smooth' : 'none');
    tally(origins, entry.bron);
    const read = {
      atlas: entry.atlas ? join(ROOT, entry.atlas) : null,
      lanes: new Set(entry.lanes),
      gradient: new Map(entry.gradient),
      materials: new Map(entry.materials),
    };
    if (read.lanes.size === 0 && read.materials.size === 0) noColor.push(`${slug}/${name}`);
    const paletteKey = entry.atlasKey ?? `material:${slug}`;
    colorPerModel.set(`${slug}/${name}`, { ...read, paletteKey });

    models.push({
      id: `${slug}/${name}`,
      name,
      kit: slug,
      collection: collectionOf.get(slug),
      palette: null,
      colors: [],
      path,
      hash: entry.hash.slice(0, 10),
      bytes: entry.bytes,
      ...JSON.parse(JSON.stringify(entry.fields)),
      ...backfaceOf(`${slug}/${name}`, entry.hash),
    });
  }

  kits.push({
    slug,
    name: meta?.name ?? slug,
    short: (meta?.name ?? slug).replace(/\s+Kit$/, ''),
    url: meta?.url ?? null,
    license: `${MODEL_PATH}/${slug}/LICENSE.txt`,
    licenseLabel: meta?.licenseLabel ?? 'CC0',
    count: files.length,
    ownPalette: meta?.ownPalette ?? false,
    note: meta?.note ?? null,
    palette: null,
    scales,
    smooth,
    origins,
  });
}

mkdirSync(dirname(CACHE_FILE), { recursive: true });
writeFileSync(CACHE_FILE, JSON.stringify({ tooling: TOOLING, models: newCache }));
console.log(`${fromCache} of ${Object.keys(newCache).length} workfiles came from the cache in kits/.cache`);
if (noBackface.length) {
  console.warn(`! ${noBackface.length} workfiles have no current backface measure, run catalog/tools/backfaces.mjs first: ${noBackface.slice(0, 5).join(', ')}${noBackface.length > 5 ? ', …' : ''}`);
}

const TYPES = ['material', 'kind', 'size', 'attribute', 'theme', 'artist', 'tag'];
const KIND_TREE = readKindTree();

const SOURCES = [
  { id: 'ken', name: 'Kenney', description: 'Kits from Kenney (kenney.nl).' },
  { id: 'kay', name: 'KayKit', description: 'Kits from Kay Lousberg (kaylousberg.com).' },
  { id: 'qua', name: 'Quaternius', description: 'Kits from Quaternius (quaternius.com).' },
  { id: 'isa', name: 'Isa', description: 'Kits from Isa Lousberg (isalousberg.com).' },
  { id: 'wizp', name: 'WizP', description: 'Kits from WizP (wizp.itch.io).' },
  { id: 'rgp', name: 'RGP', description: 'Kits from RG Poly.' },
  { id: 'styloo', name: 'Styloo', description: 'Kits from Styloo (styloo.itch.io).' },
  { id: 'fs', name: 'FS', description: 'Kits from FS.' },
  { id: 'lpa', name: 'LPA', description: 'Kits from LPA.' },
  { id: 'sidequest', name: 'The SideQuest Shop', description: 'Kits from The SideQuest Shop (thesidequestshop.itch.io).' },
  { id: 'shmiggy', name: 'OG Shmiggy', description: 'Kits from OG Shmiggy (og-shmiggy.itch.io).' },
  { id: 'ipoly', name: 'iPoly3D', description: 'Kits from iPoly3D (poly.pizza/u/iPoly3D).' },
  { id: 'milkandbanana', name: 'MilkAndBanana', description: 'Kits from MilkAndBanana.' },
  { id: 'creativetrio', name: 'Creative Trio', description: 'Kits from Creative Trio.' },
  { id: 'rey', name: 'reyshapes', description: 'Kits from reyshapes (poly.pizza/u/reyshapes).' },
  { id: 'gualtieris', name: 'Gualtieris', description: 'Kits from Gualtieris.' },
  { id: 'polygonalmind', name: 'Polygonal Mind', description: 'Kits from Polygonal Mind (polygonalmind.com).' },
];

function readSourcePerKit() {
  const ids = new Set(SOURCES.map((s) => s.id));
  const perKit = new Map();
  const unknown = [];

  for (const { kit, source } of BRONKITS) {
    if (!kit || !source) continue;
    if (!ids.has(source)) { unknown.push(`${kit}: ${source}`); continue; }
    perKit.set(kit, source);
  }
  if (unknown.length) throw new Error(`bronkits.mjs source is not in SOURCES: ${unknown.join(', ')}`);

  return perKit;
}

const SOURCE_PER_KIT = readSourcePerKit();

const DERIVED = [
  ...SIZES.map(({ id, name }) => ({
    id,
    name,
    type: 'size',
    belongs: (m) => sizeOf(m.wdh) === id,
  })),
  ...SOURCES.map(({ id, name, description }) => ({
    id,
    name,
    type: 'artist',
    description,
    belongs: (m) => SOURCE_PER_KIT.get(m.kit) === id,
  })),
  {
    id: 'animation',
    name: 'Animation',
    description:
      'Carries an animation clip in the .glb: things that open, flip or turn. Exempt from I08 and I11, so its moving parts may be transparent and draw separately.',
    belongs: (m) => Boolean(m.animations?.length),
  },
];

function readTags(known) {
  const file = join(DATA_DIR, 'tags.json');
  if (!existsSync(file)) return { tags: [], perModel: new Map() };

  const { tags = [] } = JSON.parse(readFileSync(file, 'utf8'));
  const perModel = new Map();
  const unknown = [];

  for (const tag of tags) {
    for (const id of tag.models ?? []) {
      if (!known.has(id)) {
        unknown.push(`${tag.id}: ${id}`);
        continue;
      }
      const own = perModel.get(id) ?? [];
      own.push(tag.id);
      perModel.set(id, own);
    }
  }
  if (unknown.length) console.warn(`! tag references an unknown model: ${unknown.join(', ')}`);

  const noType = tags.filter((t) => !TYPES.includes(t.type)).map((t) => t.id);
  if (noType.length) console.warn(`! tag without a valid type: ${noType.join(', ')}`);

  const material = new Set(tags.filter((t) => t.type === 'material').map((t) => t.id));
  const parentOfTag = new Map(tags.filter((t) => t.parent).map((t) => [t.id, t.parent]));
  const badParent = [];
  for (const tag of tags) {
    if (!tag.parent) continue;
    if (!material.has(tag.parent)) { badParent.push(`${tag.id} -> ${tag.parent}`); continue; }
    const seen = new Set([tag.id]);
    for (let p = tag.parent; p; p = parentOfTag.get(p)) {
      if (seen.has(p)) { badParent.push(`${tag.id} -> ${tag.parent} (cycle)`); break; }
      seen.add(p);
    }
  }
  if (badParent.length) console.warn(`! parent is not a material: ${badParent.join(', ')}`);

  const unknownMaterial = [...material].filter((id) => !MATERIAL_TREE.has(id));
  if (unknownMaterial.length) throw new Error(`material not in lint/materials.json: ${unknownMaterial.join(', ')}`);
  const missingMaterial = [...MATERIAL_TREE].filter((id) => !material.has(id));
  if (missingMaterial.length) throw new Error(`lint/materials.json material not in tags.json: ${missingMaterial.join(', ')}`);

  const unknownKind = tags.filter((t) => t.type === 'kind' && !KIND_TREE.has(t.id)).map((t) => t.id);
  if (unknownKind.length) throw new Error(`kind not in lint/kinds.json: ${unknownKind.join(', ')}`);
  const missingKind = [...KIND_TREE.keys()].filter((id) => !tags.some((t) => t.type === 'kind' && t.id === id));
  if (missingKind.length) throw new Error(`lint/kinds.json kind not in tags.json: ${missingKind.join(', ')}`);
  const closed = new Set(tags.filter((t) => t.type === 'kind').map((t) => t.id));
  const shadowed = tags.filter((t) => t.type === 'tag' && closed.has(t.id)).map((t) => t.id);
  if (shadowed.length) console.warn(`! open tag shares an id with a kind: ${shadowed.join(', ')}`);

  const kindsPer = new Map();
  for (const tag of tags) {
    if (tag.type !== 'kind') continue;
    for (const id of tag.models ?? []) kindsPer.set(id, [...(kindsPer.get(id) ?? []), tag.id]);
  }
  const several = [...kindsPer].filter(([, k]) => k.length > 1).map(([id, k]) => `${id}: ${k.join(', ')}`);
  if (several.length) console.warn(`! more than one kind (K1): ${several.join('; ')}`);
  const noKind = [...known].filter((id) => !kindsPer.has(id));
  if (noKind.length) console.warn(`! ${noKind.length} model(s) without a kind (K1): ${noKind.join(', ')}`);

  const parentOnTop = [];
  for (const [id, own] of perModel) {
    for (const tagId of own) {
      for (let p = parentOfTag.get(tagId); p; p = parentOfTag.get(p)) {
        if (own.includes(p)) parentOnTop.push(`${id}: ${p} + ${tagId}`);
      }
    }
  }
  if (parentOnTop.length) throw new Error(`material carried with its own subtype: ${parentOnTop.join('; ')}`);

  const clashes = tags.filter((t) => DERIVED.some((a) => a.id === t.id)).map((t) => t.id);
  if (clashes.length) console.warn(`! tag is in tags.json but is also derived: ${clashes.join(', ')}`);

  return {
    tags: tags.map(({ models: members = [], ...tag }) => ({
      ...tag,
      count: members.filter((id) => known.has(id)).length,
    })),
    perModel,
  };
}

const knownSlugs = new Set(kits.map((k) => k.slug));
const strayKits = [...SOURCE_PER_KIT.keys()].filter((slug) => !knownSlugs.has(slug));
if (strayKits.length) console.warn(`! bronkits.mjs gives a source to a kit that isn't in the catalog: ${strayKits.join(', ')}`);

const variants = readVariants(new Set(models.map((m) => m.id)));
for (const model of models) {
  const group = variants.perModel.get(model.id);
  if (group) model.variant = group;
}

const tags = readTags(new Set(models.map((m) => m.id)));

const typeOf = new Map(tags.tags.map((t) => [t.id, t.type ?? 'tag']));
const specialReasons = tags.tags.find((t) => t.id === 'special')?.reasons ?? {};
for (const model of models) {
  const own = tags.perModel.get(model.id) ?? [];
  model.kind = own.find((id) => typeOf.get(id) === 'kind') ?? null;
  model.size = sizeOf(model.wdh);
  const rest = own.filter((id) => !['kind', 'size'].includes(typeOf.get(id)));
  model.tags = rest;
  const specialBand = own.includes('special') && specialReasons[model.id]?.match(/\b\d+,\d+\b/)?.[0];
  if (specialBand) model.specialBand = specialBand;
}
for (const { id, name, type = 'tag', description, belongs } of DERIVED) {
  const members = models.filter(belongs);
  if (members.length === 0) continue;
  if (type !== 'size') for (const model of members) model.tags.push(id);
  tags.tags.push({
    id,
    name,
    type,
    description: [description, 'Derived from the models themselves, so not tracked in catalog/data/tags.json.']
      .filter(Boolean).join(' '),
    count: members.length,
  });
}

for (const model of models) {
  model.tags.sort();
  if (!model.tags.length) delete model.tags;
}
for (const tag of tags.tags) {
  if (tag.type !== 'kind') continue;
  tag.count = models.filter((m) => kindIs(m.kind, tag.id)).length;
}

const palettes = new Map();

for (const model of models) {
  const read = colorPerModel.get(model.id);
  if (!read || (read.lanes.size === 0 && read.materials.size === 0)) continue;

  if (!palettes.has(read.paletteKey)) {
    palettes.set(read.paletteKey, {
      atlas: read.atlas,
      kits: new Set(),
      lanes: new Set(),
      materials: new Map(),
    });
  }
  const palette = palettes.get(read.paletteKey);
  palette.kits.add(model.kit);

  for (const lane of read.lanes) palette.lanes.add(lane);
  for (const [hex, name] of read.materials) {
    if (!palette.materials.has(hex)) palette.materials.set(hex, new Set());
    palette.materials.get(hex).add(name);
  }
}

const SHARED_ATLAS = join(KITS_DIR, 'colormap.png');
const sharedAtlas = existsSync(SHARED_ATLAS) ? readAtlas(SHARED_ATLAS) : null;
const sharedKey = sharedAtlas?.key ?? null;
const BANDS = sharedAtlas
  ? Object.entries(LINT_MATERIALS.bands)
    .filter(([, lane]) => lane)
    .map(([name, lane]) => ({ name, hex: laneColor(sharedAtlas, lane) }))
  : [];
const bandNameOf = new Map(BANDS.map((b) => [b.hex, b.name]));
const colorName = (hex) => bandNameOf.get(hex) ?? 'no band';

for (const [key, palette] of palettes) {
  palette.laneColor = new Map();
  if (palette.atlas) {
    const atlas = readAtlas(palette.atlas);
    for (const lane of palette.lanes) palette.laneColor.set(lane, laneColor(atlas, lane));
  }

  const kits = [...palette.kits].sort();
  const shared = kits.length > 1;
  palette.id = shared ? 'shared' : kits[0];
  palette.name = shared ? 'Shared kits' : kitMeta.get(kits[0])?.name ?? kits[0];
  palette.note = palette.atlas
    ? null
    : 'No colormap: every material in this kit carries its own base colour.';
  palette.atlasPath = !palette.atlas
    ? null
    : key === sharedKey
      ? 'kits/colormap.png'
      : palette.atlas.slice(ROOT.length + 1).split(sep).join('/');
}

for (const model of models) {
  const read = colorPerModel.get(model.id);
  const palette = palettes.get(read?.paletteKey);
  if (!palette) continue;
  model.palette = palette.id;
  model.colors = [
    ...new Set([
      ...[...read.lanes].map((lane) => palette.laneColor.get(lane)),
      ...read.materials.keys(),
    ]),
  ].sort();
}

for (const kit of kits) {
  kit.palette = models.find((m) => m.kit === kit.slug && m.palette)?.palette ?? null;
}

const colorsPerPalette = new Map();
for (const palette of palettes.values()) colorsPerPalette.set(palette.id, new Map());
for (const model of models) {
  const colors = colorsPerPalette.get(model.palette);
  if (!colors) continue;
  for (const hex of model.colors) colors.set(hex, (colors.get(hex) ?? 0) + 1);
}

const catalog = {
  kits,
  variants: variants.groups,
  tags: tags.tags,
  palettes: [...palettes.values()]
    .map((p) => ({
      id: p.id,
      name: p.name,
      atlas: p.atlasPath,
      note: p.note,
      colors: [...(colorsPerPalette.get(p.id) ?? new Map())]
        .map(([hex, count]) => ({
          hex,
          name: colorName(hex),
          texture: [...p.laneColor].filter(([, k]) => k === hex).map(([lane]) => `lane ${lane}`).join(' / ') || null,
          material: [...(p.materials.get(hex) ?? [])].sort().join(' / ') || null,
          count,
        }))
        .sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex)),
    }))
    .filter((p) => p.colors.length > 0)
    .sort((a, b) => b.colors.length - a.colors.length || a.id.localeCompare(b.id)),
  models,
};

const rows = models.map((m) => {
  const row = {
    kit: m.kit,
    collection: m.collection,
    name: m.name,
    hash: m.hash,
    kind: m.kind,
    size: m.size,
    wdh: m.wdh,
    tris: m.triangles,
    tpu: m.trianglesPerUnit,
    mat: m.materials,
    bands: m.bands,
    calls: m.calls,
    bytes: m.bytes,
    vtx: m.vertices,
    gridMod: m.isGridModular || undefined,
    grounded: m.isGrounded || undefined,
    centered: m.pivotIsCenter || undefined,
    minEdge: round(m.minEdgeLength, 4),
    minTube: m.minTube === null ? undefined : Math.floor(m.minTube * 1e4) / 1e4,
    thick: m.thickness == null ? undefined : round(m.thickness, 4),
    avgTri: round(m.averageTriangleArea, 5),
    anglePct: Math.round(m.strictAnglePercent),
    vpt: m.triangles ? round(m.vertices / m.triangles, 2) : null,
    grad: m.gradientSpread === null ? null : round(m.gradientSpread, 2),
    spread: m.laneSpread ?? undefined,
    colors: m.colors.length ? m.colors : undefined,
    tags: m.tags,
    specialBand: m.specialBand,
    anim: m.animations,
    alpha: m.alpha || undefined,
    pbr: m.pbr || undefined,
    variant: m.variant,
    backface: m.backface,
  };
  return row;
});

const THICK_PEERS = 8;
const THICK_SKIP_TAGS = ['plural', 'piece', 'comp'];
const thickPeer = (row) =>
  row.thick !== undefined && !kindIs(row.kind, 'set') && !THICK_SKIP_TAGS.some((t) => row.tags?.includes(t));
const thickByKind = new Map();
for (const row of rows.filter(thickPeer)) {
  const parts = row.kind.split('-');
  for (let n = 1; n <= parts.length; n++) {
    const kind = parts.slice(0, n).join('-');
    if (!thickByKind.has(kind)) thickByKind.set(kind, []);
    thickByKind.get(kind).push(row.thick);
  }
}
const thickMedian = new Map([...thickByKind].map(([kind, values]) => {
  const sorted = [...values].sort((a, b) => a - b), mid = sorted.length / 2;
  return [kind, sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2];
}));
for (const row of rows.filter(thickPeer)) {
  const parts = row.kind.split('-');
  let n = parts.length;
  while (n > 1 && thickByKind.get(parts.slice(0, n).join('-')).length < THICK_PEERS) n--;
  row.thickRel = round(row.thick / thickMedian.get(parts.slice(0, n).join('-')), 2);
}

LINT_CHECKS.kitScales = buildKitScales(rows, LINT_CHECKS);
const kitCheckOf = (slug) => {
  const k = LINT_CHECKS.kitScales.get(slug);
  return k && { factor: k.factor, kinds: k.kinds, level: k.level };
};
const scaledLimitKeys = () => {
  const out = {};
  for (const [kind, scale] of LINT_CHECKS.scales) {
    if (!scale) continue;
    for (const value of Object.keys(scale.config)) {
      const tag = `${SCALE_PREFIX}${value}`;
      const { limits } = limitsForModel({ kind, tags: [tag] }, LINT_CHECKS.limits.get(kind), LINT_CHECKS.scales);
      if (limits) out[`${kind} ${tag}`] = Object.fromEntries(Object.entries(limits).map(([field, { value: v }]) => [field, v]));
    }
  }
  return out;
};

const kitRow = (k) => ({
  slug: k.slug, name: k.name, url: k.url, note: k.note,
  artist: SOURCES.find((s) => s.id === SOURCE_PER_KIT.get(k.slug))?.name,
  licenseLabel: k.licenseLabel,
  count: k.count,
  packs: BRONKITS.filter((b) => b.kit === k.slug).map((b) => b.naam),
  origins: k.origins,
  scales: k.scales,
  smooth: k.smooth,
});
const addCounts = (rows, key) => {
  const out = {};
  for (const row of rows) for (const [value, n] of Object.entries(row[key] ?? {})) out[value] = (out[value] ?? 0) + n;
  return out;
};
const collectionRow = (c) => {
  const members = kits.filter((k) => collectionOf.get(k.slug) === c.slug).map(kitRow);
  const one = (key) => (new Set(members.map((m) => m[key])).size === 1 ? members[0][key] : undefined);
  return {
    slug: c.slug, name: c.name, url: one('url'), note: c.note,
    artist: one('artist'),
    licenseLabel: one('licenseLabel'),
    count: members.reduce((sum, m) => sum + m.count, 0),
    packs: members.flatMap((m) => m.packs),
    origins: addCounts(members, 'origins'),
    scales: addCounts(members, 'scales'),
    smooth: addCounts(members, 'smooth'),
    members,
  };
};
const kitRows = [];
for (const k of kits) {
  const slug = collectionOf.get(k.slug);
  if (!slug) kitRows.push(kitRow(k));
  else if (!kitRows.some((r) => r.slug === slug && r.members)) kitRows.push(collectionRow(collections.find((c) => c.slug === slug)));
}

const output = {
  kits: kitRows.map((row) => ({ ...row, kitCheck: kitCheckOf(row.slug) })),
  variants: variants.groups,
  bands: BANDS,
  tags: tags.tags.map((t) => ({
    id: t.id, name: t.name, type: t.type, description: t.description, count: t.count,
    ...(t.parent ? { parent: t.parent } : {}),
    ...(t.color ? { color: t.color } : {}),
    ...(t.type === 'attribute' ? { kinds: attributeKinds(t.id, LINT_CHECKS.vars, LINT_CHECKS.scales) ?? undefined } : {}),
  })),
  byLongest: [...new Set(models.map((m) => m.kind).filter(Boolean))].sort().filter(byLongest),
  limits: Object.fromEntries([...new Set(models.map((m) => m.kind).filter(Boolean))].sort()
    .map((kind) => [kind, Object.fromEntries(
      Object.entries(LINT_CHECKS.limits.get(kind) ?? {}).map(([field, { value }]) => [field, value]),
    )]).concat(Object.entries(scaledLimitKeys()))),
  models: rows.map((row) => ({ ...row, ...checkModel(row, LINT_CHECKS) })),
};

writeFileSync(join(BUILD_DIR, 'catalog.json'), JSON.stringify(output, stripNull, 1) + '\n');

const scaleGroups = buildScaleGroups(models);
writeFileSync(join(BUILD_DIR, 'scale-groups.json'), JSON.stringify(scaleGroups, stripNull, 1) + '\n');
const inScaleGroup = scaleGroups.reduce((sum, g) => sum + g.items.length, 0);
console.log(`${scaleGroups.length} families, ${inScaleGroup} models → catalog/build/scale-groups.json`);

stampPages();

console.log(`${models.length} models in ${kits.length} kits → catalog/build/catalog.json`);
for (const tag of tags.tags) console.log(`${tag.type} ${tag.id}: ${tag.count} models`);
for (const p of catalog.palettes) {
  console.log(`palette ${p.id} — ${p.colors.length} colours from ${p.atlas ?? 'own materials'}:`);
  for (const k of p.colors) {
    console.log(`  ${String(k.count).padStart(3)}  ${k.hex}  ${k.name}`);
  }
}

const palettePerKit = new Map();
for (const model of models) {
  if (!palettePerKit.has(model.kit)) palettePerKit.set(model.kit, new Set());
  if (model.palette) palettePerKit.get(model.kit).add(model.palette);
}
for (const [kit, used] of palettePerKit) {
  if (used.size > 1) console.warn(`! ${kit} draws from more than one palette: ${[...used].join(', ')}`);
}
const kitsPerPalette = new Map();
for (const kit of kits) {
  if (kit.palette) kitsPerPalette.set(kit.palette, (kitsPerPalette.get(kit.palette) ?? 0) + 1);
}
for (const kit of kits) {
  if (kit.palette && kitsPerPalette.get(kit.palette) === 1 && !kit.ownPalette) {
    console.warn(`! ${kit.slug} has its own palette but no "ownPalette": true in manifest.js`);
  }
}

const flat = models.filter((m) => m.trianglesPerUnit === null);
if (flat.length) {
  console.warn(`! ${flat.length} flat models without volume, so without triangles per unit: ${flat.map((m) => m.id).join(', ')}`);
}

if (noMetadata.length) console.warn(`! no metadata in manifest.js: ${noMetadata.join(', ')}`);

const noSource = kits
  .map(({ slug }) => slug)
  .filter((slug) => !SOURCE_PER_KIT.has(slug) && BRONKITS.some((b) => b.kit === slug));
if (noSource.length) console.warn(`! no source in bronkits.mjs: ${noSource.join(', ')}`);
if (noColor.length) {
  console.warn(`! ${noColor.length} models without colour in the .glb (colour filter skips them)`);
}
