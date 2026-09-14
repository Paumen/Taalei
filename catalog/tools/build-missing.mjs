import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve, relative, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readGlb, writeGlb, measureScene, trianglesPerUnit, BUDGET_PER_UNIT } from './glb.mjs';
import { readPng } from './png.mjs';
import { readKindTree, kindName, kindFromName, KIND_COLORS } from './kinds.mjs';
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

const HANDKLEUREN = JSON.parse(readFileSync(join(CATALOG_DIR, 'missing-colors.json'), 'utf8'));

const kebab = (naam) =>
  naam
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_.\s]+/g, '-')
    .toLowerCase();

const round1 = (v) => Math.max(Math.round(v * 10) / 10, 0.1);
const round = (v, n) => Math.round(v * 10 ** n) / 10 ** n;

function alleBestanden(dir, uit = []) {
  for (const naam of readdirSync(dir)) {
    const pad = join(dir, naam);
    if (statSync(pad).isDirectory()) alleBestanden(pad, uit);
    else uit.push(pad);
  }
  return uit;
}

function vindModelmappen(dir, formaat, alleMappen) {
  const perMap = new Map();
  for (const pad of alleBestanden(dir)) {
    if (extname(pad).toLowerCase() !== `.${formaat}`) continue;
    const map = dirname(pad);
    perMap.set(map, (perMap.get(map) ?? 0) + 1);
  }
  if (perMap.size === 0) return null;
  const gesorteerd = [...perMap].sort(
    (a, b) => b[1] - a[1] || a[0].split('/').length - b[0].split('/').length || a[0].localeCompare(b[0]),
  );
  return alleMappen ? gesorteerd.map(([map]) => map).sort() : [gesorteerd[0][0]];
}

function gemeenschappelijkeMap(mappen) {
  const delen = mappen.map((map) => map.split('/'));
  const eerste = delen[0];
  let n = 0;
  while (n < eerste.length && delen.every((d) => d[n] === eerste[n])) n++;
  return eerste.slice(0, n).join('/');
}

const bronId = (bronkit) => (bronkit.submap ? `${bronkit.map}/${bronkit.submap}` : bronkit.map);

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

function bronFormaatModellen(bronkit, uitgepakt, formaat) {
  const mappen = vindModelmappen(uitgepakt, formaat, bronkit.alleMappen);
  if (!mappen) return null;

  const wortel = gemeenschappelijkeMap(mappen);

  const modellen = [];
  for (const map of mappen) {
    const bestanden = readdirSync(map)
      .filter((n) => extname(n).toLowerCase() === `.${formaat}`)
      .sort();

    for (const naamBestand of bestanden) {
      const bestand = relative(wortel, join(map, naamBestand));
      const primitieven = leesBron(join(map, naamBestand), formaat);
      if (primitieven.length === 0) continue;

      if (bronkit.splitsPerMesh) {
        const perMesh = new Map();
        for (const primitief of primitieven) {
          const naam = grofsteWeg(primitief.naam);
          if (!naam) continue;
          if (perMesh.has(naam)) perMesh.get(naam).push(primitief);
          else perMesh.set(naam, [primitief]);
        }
        for (const [naam, delen] of perMesh) modellen.push({ naam, bestand, primitieven: delen });
        continue;
      }

      const naam = grofsteWeg(basename(naamBestand, extname(naamBestand)).replace(/\.gltf$/i, ''));
      if (!naam) continue;
      const fijnste = primitieven.filter((p) => grofsteWeg(p.naam) !== null);
      modellen.push({ naam, bestand, primitieven: fijnste.length ? fijnste : primitieven });
    }
  }

  const gezien = new Map();
  for (const model of modellen) {
    const n = (gezien.get(model.naam) ?? 0) + 1;
    gezien.set(model.naam, n);
    if (n > 1) model.naam = `${model.naam}-${n}`;
  }

  return { map: wortel, modellen };
}

function bronModellen(bronkit) {
  const zip = pakBronUit(bronkit);
  const uitgepakt = bronkit.submap ? join(zip, bronkit.submap) : zip;
  if (!existsSync(uitgepakt)) throw new Error(`${bronId(bronkit)}: no such folder in the source zip`);
  const formaten = [bronkit.formaat, ...(bronkit.extraFormaten ?? [])];

  let hoofdmap = null;
  const modellen = [];
  const namen = new Set();

  for (const formaat of formaten) {
    const gelezen = bronFormaatModellen(bronkit, uitgepakt, formaat);
    if (!gelezen) {
      if (formaat === bronkit.formaat) throw new Error(`${bronId(bronkit)}: no .${formaat} found`);
      continue;
    }
    hoofdmap ??= gelezen.map;
    for (const model of gelezen.modellen) {
      if (namen.has(model.naam)) continue;
      namen.add(model.naam);
      modellen.push(model);
    }
  }

  return { map: hoofdmap, uitgepakt, modellen };
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

function kitGegevens(slug) {
  const dir = join(WERK_DIR, slug);
  if (!existsSync(dir)) return { modellen: [], schaal: null, aantal: 0 };

  const modellen = [];
  let schaal = null;
  for (const bestand of readdirSync(dir).filter((n) => n.endsWith('.glb'))) {
    const glb = readGlb(join(dir, bestand));
    const extras = glb.json.asset?.extras?.taaleiland ?? {};
    const gemeten = measureScene(glb);
    const wikkel = (glb.json.nodes ?? []).find((n) => n.name === 'rescale-wrapper');
    const factor = wikkel?.scale?.[0] ?? 1;
    modellen.push({
      naam: basename(bestand, '.glb'),
      bronmodel: extras.bronmodel ?? null,
      driehoeken: gemeten.triangles,
      wdh: gemeten.wdh.map((v) => v / factor),
    });
    schaal ??= extras.schaal ?? null;
  }
  return { modellen, schaal, aantal: modellen.length };
}

const WDH_TOLERANCE = 0.05;

function wdhMatches(a, b) {
  return a.every((v, k) => Math.abs(v - b[k]) <= Math.max(WDH_TOLERANCE * Math.max(v, b[k]), 0.01));
}

function vindTextuur(gevraagd, uitgepakt, afbeeldingen) {
  if (!gevraagd) return null;
  if (gevraagd.includes('/') && existsSync(gevraagd)) return gevraagd;
  const gezocht = basename(gevraagd).toLowerCase();
  const raak = afbeeldingen.find((p) => basename(p).toLowerCase() === gezocht);
  if (raak) return raak;
  return afbeeldingen.length === 1 ? afbeeldingen[0] : null;
}

const ALGEMENE_WOORDEN = new Set([
  'albedo', 'base', 'basecolor', 'color', 'colour', 'default', 'diffuse',
  'map', 'material', 'tex', 'texture',
]);

const woorden = (naam) =>
  new Set(
    basename(String(naam ?? ''), extname(String(naam ?? '')))
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((woord) => woord.length > 2 && !ALGEMENE_WOORDEN.has(woord)),
  );

const overlap = (a, b) => [...a].filter((woord) => b.has(woord)).length;

function gelijkendeAfbeelding(gevraagd, materiaalNaam, afbeeldingen) {
  const uitTextuur = woorden(gevraagd);
  const uitMateriaal = woorden(materiaalNaam);
  if (uitTextuur.size === 0 && uitMateriaal.size === 0) return null;

  let beste = null;
  let besteScore = 0;
  for (const pad of afbeeldingen) {
    const kandidaat = woorden(pad);
    const score = overlap(uitTextuur, kandidaat) * 2 + overlap(uitMateriaal, kandidaat);
    if (score === 0) continue;
    if (
      score > besteScore
      || (score === besteScore && basename(pad).length < basename(beste).length)
      || (score === besteScore && basename(pad).length === basename(beste).length && pad < beste)
    ) {
      beste = pad;
      besteScore = score;
    }
  }
  return beste;
}

const gemiddelden = new Map();

function gemiddeldeKleur(pad) {
  if (gemiddelden.has(pad)) return gemiddelden.get(pad);

  let kleur = null;
  if (extname(pad).toLowerCase() === '.png') {
    const { width, height, pixels } = readPng(pad);
    const som = [0, 0, 0];
    let gewicht = 0;
    for (let i = 0; i < width * height; i++) {
      const alpha = pixels[i * 4 + 3] / 255;
      if (alpha < 0.5) continue;
      for (let k = 0; k < 3; k++) som[k] += (pixels[i * 4 + k] / 255) ** 2.2 * alpha;
      gewicht += alpha;
    }
    if (gewicht > 0) kleur = som.map((v) => Math.round(((v / gewicht) ** (1 / 2.2)) * 255));
  }

  gemiddelden.set(pad, kleur);
  return kleur;
}

const uitHex = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

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

function schrijfPreview(pad, primitieven, { laag, hoog }, schaal, texturen, kleuren) {
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
            baseColorFactor: [
              ...(kleuren[n] ?? primitief.materiaal.kleur ?? [255, 255, 255]).map((v) => (v / 255) ** 2.2),
              1,
            ],
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

rmSync(DOEL_DIR, { recursive: true, force: true });
mkdirSync(DOEL_DIR, { recursive: true });

const modellen = [];
const bronnen = [];
const waarschuwingen = [];

for (const bronkit of BRONKITS) {
  const { map, uitgepakt, modellen: bron } = bronModellen(bronkit);
  const afbeeldingen = alleBestanden(uitgepakt).filter((p) => AFBEELDINGEN.has(extname(p).toLowerCase()));
  const handkleuren = HANDKLEUREN[bronId(bronkit)] ?? HANDKLEUREN[bronkit.map] ?? {};
  const kit = bronkit.kit
    ? kitGegevens(bronkit.kit)
    : { modellen: [], schaal: null, aantal: 0 };

  const gemeten = bron.map((model) => ({ ...model, ...meet(model.primitieven) }));

  const opBron = new Map();
  for (const model of kit.modellen) {
    if (!model.bronmodel) continue;
    const namen = opBron.get(model.bronmodel);
    if (namen) namen.push(model.naam);
    else opBron.set(model.bronmodel, [model.naam]);
  }
  const opNaamKit = new Set(kit.modellen.map((m) => m.naam));

  const geraakt = new Set();
  const rest = [];
  for (const model of gemeten) {
    const namen = opBron.get(model.naam) ?? (opNaamKit.has(kebab(model.naam)) ? [kebab(model.naam)] : null);
    if (namen !== null) for (const naam of namen) geraakt.add(naam);
    else rest.push(model);
  }

  const schaal = kit.schaal ?? 1;

  const teGaan = new Map();
  for (const { naam, driehoeken, wdh } of kit.modellen) {
    if (geraakt.has(naam)) continue;
    const kandidaten = teGaan.get(driehoeken) ?? [];
    kandidaten.push({ naam, wdh });
    teGaan.set(driehoeken, kandidaten);
  }

  const gevonden = [];
  const ontbreekt = [];
  for (const model of rest) {
    const kandidaten = teGaan.get(model.driehoeken) ?? [];
    const bronWdh = [model.wdh[0], model.wdh[2], model.wdh[1]].map((v) => v * schaal);
    const index = kandidaten.findIndex((k) => wdhMatches(k.wdh, bronWdh));
    if (index === -1) {
      ontbreekt.push(model);
      continue;
    }
    const [match] = kandidaten.splice(index, 1);
    gevonden.push({ bron: model.naam, catalogus: match.naam, driehoeken: model.driehoeken });
  }

  const onherkend = [...teGaan.values()].reduce((som, arr) => som + arr.length, 0);
  if (onherkend) {
    waarschuwingen.push(
      `${bronkit.kit}: ${onherkend} of ${kit.aantal} workfiles match no model in ` +
        `${bronkit.naam} by name or by triangle count and size — renamed and edited after import, so ` +
        'that many source models are listed as missing while they may not be',
    );
  }
  if (gevonden.length) {
    waarschuwingen.push(
      `${bronkit.kit}: ${gevonden.length} model(s) in ${bronkit.naam} matched a catalogue workfile ` +
        'only by triangle count and size, not by name — verify these by hand:\n' +
        gevonden.map((g) => `    ${g.bron} (${g.driehoeken} tris) -> ${g.catalogus}`).join('\n'),
    );
  }

  const uitvoerMap = join(DOEL_DIR, bronId(bronkit));
  const gekopieerd = new Map();
  const gebruikteNamen = new Set();

  const neemMee = (pad) => {
    const sleutel = createHash('sha1').update(readFileSync(pad)).digest('hex');
    if (gekopieerd.has(sleutel)) return gekopieerd.get(sleutel);
    let naam = basename(pad);
    for (let n = 2; gebruikteNamen.has(naam); n++) {
      naam = `${basename(pad, extname(pad))}-${n}${extname(pad)}`;
    }
    gebruikteNamen.add(naam);
    gekopieerd.set(sleutel, naam);
    copyFileSync(pad, join(uitvoerMap, naam));
    return naam;
  };

  if (ontbreekt.length) mkdirSync(uitvoerMap, { recursive: true });

  for (const model of ontbreekt) {
    const texturen = [];
    const kleuren = [];
    for (const primitief of model.primitieven) {
      const { textuur, naam } = primitief.materiaal;
      const gevonden = vindTextuur(textuur, uitgepakt, afbeeldingen);
      texturen.push(gevonden ? neemMee(gevonden) : null);
      if (gevonden) {
        kleuren.push(null);
        continue;
      }
      const gekozen = handkleuren[naam]
        ?? handkleuren[String(naam ?? '').replace(/\.\d+$/, '')]
        ?? handkleuren[basename(String(textuur ?? ''))];
      if (gekozen) {
        kleuren.push(uitHex(gekozen));
        continue;
      }
      const lijkend = gelijkendeAfbeelding(textuur, naam, afbeeldingen);
      kleuren.push(lijkend ? gemiddeldeKleur(lijkend) : null);
    }

    const pad = join(uitvoerMap, `${model.naam}.glb`);
    schrijfPreview(pad, model.primitieven, model, schaal, texturen, kleuren);

    const wdh = model.wdh.map((v) => v * schaal);
    modellen.push({
      kit: bronId(bronkit),
      name: model.naam,
      kind: kindFromName(kebab(model.naam), model.wdh ?? [1, 1, 1]),
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
    slug: bronId(bronkit),
    name: bronkit.naam,
    kit: bronkit.kit,
    format: bronkit.formaat,
    inSource: gemeten.length,
    inCatalog: kit.aantal,
    missing: ontbreekt.length,
    unmatched: onherkend,
    scale: kit.schaal,
    folder: map.slice(uitgepakt.length + 1) || null,
  });

  console.log(
    `${bronId(bronkit).padEnd(38)} ${String(gemeten.length).padStart(4)} in source, ` +
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
  kinds: [...readKindTree().keys()].map((id) => ({ id, name: kindName(id), ...(KIND_COLORS[id] ? { color: KIND_COLORS[id] } : {}) })),
  models: modellen,
};

writeFileSync(join(CATALOG_DIR, 'missing.json'), JSON.stringify(uitvoer, (k, v) => (v === null ? undefined : v), 1) + '\n');

const totaal = bronnen.reduce((som, b) => som + b.missing, 0);
console.log(`\n${totaal} missing models from ${bronnen.length} packs → catalog/missing.json`);
for (const regel of waarschuwingen) console.warn(`! ${regel}`);
