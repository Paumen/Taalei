import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { readKindTree, kindIs, kindAncestors, SIZES, sizeOf } from './kinds.mjs';
import { buildScaleGroups, byLongest, SCALE_TABS } from './scale-groups.mjs';
import { readGlb, readAccessor, measureScene, trianglesPerUnit } from './glb.mjs';
import { readPng } from './png.mjs';
import { buildChecks, checkModel } from '../../lint/rules.mjs';
import { BRONKITS } from './bronkits.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CATALOG_DIR = join(ROOT, 'catalog');
const APP_DIR = join(CATALOG_DIR, 'app');
const DATA_DIR = join(CATALOG_DIR, 'data');
const BUILD_DIR = join(CATALOG_DIR, 'build');
const KITS_DIR = join(ROOT, 'kits');
const MODEL_DIR = join(KITS_DIR, 'workfiles');
const MODEL_PATH = 'kits/workfiles';

const COLUMNS = 16;
const ROWS = 4;

const round1 = (v) => (v < 0.1 ? Math.max(Math.round(v * 100) / 100, 0.01) : Math.round(v * 20) / 20);

const LINT_VARS = JSON.parse(readFileSync(join(ROOT, 'lint', 'variables.json'), 'utf8'));
const LINT_MATERIALS = JSON.parse(readFileSync(join(ROOT, LINT_VARS.materials), 'utf8'));
const LINT_CHECKS = buildChecks({
  vars: LINT_VARS,
  kinds: JSON.parse(readFileSync(join(ROOT, LINT_VARS.kinds), 'utf8')),
  materials: LINT_MATERIALS,
  measures: JSON.parse(readFileSync(join(ROOT, LINT_VARS.measures), 'utf8')),
});
const MATERIAL_TREE = LINT_CHECKS.materialIds;
const round = (v, n) => Math.round(v * 10 ** n) / 10 ** n;
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
      listed: Array.isArray(kit.models) ? kit.models : null,
    });
  }
  return meta;
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
  const gradient = new Map();
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
        const row = Math.floor(y / cellHeight);
        const lane = `${Math.floor(x / cellWidth)},${row}`;
        lanes.add(lane);

        const position = (y - row * cellHeight) / cellHeight;
        const seen = gradient.get(lane);
        if (!seen) gradient.set(lane, { min: position, max: position, count: 1 });
        else {
          if (position < seen.min) seen.min = position;
          if (position > seen.max) seen.max = position;
          seen.count++;
        }
      }
    }
  }

  return { atlas: atlasPath, lanes, gradient, materials };
}

function gradientSpread(gradient) {
  let spread = 0;
  let total = 0;
  for (const { min, max, count } of gradient.values()) {
    spread += (max - min) * count;
    total += count;
  }
  return total === 0 ? null : spread / total;
}

function laneSpread(gradient) {
  if (gradient.size === 0) return null;
  return Object.fromEntries([...gradient].map(([lane, { min, max }]) => [lane, [round(min, 3), round(max, 3)]]));
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

const SCALE_PAGES = SCALE_TABS.map((t) => t.file);

const MODULES = ['tag-edits.js', 'chiprij.js', 'scale-draw.js', 'color-edits.js', 'comments.js',
  'extract.js', 'bouwstempel.js'];
const IMPORTERS = ['catalog.js', 'scale.js', 'swipe.js', 'list.js', 'tag-edits.js', 'extract.js'];
const unstamped = (text) => text.replace(/\?v=[a-f0-9]{10}/g, '');

const fileIn = (name) => join(name.endsWith('.json') ? BUILD_DIR : APP_DIR, name);

function writeVersion() {
  const content = ['catalog.json', 'catalog.css', 'catalog.js', 'scale-groups.json', 'scale.js',
    'swipe.css', 'swipe.js', 'tbd.json', 'reject.json', 'list.css', 'list.js', 'thumbs.json', 'overview.js', ...MODULES]
    .filter((name) => existsSync(fileIn(name)))
    .map((name) => unstamped(readFileSync(fileIn(name), 'utf8')))
    .join('');
  const version = createHash('sha256').update(content).digest('hex').slice(0, 10);

  for (const name of IMPORTERS) {
    const path = join(APP_DIR, name);
    if (!existsSync(path)) continue;
    const before = readFileSync(path, 'utf8');
    const after = before.replace(
      new RegExp(`('\\./(?:${MODULES.map((m) => m.replace('.', '\\.')).join('|')}))(?:\\?v=[a-f0-9]+)?'`, 'g'),
      `$1?v=${version}'`,
    );
    if (after !== before) writeFileSync(path, after);
  }

  const builtAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

  const stamp = (path, replacements) => {
    let html = readFileSync(path, 'utf8');
    for (const [search, replacement] of replacements) html = html.replace(search, replacement);
    writeFileSync(path, html
      .replace(/<meta name="catalogus-versie" content="[^"]*">/, `<meta name="catalogus-versie" content="${version}">`)
      .replace(/<meta name="catalogus-gebouwd" content="[^"]*">/, `<meta name="catalogus-gebouwd" content="${builtAt}">`));
  };

  stamp(join(ROOT, 'index.html'), [
    [/href="catalog\/app\/catalog\.css(?:\?v=[a-f0-9]+)?"/, `href="catalog/app/catalog.css?v=${version}"`],
    [/src="catalog\/app\/catalog\.js(?:\?v=[a-f0-9]+)?"/, `src="catalog/app/catalog.js?v=${version}"`],
  ]);
  for (const page of SCALE_PAGES) {
    stamp(join(APP_DIR, page), [
      [/href="catalog\.css(?:\?v=[a-f0-9]+)?"/, `href="catalog.css?v=${version}"`],
      [/src="scale\.js(?:\?v=[a-f0-9]+)?"/, `src="scale.js?v=${version}"`],
    ]);
  }
  stamp(join(APP_DIR, 'swipe.html'), [
    [/href="catalog\.css(?:\?v=[a-f0-9]+)?"/, `href="catalog.css?v=${version}"`],
    [/href="swipe\.css(?:\?v=[a-f0-9]+)?"/, `href="swipe.css?v=${version}"`],
    [/src="swipe\.js(?:\?v=[a-f0-9]+)?"/, `src="swipe.js?v=${version}"`],
  ]);
  for (const page of ['tbd.html', 'reject.html']) {
    stamp(join(APP_DIR, page), [
      [/href="catalog\.css(?:\?v=[a-f0-9]+)?"/, `href="catalog.css?v=${version}"`],
      [/href="list\.css(?:\?v=[a-f0-9]+)?"/, `href="list.css?v=${version}"`],
      [/src="list\.js(?:\?v=[a-f0-9]+)?"/, `src="list.js?v=${version}"`],
    ]);
  }
  stamp(join(APP_DIR, 'overview.html'), [
    [/href="catalog\.css(?:\?v=[a-f0-9]+)?"/, `href="catalog.css?v=${version}"`],
    [/src="overview\.js(?:\?v=[a-f0-9]+)?"/, `src="overview.js?v=${version}"`],
  ]);
  console.log(
    `version ${version} → index.html, ${SCALE_PAGES.map((p) => `catalog/app/${p}`).join(', ')},` +
      ' catalog/app/swipe.html, catalog/app/tbd.html, catalog/app/reject.html, catalog/app/overview.html',
  );
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

  const scales = {};
  const smooth = {};
  const origins = {};
  const tally = (counts, key) => { counts[key] = (counts[key] ?? 0) + 1; };

  for (const file of files) {
    const name = file.replace(/\.glb$/, '');
    const path = `${MODEL_PATH}/${slug}/${file}`;
    const glb = readGlb(join(dir, file));
    const gltf = glb.json;
    const scene = measureScene(glb);
    const origin = gltf.asset?.extras?.taaleiland ?? {};
    tally(scales, origin.schaal ?? 'none');
    tally(smooth, origin.schaduw?.modus === 'glad' ? origin.schaduw.drempel : 'none');
    tally(origins, origin.bron ?? 'none');
    const read = readColors(glb, dir);
    if (read.lanes.size === 0 && read.materials.size === 0) noColor.push(`${slug}/${name}`);
    const paletteKey = read.atlas ? readAtlas(read.atlas).key : `material:${slug}`;
    colorPerModel.set(`${slug}/${name}`, { ...read, paletteKey });

    models.push({
      id: `${slug}/${name}`,
      name,
      kit: slug,
      palette: null,
      colors: [],
      path,
      bytes: statSync(join(dir, file)).size,
      triangles: scene.triangles,
      trianglesPerUnit: trianglesPerUnit(scene.triangles, scene.wdh),
      materials: (gltf.materials ?? []).length,
      alpha: (gltf.materials ?? []).some((m) => (m.alphaMode ?? 'OPAQUE') !== 'OPAQUE'),
      pbr: (gltf.materials ?? []).some((m) =>
        (m.pbrMetallicRoughness?.roughnessFactor ?? 1) !== 1 || (m.pbrMetallicRoughness?.metallicFactor ?? 1) !== 0),
      bands: read.lanes.size,
      wdh: scene.wdh,
      calls: scene.calls,
      vertices: scene.vertices,
      isGridModular: scene.isGridModular,
      isGrounded: scene.isGrounded,
      pivotIsCenter: scene.pivotIsCenter,
      minEdgeLength: scene.minEdgeLength,
      averageTriangleArea: scene.averageTriangleArea,
      strictAnglePercent: scene.strictAnglePercent,
      gradientSpread: gradientSpread(read.gradient),
      laneSpread: laneSpread(read.gradient),
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
    note: meta?.note ?? null,
    palette: null,
    scales,
    smooth,
    origins,
  });
}

const TYPES = ['material', 'kind', 'size', 'attribute', 'theme', 'artist', 'tag'];
const KIND_TREE = readKindTree();

const SOURCES = [
  { id: 'ken', name: 'Kenney', description: 'Kits from Kenney (kenney.nl).' },
  { id: 'kay', name: 'KayKit', description: 'Kits from Kay Lousberg (kaylousberg.com).' },
  { id: 'qua', name: 'Quaternius', description: 'Kits from Quaternius (quaternius.com).' },
  { id: 'isa', name: 'Isa', description: 'Kits from Isa Lousberg (isalousberg.com).' },
  { id: 'wizp', name: 'WizP', description: 'Kits from WizP (wizp.itch.io).' },
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
      'Carries its own animations in the .glb: things that open, flip or turn.',
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
for (const model of models) {
  const own = tags.perModel.get(model.id) ?? [];
  model.kind = own.find((id) => typeOf.get(id) === 'kind') ?? null;
  model.size = sizeOf(model.wdh);
  const rest = own.filter((id) => !['kind', 'size'].includes(typeOf.get(id)));
  model.tags = rest;
}
for (const { id, name, type = 'tag', description, belongs } of DERIVED) {
  const members = models.filter(belongs);
  if (members.length === 0) continue;
  if (type !== 'size') for (const model of members) model.tags.push(id);
  tags.tags.push({
    id,
    name,
    type,
    description: [description, 'Derived from the models themselves, so not tracked in catalog/tags.json.']
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
const colorName = (hex) => bandNameOf.get(hex) ?? hex;

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

const output = {
  kits: kits.map((k) => ({
    slug: k.slug, name: k.name, url: k.url, note: k.note,
    artist: SOURCES.find((s) => s.id === SOURCE_PER_KIT.get(k.slug))?.name,
    licenseLabel: k.licenseLabel,
    count: k.count,
    packs: BRONKITS.filter((b) => b.kit === k.slug).map((b) => b.naam),
    origins: k.origins,
    scales: k.scales,
    smooth: k.smooth,
  })),
  variants: variants.groups,
  bands: BANDS,
  tags: tags.tags.map((t) => ({
    id: t.id, name: t.name, type: t.type, description: t.description, count: t.count,
    ...(t.parent ? { parent: t.parent } : {}), ...(t.po ? { po: true } : {}),
    ...(t.color ? { color: t.color } : {}),
  })),
  byLongest: [...new Set(models.map((m) => m.kind).filter(Boolean))].sort().filter(byLongest),
  limits: Object.fromEntries([...new Set(models.map((m) => m.kind).filter(Boolean))].sort()
    .map((kind) => [kind, Object.fromEntries(
      Object.entries(LINT_CHECKS.limits.get(kind) ?? {}).map(([field, { value }]) => [field, value]),
    )])),
  models: models.map((m) => {
    const row = {
      kit: m.kit,
      name: m.name,
      kind: m.kind,
      size: m.size,
      wdh: m.wdh.map(round1),
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
      avgTri: round(m.averageTriangleArea, 5),
      anglePct: Math.round(m.strictAnglePercent),
      vpt: m.triangles ? round(m.vertices / m.triangles, 2) : null,
      grad: m.gradientSpread === null ? null : round(m.gradientSpread, 2),
      spread: m.laneSpread ?? undefined,
      colors: m.colors.length ? m.colors : undefined,
      tags: m.tags,
      anim: m.animations,
      alpha: m.alpha || undefined,
      pbr: m.pbr || undefined,
      variant: m.variant,
    };
    return { ...row, ...checkModel(row, LINT_CHECKS) };
  }),
};

writeFileSync(join(BUILD_DIR, 'catalog.json'), JSON.stringify(output, stripNull, 1) + '\n');

const scaleGroups = buildScaleGroups(models);
writeFileSync(join(BUILD_DIR, 'scale-groups.json'), JSON.stringify(scaleGroups, stripNull, 1) + '\n');
const inScaleGroup = scaleGroups.reduce((sum, g) => sum + g.items.length, 0);
console.log(`${scaleGroups.length} families, ${inScaleGroup} models → catalog/scale-groups.json`);

writeVersion();

console.log(`${models.length} models in ${kits.length} kits → catalog/catalog.json`);
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
  if (kit.palette && kitsPerPalette.get(kit.palette) === 1 && !kit.tab && !kit.ownPalette) {
    console.warn(`! ${kit.slug} has its own palette but no "tabblad" in manifest.js`);
  }
}

const flat = models.filter((m) => m.trianglesPerUnit === null);
if (flat.length) {
  console.warn(`! ${flat.length} flat models without volume, so without triangles per unit: ${flat.map((m) => m.id).join(', ')}`);
}

if (noMetadata.length) console.warn(`! no metadata in manifest.js: ${noMetadata.join(', ')}`);

for (const [slug, meta] of kitMeta) {
  if (!meta.listed) continue;
  const dir = join(MODEL_DIR, slug);
  const aanwezig = existsSync(dir)
    ? new Set(readdirSync(dir).filter((n) => n.endsWith('.glb')).map((n) => n.slice(0, -4)))
    : new Set();
  const zonderBestand = meta.listed.filter((naam) => !aanwezig.has(naam));
  const zonderVermelding = [...aanwezig].filter((naam) => !meta.listed.includes(naam));
  if (zonderBestand.length) {
    console.warn(`! ${slug}: in manifest.js but no workfile: ${zonderBestand.join(', ')}`);
  }
  if (zonderVermelding.length) {
    console.warn(`! ${slug}: workfile but not in manifest.js: ${zonderVermelding.join(', ')}`);
  }
}
const noSource = kits
  .map(({ slug }) => slug)
  .filter((slug) => !SOURCE_PER_KIT.has(slug) && BRONKITS.some((b) => b.kit === slug));
if (noSource.length) console.warn(`! no source in bronkits.mjs: ${noSource.join(', ')}`);
if (noColor.length) {
  console.warn(`! ${noColor.length} models without colour in the .glb (colour filter skips them)`);
}
