//   node catalog/tools/build-missing.mjs

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, measureScene, trianglesPerUnit, BUDGET_PER_UNIT } from './glb.mjs';
import { GROUPS, determineGroup } from './semantiek.mjs';
import { leesFbx } from './fbx.mjs';
import { pakUit } from './zip.mjs';
import { BRONKITS } from './bronkits.mjs';
import { leesGltf, leesObj } from '../../tools/importeer/bron.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CATALOG_DIR = join(ROOT, 'catalog');
const BRON_DIR = join(ROOT, 'kits', 'sources');
const UITPAK_DIR = join(BRON_DIR, '.uitgepakt');
const WERK_DIR = join(ROOT, 'kits', 'workfiles');
const DOEL_DIR = join(ROOT, 'kits', 'missing');
const DOEL_PAD = 'kits/missing';

const AFBEELDINGEN = new Set(['.png', '.jpg', '.jpeg']);

const kebab = (naam) =>
  naam
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_.\s]+/g, '-')
    .toLowerCase();

const round1 = (v) => Math.max(Math.round(v * 10) / 10, 0.1);
const round = (v, n) => Math.round(v * 10 ** n) / 10 ** n;

// ─── source packs ────────────────────────────────────────────────────────────────────

function alleBestanden(dir, uit = []) {
  for (const naam of readdirSync(dir)) {
    const pad = join(dir, naam);
    if (statSync(pad).isDirectory()) alleBestanden(pad, uit);
    else uit.push(pad);
  }
  return uit;
}

function vindModelmap(dir, formaat) {
  const perMap = new Map();
  for (const pad of alleBestanden(dir)) {
    if (extname(pad).toLowerCase() !== `.${formaat}`) continue;
    const map = dirname(pad);
    perMap.set(map, (perMap.get(map) ?? 0) + 1);
  }
  if (perMap.size === 0) return null;
  return [...perMap].sort(
    (a, b) => b[1] - a[1] || a[0].split('/').length - b[0].split('/').length || a[0].localeCompare(b[0]),
  )[0][0];
}

function pakBronUit(bronkit) {
  const doel = join(UITPAK_DIR, bronkit.map);
  const map = join(BRON_DIR, bronkit.map);
  const zips = readdirSync(map).filter((n) => n.toLowerCase().endsWith('.zip')).sort();
  if (zips.length === 0) throw new Error(`${bronkit.map}: no .zip in kits/sources`);

  const stempel = join(doel, '.klaar');
  if (!existsSync(stempel)) {
    rmSync(doel, { recursive: true, force: true });
    for (const zip of zips) pakUit(join(map, zip), doel);
    writeFileSync(stempel, zips.join('\n') + '\n');
  }
  return doel;
}

const LOD = /_LOD(\d+)$/i;

const grofsteWeg = (naam) => {
  const match = naam.match(LOD);
  if (!match) return naam;
  return Number(match[1]) === 0 ? naam.replace(LOD, '') : null;
};

function leesBron(pad, formaat) {
  if (formaat === 'obj') return leesObj(pad);
  if (formaat === 'fbx') return leesFbx(pad);
  return leesGltf(pad);
}

function bronModellen(bronkit) {
  const uitgepakt = pakBronUit(bronkit);
  const map = vindModelmap(uitgepakt, bronkit.formaat);
  if (!map) throw new Error(`${bronkit.map}: no .${bronkit.formaat} found`);

  const bestanden = readdirSync(map)
    .filter((n) => extname(n).toLowerCase() === `.${bronkit.formaat}`)
    .sort();

  const modellen = [];
  for (const bestand of bestanden) {
    const primitieven = leesBron(join(map, bestand), bronkit.formaat);
    if (primitieven.length === 0) continue;

    if (bronkit.splitsPerMesh) {
      for (const primitief of primitieven) {
        const naam = grofsteWeg(primitief.naam);
        if (naam) modellen.push({ naam, bestand, primitieven: [primitief] });
      }
      continue;
    }

    const naam = grofsteWeg(basename(bestand, extname(bestand)).replace(/\.gltf$/i, ''));
    if (!naam) continue;
    const fijnste = primitieven.filter((p) => grofsteWeg(p.naam) !== null);
    modellen.push({ naam, bestand, primitieven: fijnste.length ? fijnste : primitieven });
  }

  const gezien = new Map();
  for (const model of modellen) {
    const n = (gezien.get(model.naam) ?? 0) + 1;
    gezien.set(model.naam, n);
    if (n > 1) model.naam = `${model.naam}-${n}`;
  }

  return { map, uitgepakt, modellen };
}

const meet = (primitieven) => {
  let driehoeken = 0;
  const laag = [Infinity, Infinity, Infinity];
  const hoog = [-Infinity, -Infinity, -Infinity];
  for (const p of primitieven) {
    driehoeken += p.indices.length / 3;
    for (let i = 0; i < p.posities.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = p.posities[i + k];
        if (v < laag[k]) laag[k] = v;
        if (v > hoog[k]) hoog[k] = v;
      }
    }
  }
  return { driehoeken, laag, hoog, wdh: hoog.map((v, k) => v - laag[k]) };
};

// ─── the catalogue side ──────────────────────────────────────────────────────────────

function kitGegevens(slug) {
  const dir = join(WERK_DIR, slug);
  if (!existsSync(dir)) return { modellen: [], schaal: null, aantal: 0 };

  const modellen = [];
  let schaal = null;
  for (const bestand of readdirSync(dir).filter((n) => n.endsWith('.glb'))) {
    const glb = readGlb(join(dir, bestand));
    const extras = glb.json.asset?.extras?.taaleiland ?? {};
    modellen.push({
      naam: basename(bestand, '.glb'),
      bronmodel: extras.bronmodel ?? null,
      driehoeken: measureScene(glb).triangles,
    });
    schaal ??= extras.schaal ?? null;
  }
  return { modellen, schaal, aantal: modellen.length };
}

// ─── writing a preview ───────────────────────────────────────────────────────────────

function vindTextuur(gevraagd, uitgepakt, afbeeldingen) {
  if (!gevraagd) return null;
  if (gevraagd.includes('/') && existsSync(gevraagd)) return gevraagd;
  const gezocht = basename(gevraagd).toLowerCase();
  const raak = afbeeldingen.find((p) => basename(p).toLowerCase() === gezocht);
  if (raak) return raak;
  return afbeeldingen.length === 1 ? afbeeldingen[0] : null;
}

function las(primitief, midden, metUvs) {
  const bron = primitief.posities;
  const aantal = bron.length / 3;
  const perSleutel = new Map();
  const posities = [];
  const normalen = [];
  const uvs = [];
  const nieuw = new Int32Array(aantal);

  const heeftNormalen = Boolean(primitief.normalen);
  const heeftUvs = Boolean(primitief.uvs) && metUvs;

  for (let i = 0; i < aantal; i++) {
    const p = [0, 1, 2].map((k) => Math.fround(bron[i * 3 + k] - midden[k]));
    const n = heeftNormalen ? [0, 1, 2].map((k) => Math.fround(primitief.normalen[i * 3 + k])) : [];
    const t = heeftUvs ? [0, 1].map((k) => Math.fround(primitief.uvs[i * 2 + k])) : [];
    const sleutel = [...p, ...n, ...t].join(',');

    let index = perSleutel.get(sleutel);
    if (index === undefined) {
      index = posities.length / 3;
      perSleutel.set(sleutel, index);
      posities.push(...p);
      if (heeftNormalen) normalen.push(...n);
      if (heeftUvs) uvs.push(...t);
    }
    nieuw[i] = index;
  }

  return {
    posities: Float32Array.from(posities),
    normalen: heeftNormalen ? Float32Array.from(normalen) : null,
    uvs: heeftUvs ? Float32Array.from(uvs) : null,
    indices: Array.from(primitief.indices, (i) => nieuw[i]),
  };
}

function schrijfPreview(pad, primitieven, { laag, hoog }, schaal, texturen) {
  const buffers = [];
  const accessors = [];
  const bufferViews = [];
  let lengte = 0;

  const voegToe = (data, doel, componentType, type, extra = {}) => {
    const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    const opvulling = (4 - (lengte % 4)) % 4;
    if (opvulling) { buffers.push(Buffer.alloc(opvulling)); lengte += opvulling; }
    bufferViews.push({ buffer: 0, byteOffset: lengte, byteLength: buf.length, ...(doel ? { target: doel } : {}) });
    buffers.push(buf);
    lengte += buf.length;
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType,
      count: extra.count,
      type,
      ...(extra.min ? { min: extra.min, max: extra.max } : {}),
    });
    return accessors.length - 1;
  };

  const midden = [(laag[0] + hoog[0]) / 2, laag[1], (laag[2] + hoog[2]) / 2];

  const materialen = [];
  const meshPrimitieven = [];
  const beeldIndex = new Map();
  for (const naam of texturen) {
    if (naam && !beeldIndex.has(naam)) beeldIndex.set(naam, beeldIndex.size);
  }

  for (const [n, primitief] of primitieven.entries()) {
    const textuurNaam = texturen[n];
    const { posities, normalen, uvs, indices: driehoeken } = las(primitief, midden, Boolean(textuurNaam));
    const aantal = posities.length / 3;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < aantal; i++) {
      for (let k = 0; k < 3; k++) {
        const v = posities[i * 3 + k];
        if (v < min[k]) min[k] = v;
        if (v > max[k]) max[k] = v;
      }
    }

    const attributes = {
      POSITION: voegToe(posities, 34962, 5126, 'VEC3', { count: aantal, min, max }),
    };
    if (normalen) attributes.NORMAL = voegToe(normalen, 34962, 5126, 'VEC3', { count: aantal });
    if (uvs) attributes.TEXCOORD_0 = voegToe(uvs, 34962, 5126, 'VEC2', { count: aantal });

    const smal = aantal <= 0xffff;
    const indices = voegToe(
      smal ? Uint16Array.from(driehoeken) : Uint32Array.from(driehoeken),
      34963,
      smal ? 5123 : 5125,
      'SCALAR',
      { count: driehoeken.length },
    );

    const pbr =
      attributes.TEXCOORD_0 !== undefined
        ? { baseColorTexture: { index: beeldIndex.get(textuurNaam) }, metallicFactor: 0, roughnessFactor: 1 }
        : {
            baseColorFactor: [...(primitief.materiaal.kleur ?? [255, 255, 255]).map((v) => (v / 255) ** 2.2), 1],
            metallicFactor: 0,
            roughnessFactor: 1,
          };
    materialen.push({ name: primitief.naam, pbrMetallicRoughness: pbr, doubleSided: true, alphaMode: 'OPAQUE' });
    meshPrimitieven.push({ attributes, indices, material: materialen.length - 1 });
  }

  const bin = Buffer.concat(buffers);
  const json = {
    asset: {
      generator: 'catalog/tools/build-missing.mjs',
      version: '2.0',
      extras: { taaleiland: { preview: 1, schaal } },
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: basename(pad, '.glb'), mesh: 0, ...(schaal !== 1 ? { scale: [schaal, schaal, schaal] } : {}) }],
    meshes: [{ primitives: meshPrimitieven }],
    materials: materialen,
    ...(beeldIndex.size
      ? {
          images: [...beeldIndex.keys()].map((naam) => ({ uri: encodeURIComponent(naam) })),
          samplers: [{ magFilter: 9728, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
          textures: [...beeldIndex.keys()].map((_, i) => ({ sampler: 0, source: i })),
        }
      : {}),
    accessors,
    bufferViews,
    buffers: [{ byteLength: bin.length }],
  };

  writeGlb(pad, json, bin, writeFileSync);
}

// ─── run ─────────────────────────────────────────────────────────────────────────────

rmSync(DOEL_DIR, { recursive: true, force: true });
mkdirSync(DOEL_DIR, { recursive: true });

const modellen = [];
const bronnen = [];
const waarschuwingen = [];

for (const bronkit of BRONKITS) {
  const { map, uitgepakt, modellen: bron } = bronModellen(bronkit);
  const afbeeldingen = alleBestanden(uitgepakt).filter((p) => AFBEELDINGEN.has(extname(p).toLowerCase()));
  const kit = bronkit.kit
    ? kitGegevens(bronkit.kit)
    : { modellen: [], schaal: null, aantal: 0 };

  const gemeten = bron.map((model) => ({ ...model, ...meet(model.primitieven) }));

  // Name first: an importer records the source name it built a workfile from, and where
  // it did not, the workfile still carries that name kebab-cased. Either way a model
  // that names a workfile is imported however far its triangle count has moved since.
  // Only what is left over falls back to the count, which cannot tell a model from its
  // equally heavy neighbour.
  const opBron = new Map(kit.modellen.filter((m) => m.bronmodel).map((m) => [m.bronmodel, m.naam]));
  const opNaamKit = new Set(kit.modellen.map((m) => m.naam));

  const geraakt = new Set();
  const rest = [];
  for (const model of gemeten) {
    const naam = opBron.get(model.naam) ?? (opNaamKit.has(kebab(model.naam)) ? kebab(model.naam) : null);
    if (naam !== null) geraakt.add(naam);
    else rest.push(model);
  }

  const teGaan = new Map();
  for (const { naam, driehoeken } of kit.modellen) {
    if (geraakt.has(naam)) continue;
    teGaan.set(driehoeken, (teGaan.get(driehoeken) ?? 0) + 1);
  }

  const ontbreekt = [];
  for (const model of rest) {
    const open = teGaan.get(model.driehoeken) ?? 0;
    if (open > 0) teGaan.set(model.driehoeken, open - 1);
    else ontbreekt.push(model);
  }

  const onherkend = [...teGaan.values()].reduce((som, n) => som + n, 0);
  if (onherkend) {
    waarschuwingen.push(
      `${bronkit.kit}: ${onherkend} of ${kit.aantal} workfiles match no model in ` +
        `${bronkit.naam} by name or by triangle count — renamed and edited after import, so ` +
        'that many source models are listed as missing while they may not be',
    );
  }

  const uitvoerMap = join(DOEL_DIR, bronkit.map);
  const schaal = kit.schaal ?? 1;
  const gekopieerd = new Map();
  const gebruikteNamen = new Set();

  const neemMee = (pad) => {
    if (gekopieerd.has(pad)) return gekopieerd.get(pad);
    let naam = basename(pad);
    for (let n = 2; gebruikteNamen.has(naam); n++) {
      naam = `${basename(pad, extname(pad))}-${n}${extname(pad)}`;
    }
    gebruikteNamen.add(naam);
    gekopieerd.set(pad, naam);
    copyFileSync(pad, join(uitvoerMap, naam));
    return naam;
  };

  if (ontbreekt.length) mkdirSync(uitvoerMap, { recursive: true });

  for (const model of ontbreekt) {
    const texturen = model.primitieven.map((primitief) => {
      const pad = vindTextuur(primitief.materiaal.textuur, uitgepakt, afbeeldingen);
      return pad ? neemMee(pad) : null;
    });

    const pad = join(uitvoerMap, `${model.naam}.glb`);
    schrijfPreview(pad, model.primitieven, model, schaal, texturen);

    const wdh = model.wdh.map((v) => v * schaal);
    modellen.push({
      kit: bronkit.map,
      name: model.naam,
      gr: determineGroup(bronkit.kit ?? bronkit.map, kebab(model.naam)),
      wdh: wdh.map(round1),
      tris: model.driehoeken,
      tpu: trianglesPerUnit(model.driehoeken, wdh),
      mat: model.primitieven.length,
      bytes: statSync(pad).size,
      scaled: kit.schaal !== null || undefined,
      file: model.bestand,
    });
  }

  bronnen.push({
    slug: bronkit.map,
    name: bronkit.naam,
    kit: bronkit.kit,
    format: bronkit.formaat,
    inSource: gemeten.length,
    inCatalog: kit.aantal,
    missing: ontbreekt.length,
    unmatched: onherkend,
    scale: kit.schaal,
    folder: map.slice(uitgepakt.length + 1),
  });

  console.log(
    `${bronkit.map.padEnd(38)} ${String(gemeten.length).padStart(4)} in source, ` +
      `${String(kit.aantal).padStart(4)} in catalogue → ${String(ontbreekt.length).padStart(4)} missing` +
      (onherkend ? `  (${onherkend} workfiles unmatched)` : '') +
      (bronkit.kit ? '' : '  — never imported'),
  );
}

const uitvoer = {
  budgetPerUnit: BUDGET_PER_UNIT,
  modelPath: DOEL_PAD,
  kits: bronnen.map((b) => ({ slug: b.slug, name: b.name, note: b.kit ? null : 'This pack was never imported — nothing from it is in the catalogue.' })),
  sources: bronnen,
  groups: [
    ...GROUPS.map((g) => ({ id: g.id, name: g.name, color: g.color })),
    { id: 'other', name: 'Other' },
  ],
  models: modellen,
};

writeFileSync(join(CATALOG_DIR, 'missing.json'), JSON.stringify(uitvoer, (k, v) => (v === null ? undefined : v), 1) + '\n');

const totaal = bronnen.reduce((som, b) => som + b.missing, 0);
console.log(`\n${totaal} missing models from ${bronnen.length} packs → catalog/missing.json`);
for (const regel of waarschuwingen) console.warn(`! ${regel}`);
