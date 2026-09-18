import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readGlb, writeGlb, measureScene, trianglesPerUnit } from './glb.mjs';
import { readPng } from './png.mjs';
import { readKindTree, kindName, kindFromName } from './kinds.mjs';
import { BRONKITS } from './bronkits.mjs';
import { alleBestanden, bronModellen, bronId, meet, kebab } from './bronmodellen.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CATALOG_DIR = join(ROOT, 'catalog');
const WERK_DIR = join(ROOT, 'kits', 'workfiles');
const DOEL_DIR = join(ROOT, 'kits', 'tbd');
const DOEL_PAD = 'kits/tbd';
const AFGEWEZEN_DIR = join(ROOT, 'kits', 'reject');
const AFGEWEZEN_PAD = 'kits/reject';

const AFBEELDINGEN = new Set(['.png', '.jpg', '.jpeg']);

const HANDKLEUREN = JSON.parse(readFileSync(join(CATALOG_DIR, 'preview-colors.json'), 'utf8'));
const AFWIJZINGEN = JSON.parse(readFileSync(join(CATALOG_DIR, 'rejects.json'), 'utf8'));

const round1 = (v) => Math.max(Math.round(v * 10) / 10, 0.1);
const round = (v, n) => Math.round(v * 10 ** n) / 10 ** n;

function kitGegevens(slug) {
  const dir = join(WERK_DIR, slug);
  if (!existsSync(dir)) return { modellen: [], schaal: null, aantal: 0 };

  const modellen = [];
  const telling = new Map();
  for (const bestand of readdirSync(dir).filter((n) => n.endsWith('.glb'))) {
    const glb = readGlb(join(dir, bestand));
    const extras = glb.json.asset?.extras?.taaleiland ?? {};
    const gemeten = measureScene(glb);
    modellen.push({
      naam: basename(bestand, '.glb'),
      bronmodel: extras.bronmodel ?? null,
      driehoeken: gemeten.triangles,
      wdh: gemeten.wdh,
      schaal: extras.schaal ?? null,
    });
    if (extras.schaal != null) telling.set(extras.schaal, (telling.get(extras.schaal) ?? 0) + 1);
  }
  const vaakst = [...telling.entries()].sort((a, b) => b[1] - a[1])[0];
  return { modellen, schaal: vaakst?.[0] ?? null, aantal: modellen.length };
}

const WDH_TOLERANCE = 0.05;

function wdhMatches(a, b) {
  return a.every((v, k) => Math.abs(v - b[k]) <= Math.max(WDH_TOLERANCE * Math.max(v, b[k]), 0.01));
}

// The shape of a model, with everything that only carries colour left out: the
// vertex positions and the triangles they close, moved to where the preview puts
// them, but no UVs, no materials and no primitive order. Two models of a pack that
// come out the same are one shape in as many colours.
function vormsleutel(primitieven, { laag, hoog }) {
  const midden = [(laag[0] + hoog[0]) / 2, laag[1], (laag[2] + hoog[2]) / 2];
  const delen = primitieven.map((primitief) => {
    const hash = createHash('sha1');
    for (let i = 0; i < primitief.posities.length; i++) {
      hash.update(`${Math.round((primitief.posities[i] - midden[i % 3]) * 1e5)},`);
    }
    for (const index of primitief.indices) hash.update(`${index},`);
    return hash.digest('hex');
  });
  return createHash('sha1').update(delen.sort().join('|')).digest('hex').slice(0, 16);
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
      generator: 'catalog/tools/build-lists.mjs',
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
rmSync(AFGEWEZEN_DIR, { recursive: true, force: true });
mkdirSync(AFGEWEZEN_DIR, { recursive: true });

const LIJSTEN = [
  { sleutel: 'ontbreekt', dir: DOEL_DIR, pad: DOEL_PAD, bestand: 'tbd.json', modellen: [], bronnen: [], varianten: [] },
  { sleutel: 'afgewezen', dir: AFGEWEZEN_DIR, pad: AFGEWEZEN_PAD, bestand: 'reject.json', modellen: [], bronnen: [], varianten: [] },
];

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
  for (const { naam, driehoeken, wdh, schaal: eigen } of kit.modellen) {
    if (geraakt.has(naam)) continue;
    const kandidaten = teGaan.get(driehoeken) ?? [];
    kandidaten.push({ naam, wdh, schaal: eigen ?? schaal });
    teGaan.set(driehoeken, kandidaten);
  }

  const gevonden = [];
  const ontbreekt = [];
  for (const model of rest) {
    const kandidaten = teGaan.get(model.driehoeken) ?? [];
    const bronWdh = [model.wdh[0], model.wdh[2], model.wdh[1]];
    const index = kandidaten.findIndex((k) => wdhMatches(k.wdh, bronWdh.map((v) => v * k.schaal)));
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
        'that many source models are listed as TBD while they may not be',
    );
  }
  if (gevonden.length) {
    waarschuwingen.push(
      `${bronkit.kit}: ${gevonden.length} model(s) in ${bronkit.naam} matched a catalog workfile ` +
        'only by triangle count and size, not by name — verify these by hand:\n' +
        gevonden.map((g) => `    ${g.bron} (${g.driehoeken} tris) -> ${g.catalogus}`).join('\n'),
    );
  }

  const afwijzingen = AFWIJZINGEN[bronId(bronkit)] ?? {};
  const perLijst = {
    ontbreekt: ontbreekt.filter((model) => !afwijzingen[model.naam]),
    afgewezen: ontbreekt.filter((model) => afwijzingen[model.naam]),
  };

  for (const lijst of LIJSTEN) {
    const eigen = perLijst[lijst.sleutel];
    const uitvoerMap = join(lijst.dir, bronId(bronkit));
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

    if (eigen.length) mkdirSync(uitvoerMap, { recursive: true });

    const perVorm = new Map();

    for (const model of eigen) {
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
      const regel = {
        kit: bronId(bronkit),
        name: model.naam,
        kind: kindFromName(kebab(model.naam)),
        wdh: wdh.map(round1),
        tris: model.driehoeken,
        tpu: trianglesPerUnit(model.driehoeken, wdh),
        mat: model.primitieven.length,
        bytes: statSync(pad).size,
        scaled: kit.schaal !== null || undefined,
        reason: afwijzingen[model.naam] ?? null,
        file: model.bestand,
      };
      lijst.modellen.push(regel);

      const sleutel = vormsleutel(model.primitieven, model);
      const leden = perVorm.get(sleutel);
      if (leden) leden.push(regel);
      else perVorm.set(sleutel, [regel]);
    }

    for (const leden of perVorm.values()) {
      if (leden.length < 2) continue;
      const id = `v${String(lijst.varianten.length + 1).padStart(3, '0')}`;
      for (const lid of leden) lid.variant = id;
      lijst.varianten.push({
        id,
        main: `${leden[0].kit}/${leden[0].name}`,
        members: leden.map((lid) => `${lid.kit}/${lid.name}`),
      });
    }

    if (!eigen.length) continue;

    lijst.bronnen.push({
      slug: bronId(bronkit),
      name: bronkit.naam,
      kit: bronkit.kit,
      format: bronkit.formaat,
      inSource: gemeten.length,
      inCatalog: kit.aantal,
      listed: eigen.length,
      unmatched: onherkend,
      scale: kit.schaal,
      folder: map.slice(uitgepakt.length + 1) || null,
    });
  }

  console.log(
    `${bronId(bronkit).padEnd(38)} ${String(gemeten.length).padStart(4)} in source, ` +
      `${String(kit.aantal).padStart(4)} in catalog → ${String(perLijst.ontbreekt.length).padStart(4)} tbd` +
      (perLijst.afgewezen.length ? `, ${perLijst.afgewezen.length} reject` : '') +
      (onherkend ? `  (${onherkend} workfiles unmatched)` : '') +
      (bronkit.kit ? '' : '  — never imported'),
  );
}

const afgewezenLijst = LIJSTEN.find((l) => l.sleutel === 'afgewezen');
const geraakteAfwijzingen = new Set(afgewezenLijst.modellen.map((m) => `${m.kit}/${m.name}`));
const losseAfwijzingen = Object.entries(AFWIJZINGEN)
  .flatMap(([kit, namen]) => Object.keys(namen).map((naam) => `${kit}/${naam}`))
  .filter((id) => !geraakteAfwijzingen.has(id));
if (losseAfwijzingen.length) {
  waarschuwingen.push(
    `${losseAfwijzingen.length} entries in catalog/rejects.json match no source model outside the ` +
      'catalog — they were renamed, imported, or the pack was dropped:\n' +
      losseAfwijzingen.map((id) => `    ${id}`).join('\n'),
  );
}

const soorten = [...readKindTree().keys()].map((id) => ({ id, name: kindName(id) }));

for (const lijst of LIJSTEN) {
  const uitvoer = {
    modelPath: lijst.pad,
    kits: lijst.bronnen.map((b) => ({ slug: b.slug, name: b.name, note: b.kit ? null : 'This pack was never imported — nothing from it is in the catalog.' })),
    sources: lijst.bronnen,
    kinds: soorten,
    variants: lijst.varianten,
    models: lijst.modellen,
  };

  writeFileSync(join(CATALOG_DIR, lijst.bestand), JSON.stringify(uitvoer, (k, v) => (v === null ? undefined : v), 1) + '\n');

  const gevouwen = lijst.varianten.reduce((som, v) => som + v.members.length - 1, 0);
  console.log(`\n${lijst.modellen.length} models from ${lijst.bronnen.length} packs → catalog/${lijst.bestand}`);
  console.log(`${lijst.varianten.length} shapes appear in more than one colour: ${gevouwen} models fold into another card`);
}

for (const regel of waarschuwingen) console.warn(`! ${regel}`);
