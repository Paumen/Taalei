import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { GROUPS, KIT_GROUPS, determineGroup } from './semantiek.mjs';
import { buildScaleGroups } from './schaalgroepen.mjs';
import { readGlb, readAccessor, measureScene, trianglesPerUnit, BUDGET_PER_UNIT } from './glb.mjs';
import { readPng } from './png.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CATALOG_DIR = join(ROOT, 'catalog');
const KITS_DIR = join(ROOT, 'kits');
const MODEL_DIR = join(KITS_DIR, 'workfiles');
const MODEL_PATH = 'kits/workfiles';

const COLUMNS = 16;
const ROWS = 4;

function readKitMetadata() {
  const source = readFileSync(join(CATALOG_DIR, 'manifest.js'), 'utf8');
  const context = { window: {} };
  runInNewContext(source, context, { timeout: 5000, filename: 'catalog/manifest.js' });

  const kits = context.window.KENNEY_KITS;
  if (!Array.isArray(kits)) {
    throw new Error('catalog/manifest.js does not set a window.KENNEY_KITS array');
  }

  const meta = new Map();
  for (const kit of kits) {
    meta.set(kit.slug, {
      name: kit.name,
      url: kit.url,
      tab: kit.tab ?? null,
      note: kit.note ?? null,
      outsideCatalog: kit.outsideCatalog === true,
      outsideCatalogModels: new Set(
        Array.isArray(kit.outsideCatalog) ? kit.outsideCatalog : [],
      ),
      ownPalette: kit.ownPalette === true,
      licenseLabel: kit.licenseLabel ?? 'CC0',
    });
  }
  return meta;
}

function readVariants(idsInCatalog) {
  const file = join(CATALOG_DIR, 'asset_variants.json');
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

const atlases = new Map();

function readAtlas(path) {
  if (!atlases.has(path)) {
    const png = readPng(path);
    const key = createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 12);
    atlases.set(path, { ...png, key });
  }
  return atlases.get(path);
}

function toSrgb(linear) {
  const v = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(Math.max(v, 0), 1) * 255);
}

const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

function readColors(glb, dir) {
  const { json } = glb;
  const lanes = new Set();
  const materials = new Map();
  let atlasPath = null;

  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      const material = json.materials?.[prim.material];
      if (!material) continue;
      const texIndex = material.pbrMetallicRoughness?.baseColorTexture?.index;

      if (texIndex === undefined) {
        const factor = material.pbrMetallicRoughness?.baseColorFactor;
        if (!factor) continue;
        materials.set(hex(...factor.slice(0, 3).map(toSrgb)), material.name ?? 'material');
        continue;
      }

      const source = json.images?.[json.textures?.[texIndex]?.source]?.uri;
      if (!source || prim.attributes?.TEXCOORD_0 === undefined) continue;
      const path = join(dir, decodeURIComponent(source));
      if (atlasPath && atlasPath !== path) throw new Error(`${dir}: more than one colormap in a single model`);
      atlasPath = path;

      const atlas = readAtlas(path);
      const cellWidth = atlas.width / COLUMNS;
      const cellHeight = atlas.height / ROWS;
      const uv = readAccessor(glb, prim.attributes.TEXCOORD_0);

      for (let i = 0; i < uv.count; i++) {
        const x = Math.min(Math.max(Math.floor(uv.data[i * 2] * atlas.width), 0), atlas.width - 1);
        const y = Math.min(Math.max(Math.floor(uv.data[i * 2 + 1] * atlas.height), 0), atlas.height - 1);
        const i4 = (y * atlas.width + x) * 4;
        if (atlas.pixels[i4] === 0 && atlas.pixels[i4 + 1] === 0 && atlas.pixels[i4 + 2] === 0) continue;
        lanes.add(`${Math.floor(x / cellWidth)},${Math.floor(y / cellHeight)}`);
      }
    }
  }

  return { atlas: atlasPath, lanes, materials };
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

function colorName(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  if (saturation < 0.18) {
    if (lightness > 0.8) return 'white';
    if (lightness > 0.45) return 'light grey';
    if (lightness > 0.25) return 'grey';
    return 'dark grey';
  }

  let tint = 0;
  if (max === r) tint = ((g - b) / delta) % 6;
  else if (max === g) tint = (b - r) / delta + 2;
  else tint = (r - g) / delta + 4;
  tint = (tint * 60 + 360) % 360;

  const base =
    tint < 15 || tint >= 345 ? 'red'
    : tint < 40 ? (lightness < 0.45 ? 'brown' : 'orange')
    : tint < 50 ? (lightness < 0.5 ? 'brown' : 'orange')
    : tint < 70 ? 'yellow'
    : tint < 165 ? 'green'
    : tint < 200 ? 'turquoise'
    : tint < 260 ? 'blue'
    : tint < 300 ? 'purple'
    : 'pink';

  if (lightness < 0.3) return `dark ${base}`;
  if (lightness > 0.75) return `light ${base}`;
  return base;
}

function writeVersion() {
  const content = ['catalog.json', 'catalog.css', 'catalog.js', 'schaalgroepen.json', 'schaal.js', 'swipe.css', 'swipe.js']
    .map((name) => readFileSync(join(CATALOG_DIR, name)))
    .join('');
  const version = createHash('sha256').update(content).digest('hex').slice(0, 10);

  const stamp = (path, replacements) => {
    let html = readFileSync(path, 'utf8');
    for (const [search, replacement] of replacements) html = html.replace(search, replacement);
    writeFileSync(path, html.replace(/<meta name="catalogus-versie" content="[^"]*">/, `<meta name="catalogus-versie" content="${version}">`));
  };

  stamp(join(ROOT, 'index.html'), [
    [/href="catalog\/catalog\.css(?:\?v=[a-f0-9]+)?"/, `href="catalog/catalog.css?v=${version}"`],
    [/src="catalog\/catalog\.js(?:\?v=[a-f0-9]+)?"/, `src="catalog/catalog.js?v=${version}"`],
  ]);
  stamp(join(CATALOG_DIR, 'schaal.html'), [
    [/href="catalog\.css(?:\?v=[a-f0-9]+)?"/, `href="catalog.css?v=${version}"`],
    [/src="schaal\.js(?:\?v=[a-f0-9]+)?"/, `src="schaal.js?v=${version}"`],
  ]);
  stamp(join(CATALOG_DIR, 'swipe.html'), [
    [/href="catalog\.css(?:\?v=[a-f0-9]+)?"/, `href="catalog.css?v=${version}"`],
    [/href="swipe\.css(?:\?v=[a-f0-9]+)?"/, `href="swipe.css?v=${version}"`],
    [/src="swipe\.js(?:\?v=[a-f0-9]+)?"/, `src="swipe.js?v=${version}"`],
  ]);
  console.log(`version ${version} → index.html, catalog/schaal.html, catalog/swipe.html`);
}

const kitMeta = readKitMetadata();
const kitSlugs = readdirSync(MODEL_DIR)
  .filter((name) => statSync(join(MODEL_DIR, name)).isDirectory())
  .filter((name) => !kitMeta.get(name)?.outsideCatalog)
  .sort();

const kits = [];
const models = [];
const colorPerModel = new Map();
const noMetadata = [];
const noGroup = [];
const noColor = [];

for (const slug of kitSlugs) {
  const dir = join(MODEL_DIR, slug);
  const meta = kitMeta.get(slug);
  if (!meta) noMetadata.push(slug);

  const files = readdirSync(dir)
    .filter((n) => n.endsWith('.glb'))
    .filter((n) => !meta?.outsideCatalogModels.has(n.replace(/\.glb$/, '')))
    .sort();
  if (files.length === 0) continue;

  for (const file of files) {
    const name = file.replace(/\.glb$/, '');
    const path = `${MODEL_PATH}/${slug}/${file}`;
    const glb = readGlb(join(dir, file));
    const gltf = glb.json;
    const scene = measureScene(glb);
    const group = determineGroup(slug, name);
    if (group === 'other') noGroup.push(`${slug}/${name}`);

    const read = readColors(glb, dir);
    if (read.lanes.size === 0 && read.materials.size === 0) noColor.push(`${slug}/${name}`);
    const paletteKey = read.atlas ? readAtlas(read.atlas).key : `material:${slug}`;
    colorPerModel.set(`${slug}/${name}`, { ...read, paletteKey });

    models.push({
      id: `${slug}/${name}`,
      name,
      kit: slug,
      group,
      palette: null,
      colors: [],
      path,
      bytes: statSync(join(dir, file)).size,
      triangles: scene.triangles,
      trianglesPerUnit: trianglesPerUnit(scene.triangles, scene.wdh),
      materials: (gltf.materials ?? []).length,
      wdh: scene.wdh,
      calls: scene.calls,
      ...((gltf.animations ?? []).length
        ? { animations: gltf.animations.map((a, i) => a.name ?? `animation ${i}`) }
        : {}),
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
    tab: meta?.tab ?? null,
    ownPalette: meta?.ownPalette ?? false,
    kitGroup: KIT_GROUPS[slug] ?? null,
    note: meta?.note ?? null,
    palette: null,
  });
}

const TYPES = ['material', 'tag'];

const SOURCES = [
  {
    id: 'kenney',
    name: 'Kenney',
    description:
      'Kits from Kenney (kenney.nl). One hand, one scale: everything comes from the same tile and the props fit together.',
    kits: [
      'fantasy-town-kit', 'mini-forest', 'modular-cave-kit', 'pirate-kit',
      'platformer-kit', 'prototype-kit', 'survival-kit',
    ],
  },
  {
    id: 'kaykit',
    name: 'KayKit',
    description:
      'Kits from Kay Lousberg (kaylousberg.com): dungeon, forest, halloween, resources, restaurant and rpgtools. Consistent style and level of detail across the set.',
    kits: ['dungeon', 'forest', 'halloween', 'resources', 'restaurant', 'rpgtools'],
  },
  {
    id: 'quaternius',
    name: 'Quaternius',
    description: 'Kits from Quaternius (quaternius.com): fantasy-props and quaternius-nature.',
    kits: ['fantasy-props', 'quaternius-nature'],
  },
];

const CATEGORIES = [
  { id: 'nature', name: 'Nature', tab: 'nature',
    description: 'What is already there without anyone doing anything: ground, trees, plants, seabed and rocks.' },
  { id: 'structure', name: 'Structure', tab: 'structures',
    description: 'What has been built: building kits, structures, stairs and bridges, fences.' },
  { id: 'object', name: 'Object', tab: null,
    description: 'Loose things you place or pick up: furniture, ships, food, chests, resources, tools, signs, items and lights.' },
];

const TAB_PER_GROUP = new Map(GROUPS.map((g) => [g.id, g.tab ?? null]));

const DERIVED = [
  ...CATEGORIES.map(({ id, name, description, tab }) => ({
    id,
    name,
    description,
    belongs: (m) => m.group !== 'assemblies' && TAB_PER_GROUP.get(m.group) === tab,
  })),
  ...SOURCES.map(({ id, name, description, kits }) => ({
    id,
    name,
    description,
    belongs: (m) => kits.includes(m.kit),
  })),
  {
    id: 'animation',
    name: 'Animation',
    description:
      'Carries its own animations in the .glb — chests and doors that open and close, a lever that flips, a compass that opens.',
    belongs: (m) => Boolean(m.animations?.length),
  },
  {
    id: 'modular',
    name: 'Modular',
    description:
      'Clicks onto the grid with matching pieces: the walls, roofs, pillars and floors of the three building kits. You don\'t place them loose but build something out of them, and they only fit within their own kit.',
    belongs: (m) => m.group === 'building-kit',
  },
  {
    id: 'assembly',
    name: 'Assembly',
    description:
      'Not one thing but a little scene that\'s finished as it stands: a set table, a stack of crates, a chest full of bottles, the bars and stacks from the resources kit.',
    belongs: (m) => m.group === 'assemblies',
  },
];

function readTags(known) {
  const file = join(CATALOG_DIR, 'tags.json');
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
const noSource = kits.filter((k) => !SOURCES.some((s) => s.kits.includes(k.slug))).map((k) => k.slug);
for (const source of SOURCES) {
  const missing = source.kits.filter((slug) => !knownSlugs.has(slug));
  if (missing.length) console.warn(`! source ${source.id} names a kit that doesn't exist: ${missing.join(', ')}`);
}
if (noSource.length) console.warn(`! kit without a source in SOURCES: ${noSource.join(', ')}`);

const variants = readVariants(new Set(models.map((m) => m.id)));
for (const model of models) {
  const group = variants.perModel.get(model.id);
  if (group) model.variant = group;
}

const tags = readTags(new Set(models.map((m) => m.id)));

for (const { id, name, type = 'tag', description, belongs } of DERIVED) {
  const members = models.filter(belongs);
  if (members.length === 0) continue;
  for (const model of members) {
    tags.perModel.set(model.id, [...(tags.perModel.get(model.id) ?? []), id]);
  }
  tags.tags.push({
    id,
    name,
    type,
    description: `${description} Derived from the models themselves, so not tracked in catalog/tags.json.`,
    count: members.length,
  });
}

for (const model of models) {
  const own = tags.perModel.get(model.id);
  if (own) model.tags = [...own].sort();
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
const sharedKey = existsSync(SHARED_ATLAS) ? readAtlas(SHARED_ATLAS).key : null;

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
  generated: 'node catalog/tools/build-catalog.mjs',
  total: models.length,
  budgetPerUnit: BUDGET_PER_UNIT,
  kits,
  variants: variants.groups,
  tags: tags.tags,
  groups: GROUPS.map(({ description, ...g }) => ({
    ...g,
    count: models.filter((m) => m.group === g.id).length,
  })),
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

writeFileSync(join(CATALOG_DIR, 'catalog.json'), JSON.stringify(catalog, null, 1) + '\n');

const scaleGroups = buildScaleGroups(models, catalog.kits);
writeFileSync(join(CATALOG_DIR, 'schaalgroepen.json'), JSON.stringify(scaleGroups, null, 1) + '\n');
const inScaleGroup = scaleGroups.reduce((sum, g) => sum + g.items.length, 0);
console.log(`${scaleGroups.length} families, ${inScaleGroup} models → catalog/schaalgroepen.json`);

writeVersion();

console.log(`${models.length} models in ${kits.length} kits → catalog/catalog.json`);
for (const tag of tags.tags) console.log(`${tag.type} ${tag.id}: ${tag.count} models`);
for (const g of catalog.groups) {
  console.log(`  ${String(g.count).padStart(3)}  ${g.name}`);
}
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
  if (kit.palette && kitsPerPalette.get(kit.palette) === 1 && !kit.tab && !kit.ownPalette) {
    console.warn(`! ${kit.slug} has its own palette but no "tabblad" in manifest.js`);
  }
}

const overBudget = models
  .filter((m) => m.trianglesPerUnit !== null && m.trianglesPerUnit > BUDGET_PER_UNIT)
  .sort((a, b) => b.trianglesPerUnit - a.trianglesPerUnit);
const WORST = 25;
if (overBudget.length) {
  console.warn(`! ${overBudget.length} models over ${BUDGET_PER_UNIT} triangles per unit, the worst ${Math.min(WORST, overBudget.length)}:`);
  for (const m of overBudget.slice(0, WORST)) {
    console.warn(`  ${String(m.trianglesPerUnit).padStart(6)}  ${m.id}  (${m.triangles} tri, ${m.wdh.join(' × ')})`);
  }
  if (overBudget.length > WORST) {
    console.warn(`  … and ${overBudget.length - WORST} more; the full list is in catalog.json`);
  }
}
const flat = models.filter((m) => m.trianglesPerUnit === null);
if (flat.length) {
  console.warn(`! ${flat.length} flat models without volume, so without density: ${flat.map((m) => m.id).join(', ')}`);
}

if (noMetadata.length) console.warn(`! no metadata in manifest.js: ${noMetadata.join(', ')}`);
if (noGroup.length) console.warn(`! no semantic group: ${noGroup.join(', ')}`);
if (noColor.length) {
  console.warn(`! ${noColor.length} models without colour in the .glb (colour filter skips them)`);
}
