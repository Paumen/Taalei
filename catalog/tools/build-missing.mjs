// Builds the second catalogue: what the source packs under kits/sources contain but the
// catalogue doesn't (or no longer does).
//
// Names are no help here — every kit was renamed on import, and the mapping tables only
// survive for a handful of them. Geometry is. An import scales and recolours a model but
// leaves its triangles alone, so the triangle count identifies a model within its pack
// almost uniquely, and where two models happen to share a count they simply cancel each
// other out: what we want is the difference between two sets, not which one maps to which.
// So per kit this takes the multiset of triangle counts in kits/workfiles, subtracts it
// from the multiset in the source pack, and what's left over is missing.
//
// Two things make that read pessimistically rather than optimistically, which is the safe
// direction for a review tool — it can show something that is in the catalogue after all,
// but it won't hide something that isn't:
//   - a workfile edited after import no longer matches its source, so its source model
//     shows up as missing. The report prints how many workfiles went unmatched per kit.
//   - a pack that was never imported at all has no kit, so all of it is missing.
//
// Every missing model is written out as a preview .glb under kits/missing/, straight from
// the source: its own geometry, its own colours, no palette and no clean-up. That's the
// point — you're looking at what was left behind, not at what it would become.
//
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

// The semantic rules in semantiek.mjs read catalogue names — lower case, words joined by
// hyphens. A source name is CamelCase or under_scores, so without this almost everything
// would land in "other".
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

// A pack ships the same models in several formats, sometimes a couple of folders deep and
// sometimes twice over (two zips of the same download). The folder holding the most files
// of the wanted format is the one meant to be read; the shallowest wins a tie.
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

  // .klaar marks a finished unpack; without it a half-written cache would be reused
  const stempel = join(doel, '.klaar');
  if (!existsSync(stempel)) {
    rmSync(doel, { recursive: true, force: true });
    for (const zip of zips) pakUit(join(map, zip), doel);
    writeFileSync(stempel, zips.join('\n') + '\n');
  }
  return doel;
}

const LOD = /_LOD(\d+)$/i;

// Only the finest level of detail is of interest; the coarser ones are the same model.
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
      // one file holding the whole pack: every mesh in it is a model of its own
      for (const primitief of primitieven) {
        const naam = grofsteWeg(primitief.naam);
        if (naam) modellen.push({ naam, bestand, primitieven: [primitief] });
      }
      continue;
    }

    const naam = grofsteWeg(basename(bestand, extname(bestand)));
    if (!naam) continue;
    const fijnste = primitieven.filter((p) => grofsteWeg(p.naam) !== null);
    modellen.push({ naam, bestand, primitieven: fijnste.length ? fijnste : primitieven });
  }

  // a pack with duplicate names across folders would collide in the output directory
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

// The scale an import applied is written into the workfile itself, so preview models can
// be put in island units too and their sizes compared with the catalogue's.
function kitGegevens(slug) {
  const dir = join(WERK_DIR, slug);
  if (!existsSync(dir)) return { driehoeken: [], schaal: null, aantal: 0 };

  const driehoeken = [];
  let schaal = null;
  for (const bestand of readdirSync(dir).filter((n) => n.endsWith('.glb'))) {
    const glb = readGlb(join(dir, bestand));
    driehoeken.push(measureScene(glb).triangles);
    schaal ??= glb.json.asset?.extras?.taaleiland?.schaal ?? null;
  }
  return { driehoeken, schaal, aantal: driehoeken.length };
}

// ─── writing a preview ───────────────────────────────────────────────────────────────

function vindTextuur(gevraagd, uitgepakt, afbeeldingen) {
  if (!gevraagd) return null;
  if (gevraagd.includes('/') && existsSync(gevraagd)) return gevraagd;
  const gezocht = basename(gevraagd).toLowerCase();
  const raak = afbeeldingen.find((p) => basename(p).toLowerCase() === gezocht);
  if (raak) return raak;
  // a pack that carries exactly one atlas means it, whatever the file was called when
  // the model was exported
  return afbeeldingen.length === 1 ? afbeeldingen[0] : null;
}

// An .obj or .fbx repeats every corner of every triangle, so a preview written straight
// out carries three vertices per triangle. Welding corners that agree on position, normal
// and uv roughly halves the file, and glTF only needs 16-bit indices below 65536 vertices.
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

  // centred on the ground, like the catalogue models, so the viewer frames it the same way
  const midden = [(laag[0] + hoog[0]) / 2, laag[1], (laag[2] + hoog[2]) / 2];

  const materialen = [];
  const meshPrimitieven = [];
  // a model may draw from more than one atlas — the images are numbered in first-use order
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
          // glTF wants a uri, not a bare filename — a texture called "Bark Oak.png" has
          // to carry its space encoded
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
  const kit = bronkit.kit ? kitGegevens(bronkit.kit) : { driehoeken: [], schaal: null, aantal: 0 };

  // the multiset subtraction: every workfile cancels one source model with the same
  // triangle count, whichever one that is
  const teGaan = new Map();
  for (const driehoeken of kit.driehoeken) teGaan.set(driehoeken, (teGaan.get(driehoeken) ?? 0) + 1);

  const gemeten = bron.map((model) => ({ ...model, ...meet(model.primitieven) }));
  const ontbreekt = [];
  for (const model of gemeten) {
    const open = teGaan.get(model.driehoeken) ?? 0;
    if (open > 0) teGaan.set(model.driehoeken, open - 1);
    else ontbreekt.push(model);
  }

  const onherkend = [...teGaan.values()].reduce((som, n) => som + n, 0);
  if (onherkend) {
    waarschuwingen.push(
      `${bronkit.kit}: ${onherkend} of ${kit.aantal} workfiles have no model with the same ` +
        `triangle count in ${bronkit.naam} — edited after import, so that many source models ` +
        'are listed as missing while they may not be',
    );
  }

  const uitvoerMap = join(DOEL_DIR, bronkit.map);
  const schaal = kit.schaal ?? 1;
  // every texture the previews of this pack need, copied in once and shared between them;
  // two different files with the same basename would collide, so the second gets a number
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
  // "other" is what determineGroup falls back to and semantiek.mjs has no entry for it —
  // in the catalogue that's a handful of models, here it's a few hundred, so it needs a name
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
