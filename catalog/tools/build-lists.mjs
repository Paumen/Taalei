import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readGlb, writeGlb, measureScene, trianglesPerUnit } from './glb.mjs';
import { readPng, writePng } from './png.mjs';
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
const BRON_DIR = join(ROOT, 'kits', 'sources');
const CACHE_FILE = join(ROOT, 'kits', '.cache', 'build-lists.json');

const AFBEELDINGEN = new Set(['.png', '.jpg', '.jpeg']);

const HANDKLEUREN = JSON.parse(readFileSync(join(CATALOG_DIR, 'data', 'preview-colors.json'), 'utf8'));
const AFWIJZINGEN = JSON.parse(readFileSync(join(CATALOG_DIR, 'data', 'rejects.json'), 'utf8'));

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
  const [x, y] = [[...a].sort((p, q) => p - q), [...b].sort((p, q) => p - q)];
  return x.every((v, k) => Math.abs(v - y[k]) <= Math.max(WDH_TOLERANCE * Math.max(v, y[k]), 0.01));
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
  if (gevraagd.includes('/') && existsSync(gevraagd)) return { pad: gevraagd, zeker: true };
  const gezocht = basename(gevraagd).toLowerCase();
  const raak = afbeeldingen.find((p) => basename(p).toLowerCase() === gezocht);
  if (raak) return { pad: raak, zeker: true };
  return afbeeldingen.length === 1 ? { pad: afbeeldingen[0], zeker: false } : null;
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

const DATAKAARTEN = new Set([
  'alpha', 'ambient', 'emission', 'emissive', 'gloss', 'glossiness', 'height',
  'mask', 'metallic', 'metalness', 'normal', 'occlusion', 'opacity', 'orm',
  'roughness', 'specular',
]);

const isDatakaart = (pad) => [...woorden(pad)].some((woord) => DATAKAARTEN.has(woord));

function gelijkendeAfbeelding(gevraagd, materiaalNaam, afbeeldingen) {
  const uitTextuur = woorden(gevraagd);
  const uitMateriaal = woorden(materiaalNaam);
  if (uitTextuur.size === 0 && uitMateriaal.size === 0) return null;

  let beste = null;
  let besteScore = 0;
  for (const pad of afbeeldingen) {
    if (isDatakaart(pad) && !isDatakaart(gevraagd)) continue;
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

const PREVIEW_TEXEL = 1024;

function kleinerePng(pad, doel) {
  if (extname(pad).toLowerCase() !== '.png') return false;

  const { width, height, pixels } = readPng(pad);
  const factor = Math.ceil(Math.max(width, height) / PREVIEW_TEXEL);
  if (factor < 2) return false;

  const breed = Math.max(1, Math.ceil(width / factor));
  const hoog = Math.max(1, Math.ceil(height / factor));
  const uit = Buffer.alloc(breed * hoog * 4);

  for (let y = 0; y < hoog; y++) {
    for (let x = 0; x < breed; x++) {
      const som = [0, 0, 0, 0];
      let gewicht = 0;
      for (let dy = 0; dy < factor; dy++) {
        const by = y * factor + dy;
        if (by >= height) break;
        for (let dx = 0; dx < factor; dx++) {
          const bx = x * factor + dx;
          if (bx >= width) break;
          const i = (by * width + bx) * 4;
          const alpha = pixels[i + 3] / 255;
          for (let k = 0; k < 3; k++) som[k] += (pixels[i + k] / 255) ** 2.2 * alpha;
          som[3] += pixels[i + 3];
          gewicht += alpha;
        }
      }
      const tel = Math.min(factor, height - y * factor) * Math.min(factor, width - x * factor);
      const j = (y * breed + x) * 4;
      for (let k = 0; k < 3; k++) {
        uit[j + k] = gewicht > 0 ? Math.round(((som[k] / gewicht) ** (1 / 2.2)) * 255) : 0;
      }
      uit[j + 3] = Math.round(som[3] / tel);
    }
  }

  writePng(doel, { width: breed, height: hoog, pixels: uit });
  return true;
}

const sameNumber = (a, b) => a === b || (a !== a && b !== b);

function las(primitief, midden, metUvs) {
  const bron = primitief.posities;
  const aantal = bron.length / 3;
  const buckets = new Map();
  const posities = [];
  const normalen = [];
  const uvs = [];
  const nieuw = new Int32Array(aantal);

  const heeftNormalen = Boolean(primitief.normalen);
  const heeftUvs = Boolean(primitief.uvs) && metUvs;

  const values = new Float32Array(8);
  const bits = new Int32Array(values.buffer);
  const width = 3 + (heeftNormalen ? 3 : 0) + (heeftUvs ? 2 : 0);
  const uvAt = width - 2;

  const matches = (index) => {
    for (let k = 0; k < 3; k++) if (!sameNumber(posities[index * 3 + k], values[k])) return false;
    if (heeftNormalen) {
      for (let k = 0; k < 3; k++) if (!sameNumber(normalen[index * 3 + k], values[3 + k])) return false;
    }
    if (heeftUvs) {
      for (let k = 0; k < 2; k++) if (!sameNumber(uvs[index * 2 + k], values[uvAt + k])) return false;
    }
    return true;
  };

  for (let i = 0; i < aantal; i++) {
    for (let k = 0; k < 3; k++) values[k] = bron[i * 3 + k] - midden[k];
    if (heeftNormalen) for (let k = 0; k < 3; k++) values[3 + k] = primitief.normalen[i * 3 + k];
    if (heeftUvs) for (let k = 0; k < 2; k++) values[uvAt + k] = primitief.uvs[i * 2 + k];

    let key = 0x811c9dc5;
    for (let k = 0; k < width; k++) key = Math.imul(key ^ (values[k] === 0 ? 0 : bits[k]), 0x01000193);

    const candidates = buckets.get(key);
    let index;
    if (candidates) {
      for (const candidate of candidates) {
        if (!matches(candidate)) continue;
        index = candidate;
        break;
      }
    }
    if (index === undefined) {
      index = posities.length / 3;
      posities.push(values[0], values[1], values[2]);
      if (heeftNormalen) normalen.push(values[3], values[4], values[5]);
      if (heeftUvs) uvs.push(values[uvAt], values[uvAt + 1]);
      if (candidates) candidates.push(index);
      else buckets.set(key, [index]);
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

mkdirSync(DOEL_DIR, { recursive: true });
mkdirSync(AFGEWEZEN_DIR, { recursive: true });

const LIJSTEN = [
  { sleutel: 'ontbreekt', dir: DOEL_DIR, pad: DOEL_PAD, bestand: 'tbd.json', modellen: [], bronnen: [], varianten: [] },
  { sleutel: 'afgewezen', dir: AFGEWEZEN_DIR, pad: AFGEWEZEN_PAD, bestand: 'reject.json', modellen: [], bronnen: [], varianten: [] },
];

const force = process.argv.includes('--force');
const cache = !force && existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, 'utf8')) : {};
const fresh = {};

const sha = (data) => createHash('sha1').update(data).digest('hex');

const dirKey = (dir) =>
  (existsSync(dir) ? readdirSync(dir).sort() : [])
    .filter((naam) => statSync(join(dir, naam)).isFile())
    .map((naam) => `${naam}:${sha(readFileSync(join(dir, naam)))}`)
    .join('\n');

const TOOLS_DIR = join(CATALOG_DIR, 'tools');
const toolKey = sha(
  readdirSync(TOOLS_DIR)
    .filter((naam) => naam.endsWith('.mjs'))
    .sort()
    .map((naam) => `${naam}:${sha(readFileSync(join(TOOLS_DIR, naam)))}`)
    .concat(`kinds:${sha(readFileSync(join(ROOT, 'lint', 'kinds.json')))}`)
    .join('\n'),
);

const packKey = (bronkit) =>
  sha(
    [
      toolKey,
      JSON.stringify(bronkit),
      dirKey(join(BRON_DIR, bronkit.map)),
      bronkit.kit ? dirKey(join(WERK_DIR, bronkit.kit)) : '',
      JSON.stringify(HANDKLEUREN[bronId(bronkit)] ?? HANDKLEUREN[bronkit.map] ?? null),
      JSON.stringify(AFWIJZINGEN[bronId(bronkit)] ?? null),
    ].join('\n'),
  );

const waarschuwingen = [];

function snoei(dir, bekend) {
  for (const naam of readdirSync(dir)) {
    const pad = join(dir, naam);
    if (bekend.has(pad)) continue;
    if (!statSync(pad).isDirectory()) {
      rmSync(pad, { force: true });
      continue;
    }
    if ([...bekend].some((id) => id.startsWith(`${pad}/`))) {
      snoei(pad, bekend);
      if (readdirSync(pad).length === 0) rmSync(pad, { recursive: true, force: true });
      continue;
    }
    rmSync(pad, { recursive: true, force: true });
  }
}

function apply(entry) {
  for (const lijst of LIJSTEN) {
    const deel = entry.lists[lijst.sleutel];
    const basis = lijst.modellen.length;
    for (const regel of deel.models) lijst.modellen.push({ ...regel });
    for (const groep of deel.groups) {
      const id = `v${String(lijst.varianten.length + 1).padStart(3, '0')}`;
      const leden = groep.map((i) => lijst.modellen[basis + i]);
      for (const lid of leden) lid.variant = id;
      lijst.varianten.push({
        id,
        main: `${leden[0].kit}/${leden[0].name}`,
        members: leden.map((lid) => `${lid.kit}/${lid.name}`),
      });
    }
    if (deel.source) lijst.bronnen.push(deel.source);
  }
  for (const regel of entry.warnings) waarschuwingen.push(regel);
  console.log(entry.line);
}

let hergebruikt = 0;

for (const bronkit of BRONKITS) {
  const sleutel = packKey(bronkit);
  const bekend = cache[bronId(bronkit)];
  if (bekend?.key === sleutel && bekend.dirs.every((pad) => existsSync(join(ROOT, pad)))) {
    fresh[bronId(bronkit)] = bekend;
    hergebruikt++;
    apply(bekend);
    continue;
  }

  for (const lijst of LIJSTEN) rmSync(join(lijst.dir, bronId(bronkit)), { recursive: true, force: true });
  const entry = { key: sleutel, dirs: [], warnings: [], line: '', lists: {} };

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
  const opNaamKit = new Map(kit.modellen.map((m) => [
    m.naam,
    m.bronmodel ? basename(m.bronmodel, extname(m.bronmodel)) : null,
  ]));

  const geraakt = new Set();
  const rest = [];
  const botsingen = [];
  for (const model of gemeten) {
    let namen = opBron.get(model.naam) ?? null;
    if (namen === null && opNaamKit.has(kebab(model.naam))) {
      const gedraaid = opNaamKit.get(kebab(model.naam));
      if (gedraaid && gedraaid !== model.naam) botsingen.push([model.naam, kebab(model.naam), gedraaid]);
      else namen = [kebab(model.naam)];
    }
    if (namen !== null) for (const naam of namen) geraakt.add(naam);
    else rest.push(model);
  }
  if (botsingen.length) {
    entry.warnings.push(
      `${bronkit.kit}: ${botsingen.length} workfile name(s) clash with a different source model — ` +
        'rename the workfile, or the source model stays listed as TBD:\n' +
        botsingen
          .map(([bron, werk, van]) => `    ${bronkit.kit}/${werk} came from ${van}, not from ${bron}`)
          .join('\n'),
    );
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
    entry.warnings.push(
      `${bronkit.kit}: ${onherkend} of ${kit.aantal} workfiles match no model in ` +
        `${bronkit.naam} by name or by triangle count and size — renamed and edited after import, so ` +
        'that many source models are listed as TBD while they may not be',
    );
  }
  if (gevonden.length) {
    entry.warnings.push(
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
    const deel = { models: [], groups: [], source: null };
    entry.lists[lijst.sleutel] = deel;
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
      const doel = join(uitvoerMap, naam);
      if (!kleinerePng(pad, doel)) copyFileSync(pad, doel);
      return naam;
    };

    if (eigen.length) {
      mkdirSync(uitvoerMap, { recursive: true });
      entry.dirs.push(`${lijst.pad}/${bronId(bronkit)}`);
    }

    const perVorm = new Map();

    for (const model of eigen) {
      const texturen = [];
      const kleuren = [];
      for (const primitief of model.primitieven) {
        const { textuur, naam } = primitief.materiaal;
        const gevonden = vindTextuur(textuur, uitgepakt, afbeeldingen);
        const gekozen = handkleuren[naam]
          ?? handkleuren[String(naam ?? '').replace(/\.\d+$/, '')]
          ?? handkleuren[basename(String(textuur ?? ''))];
        if (gevonden && (gevonden.zeker || !gekozen)) {
          texturen.push(neemMee(gevonden.pad));
          kleuren.push(null);
          continue;
        }
        texturen.push(null);
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
      const plaats = deel.models.push(regel) - 1;

      const sleutel = vormsleutel(model.primitieven, model);
      const leden = perVorm.get(sleutel);
      if (leden) leden.push(plaats);
      else perVorm.set(sleutel, [plaats]);
    }

    for (const leden of perVorm.values()) {
      if (leden.length < 2) continue;
      deel.groups.push(leden);
    }

    if (!eigen.length) continue;

    deel.source = {
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
    };
  }

  entry.line =
    `${bronId(bronkit).padEnd(38)} ${String(gemeten.length).padStart(4)} in source, ` +
    `${String(kit.aantal).padStart(4)} in catalog → ${String(perLijst.ontbreekt.length).padStart(4)} tbd` +
    (perLijst.afgewezen.length ? `, ${perLijst.afgewezen.length} reject` : '') +
    (onherkend ? `  (${onherkend} workfiles unmatched)` : '') +
    (bronkit.kit ? '' : '  — never imported');

  fresh[bronId(bronkit)] = entry;
  apply(entry);
}

for (const lijst of LIJSTEN) snoei(lijst.dir, new Set(BRONKITS.map((b) => join(lijst.dir, bronId(b)))));

mkdirSync(dirname(CACHE_FILE), { recursive: true });
writeFileSync(CACHE_FILE, JSON.stringify(fresh) + '\n');
console.log(`\n${hergebruikt} of ${BRONKITS.length} packs came from the cache in kits/.cache`);

const afgewezenLijst = LIJSTEN.find((l) => l.sleutel === 'afgewezen');
const geraakteAfwijzingen = new Set(afgewezenLijst.modellen.map((m) => `${m.kit}/${m.name}`));
const losseAfwijzingen = Object.entries(AFWIJZINGEN)
  .flatMap(([kit, namen]) => Object.keys(namen).map((naam) => `${kit}/${naam}`))
  .filter((id) => !geraakteAfwijzingen.has(id));
if (losseAfwijzingen.length) {
  waarschuwingen.push(
    `${losseAfwijzingen.length} entries in catalog/data/rejects.json match no source model outside the ` +
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

  writeFileSync(join(CATALOG_DIR, 'build', lijst.bestand), JSON.stringify(uitvoer, (k, v) => (v === null ? undefined : v), 1) + '\n');

  const gevouwen = lijst.varianten.reduce((som, v) => som + v.members.length - 1, 0);
  console.log(`\n${lijst.modellen.length} models from ${lijst.bronnen.length} packs → catalog/${lijst.bestand}`);
  console.log(`${lijst.varianten.length} shapes appear in more than one colour: ${gevouwen} models fold into another card`);
}

for (const regel of waarschuwingen) console.warn(`! ${regel}`);
