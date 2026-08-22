
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { GROEPEN, KIT_GROEPEN, bepaalGroep } from './semantiek.mjs';
import { leesGlb, leesAccessor, meetScene, driehoekenPerUnit, BUDGET_PER_UNIT } from './glb.mjs';
import { leesPng } from './png.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KITS_DIR = join(ROOT, 'kits');
const MODEL_DIR = join(KITS_DIR, 'workfiles');
const MODEL_PAD = 'kits/workfiles';

const KOLOMMEN = 16;
const RIJEN = 4;

function leesKitMetadata() {
  const bron = readFileSync(join(KITS_DIR, 'manifest.js'), 'utf8');
  const context = { window: {} };
  runInNewContext(bron, context, { timeout: 5000, filename: 'kits/manifest.js' });

  const kits = context.window.KENNEY_KITS;
  if (!Array.isArray(kits)) {
    throw new Error('kits/manifest.js zet geen window.KENNEY_KITS-array');
  }

  const meta = new Map();
  for (const kit of kits) {
    meta.set(kit.slug, {
      naam: kit.name,
      url: kit.url,
      tabblad: kit.tabblad ?? null,
      toelichting: kit.toelichting ?? null,
      buitenCatalogus: kit.buitenCatalogus === true,
      buitenCatalogusModellen: new Set(
        Array.isArray(kit.buitenCatalogus) ? kit.buitenCatalogus : [],
      ),
      eigenPalet: kit.eigenPalet === true,
      licentieLabel: kit.licentieLabel ?? 'CC0',
    });
  }
  return meta;
}

function leesVarianten(idsInCatalogus) {
  const bestand = join(ROOT, 'docs', 'asset_variants.json');
  if (!existsSync(bestand)) return { groepen: [], perModel: new Map() };

  const bron = JSON.parse(readFileSync(bestand, 'utf8'));
  const groepen = [];
  const perModel = new Map();

  bron.clusters?.forEach((cluster, n) => {
    const leden = cluster.leden.filter((id) => idsInCatalogus.has(id));
    if (leden.length < 2) return;
    const id = `v${String(n + 1).padStart(2, '0')}`;
    const hoofd = leden.includes(cluster.hoofd) ? cluster.hoofd : leden[0];
    groepen.push({ id, soort: cluster.soort, hoofd, leden });
    for (const lid of leden) perModel.set(lid, id);
  });

  return { groepen, perModel };
}

const atlassen = new Map();

function leesAtlas(pad) {
  if (!atlassen.has(pad)) {
    const png = leesPng(pad);
    const sleutel = createHash('sha256').update(readFileSync(pad)).digest('hex').slice(0, 12);
    atlassen.set(pad, { ...png, sleutel });
  }
  return atlassen.get(pad);
}

function naarSrgb(lineair) {
  const v = lineair <= 0.0031308 ? lineair * 12.92 : 1.055 * lineair ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(Math.max(v, 0), 1) * 255);
}

const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

function leesKleuren(glb, dir) {
  const { json } = glb;
  const banen = new Set();
  const materialen = new Map();
  let atlasPad = null;

  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      const materiaal = json.materials?.[prim.material];
      if (!materiaal) continue;
      const texIndex = materiaal.pbrMetallicRoughness?.baseColorTexture?.index;

      if (texIndex === undefined) {
        const factor = materiaal.pbrMetallicRoughness?.baseColorFactor;
        if (!factor) continue;
        materialen.set(hex(...factor.slice(0, 3).map(naarSrgb)), materiaal.name ?? 'materiaal');
        continue;
      }

      const bron = json.images?.[json.textures?.[texIndex]?.source]?.uri;
      if (!bron || prim.attributes?.TEXCOORD_0 === undefined) continue;
      const pad = join(dir, decodeURIComponent(bron));
      if (atlasPad && atlasPad !== pad) throw new Error(`${dir}: meer dan één colormap in één model`);
      atlasPad = pad;

      const atlas = leesAtlas(pad);
      const celBreed = atlas.breedte / KOLOMMEN;
      const celHoog = atlas.hoogte / RIJEN;
      const uv = leesAccessor(glb, prim.attributes.TEXCOORD_0);

      for (let i = 0; i < uv.count; i++) {
        const x = Math.min(Math.max(Math.floor(uv.data[i * 2] * atlas.breedte), 0), atlas.breedte - 1);
        const y = Math.min(Math.max(Math.floor(uv.data[i * 2 + 1] * atlas.hoogte), 0), atlas.hoogte - 1);
        const i4 = (y * atlas.breedte + x) * 4;
        if (atlas.pixels[i4] === 0 && atlas.pixels[i4 + 1] === 0 && atlas.pixels[i4 + 2] === 0) continue;
        banen.add(`${Math.floor(x / celBreed)},${Math.floor(y / celHoog)}`);
      }
    }
  }

  return { atlas: atlasPad, banen, materialen };
}

function baanKleur(atlas, baan) {
  const [kolom, rij] = baan.split(',').map(Number);
  const celBreed = atlas.breedte / KOLOMMEN;
  const celHoog = atlas.hoogte / RIJEN;
  const x = Math.floor(kolom * celBreed + celBreed / 2);
  const y = Math.floor(rij * celHoog + celHoog / 2);
  const i4 = (y * atlas.breedte + x) * 4;
  return hex(atlas.pixels[i4], atlas.pixels[i4 + 1], atlas.pixels[i4 + 2]);
}

function kleurNaam(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const licht = (max + min) / 2;
  const delta = max - min;
  const verzadiging = delta === 0 ? 0 : delta / (1 - Math.abs(2 * licht - 1));

  if (verzadiging < 0.18) {
    if (licht > 0.8) return 'wit';
    if (licht > 0.45) return 'lichtgrijs';
    if (licht > 0.25) return 'grijs';
    return 'donkergrijs';
  }

  let tint = 0;
  if (max === r) tint = ((g - b) / delta) % 6;
  else if (max === g) tint = (b - r) / delta + 2;
  else tint = (r - g) / delta + 4;
  tint = (tint * 60 + 360) % 360;

  const basis =
    tint < 15 || tint >= 345 ? 'rood'
    : tint < 40 ? (licht < 0.45 ? 'bruin' : 'oranje')
    : tint < 50 ? (licht < 0.5 ? 'bruin' : 'oranje')
    : tint < 70 ? 'geel'
    : tint < 165 ? 'groen'
    : tint < 200 ? 'turquoise'
    : tint < 260 ? 'blauw'
    : tint < 300 ? 'paars'
    : 'roze';

  if (licht < 0.3) return `donker${basis}`;
  if (licht > 0.75) return `licht${basis}`;
  return basis;
}

function schrijfVersie() {
  const inhoud = ['catalog.json', 'catalog.css', 'catalog.js']
    .map((naam) => readFileSync(join(ROOT, 'kits', naam)))
    .join('');
  const versie = createHash('sha256').update(inhoud).digest('hex').slice(0, 10);

  const pad = join(ROOT, 'index.html');
  const html = readFileSync(pad, 'utf8')
    .replace(/href="kits\/catalog\.css(?:\?v=[a-f0-9]+)?"/, `href="kits/catalog.css?v=${versie}"`)
    .replace(/src="kits\/catalog\.js(?:\?v=[a-f0-9]+)?"/, `src="kits/catalog.js?v=${versie}"`)
    .replace(/<meta name="catalogus-versie" content="[^"]*">/, `<meta name="catalogus-versie" content="${versie}">`);

  writeFileSync(pad, html);
  console.log(`versie ${versie} → index.html`);
}

const kitMeta = leesKitMetadata();
const kitSlugs = readdirSync(MODEL_DIR)
  .filter((naam) => statSync(join(MODEL_DIR, naam)).isDirectory())
  .filter((naam) => !kitMeta.get(naam)?.buitenCatalogus)
  .sort();

const kits = [];
const modellen = [];
const perModelKleur = new Map();
const zonderMetadata = [];
const zonderGroep = [];
const zonderKleur = [];

for (const slug of kitSlugs) {
  const dir = join(MODEL_DIR, slug);
  const meta = kitMeta.get(slug);
  if (!meta) zonderMetadata.push(slug);

  const bestanden = readdirSync(dir)
    .filter((n) => n.endsWith('.glb'))
    .filter((n) => !meta?.buitenCatalogusModellen.has(n.replace(/\.glb$/, '')))
    .sort();
  if (bestanden.length === 0) continue;

  for (const bestand of bestanden) {
    const naam = bestand.replace(/\.glb$/, '');
    const pad = `${MODEL_PAD}/${slug}/${bestand}`;
    const glb = leesGlb(join(dir, bestand));
    const gltf = glb.json;
    const scene = meetScene(glb);
    const groep = bepaalGroep(slug, naam);
    if (groep === 'overig') zonderGroep.push(`${slug}/${naam}`);

    const gelezen = leesKleuren(glb, dir);
    if (gelezen.banen.size === 0 && gelezen.materialen.size === 0) zonderKleur.push(`${slug}/${naam}`);
    const paletSleutel = gelezen.atlas ? leesAtlas(gelezen.atlas).sleutel : `materiaal:${slug}`;
    perModelKleur.set(`${slug}/${naam}`, { ...gelezen, paletSleutel });

    modellen.push({
      id: `${slug}/${naam}`,
      naam,
      kit: slug,
      groep,
      palet: null,
      kleuren: [],
      pad,
      bytes: statSync(join(dir, bestand)).size,
      driehoeken: scene.driehoeken,
      driehoekenPerUnit: driehoekenPerUnit(scene.driehoeken, scene.wdh),
      materialen: (gltf.materials ?? []).length,
      wdh: scene.wdh,
      calls: scene.calls,
      ...((gltf.animations ?? []).length
        ? { animaties: gltf.animations.map((a, i) => a.name ?? `animatie ${i}`) }
        : {}),
    });
  }

  kits.push({
    slug,
    naam: meta?.naam ?? slug,
    kort: (meta?.naam ?? slug).replace(/\s+Kit$/, ''),
    url: meta?.url ?? null,
    licentie: `${MODEL_PAD}/${slug}/LICENSE.txt`,
    licentieLabel: meta?.licentieLabel ?? 'CC0',
    aantal: bestanden.length,
    tabblad: meta?.tabblad ?? null,
    eigenPalet: meta?.eigenPalet ?? false,
    kitGroep: KIT_GROEPEN[slug] ?? null,
    toelichting: meta?.toelichting ?? null,
    palet: null,
  });
}

const varianten = leesVarianten(new Set(modellen.map((m) => m.id)));
for (const model of modellen) {
  const groep = varianten.perModel.get(model.id);
  if (groep) model.variant = groep;
}

const paletten = new Map();

for (const model of modellen) {
  const gelezen = perModelKleur.get(model.id);
  if (!gelezen || (gelezen.banen.size === 0 && gelezen.materialen.size === 0)) continue;

  if (!paletten.has(gelezen.paletSleutel)) {
    paletten.set(gelezen.paletSleutel, {
      atlas: gelezen.atlas,
      kits: new Set(),
      banen: new Set(),
      materialen: new Map(),
    });
  }
  const palet = paletten.get(gelezen.paletSleutel);
  palet.kits.add(model.kit);

  for (const baan of gelezen.banen) palet.banen.add(baan);
  for (const [hex, naam] of gelezen.materialen) {
    if (!palet.materialen.has(hex)) palet.materialen.set(hex, new Set());
    palet.materialen.get(hex).add(naam);
  }
}

const GEDEELDE_ATLAS = join(KITS_DIR, 'colormap.png');
const gedeeldeSleutel = existsSync(GEDEELDE_ATLAS) ? leesAtlas(GEDEELDE_ATLAS).sleutel : null;

for (const [sleutel, palet] of paletten) {
  palet.baanKleur = new Map();
  if (palet.atlas) {
    const atlas = leesAtlas(palet.atlas);
    for (const baan of palet.banen) palet.baanKleur.set(baan, baanKleur(atlas, baan));
  }

  const kits = [...palet.kits].sort();
  const gedeeld = kits.length > 1;
  palet.id = gedeeld ? 'gedeeld' : kits[0];
  palet.naam = gedeeld ? 'Gedeelde kits' : kitMeta.get(kits[0])?.naam ?? kits[0];
  palet.toelichting = palet.atlas
    ? null
    : 'Geen colormap: elk materiaal van deze kit draagt zijn eigen basiskleur.';
  palet.atlasPad = !palet.atlas
    ? null
    : sleutel === gedeeldeSleutel
      ? 'kits/colormap.png'
      : palet.atlas.slice(ROOT.length + 1).split(sep).join('/');
}

for (const model of modellen) {
  const gelezen = perModelKleur.get(model.id);
  const palet = paletten.get(gelezen?.paletSleutel);
  if (!palet) continue;
  model.palet = palet.id;
  model.kleuren = [
    ...new Set([
      ...[...gelezen.banen].map((baan) => palet.baanKleur.get(baan)),
      ...gelezen.materialen.keys(),
    ]),
  ].sort();
}

for (const kit of kits) {
  kit.palet = modellen.find((m) => m.kit === kit.slug && m.palet)?.palet ?? null;
}

const kleurenPerPalet = new Map();
for (const palet of paletten.values()) kleurenPerPalet.set(palet.id, new Map());
for (const model of modellen) {
  const kleuren = kleurenPerPalet.get(model.palet);
  if (!kleuren) continue;
  for (const hex of model.kleuren) kleuren.set(hex, (kleuren.get(hex) ?? 0) + 1);
}

const catalogus = {
  gegenereerd: 'node tools/build-catalog.mjs',
  totaal: modellen.length,
  budgetPerUnit: BUDGET_PER_UNIT,
  kits,
  varianten: varianten.groepen,
  groepen: GROEPEN.map(({ beschrijving, ...g }) => ({
    ...g,
    aantal: modellen.filter((m) => m.groep === g.id).length,
  })),
  paletten: [...paletten.values()]
    .map((p) => ({
      id: p.id,
      naam: p.naam,
      atlas: p.atlasPad,
      toelichting: p.toelichting,
      kleuren: [...(kleurenPerPalet.get(p.id) ?? new Map())]
        .map(([hex, aantal]) => ({
          hex,
          naam: kleurNaam(hex),
          textuur: [...p.baanKleur].filter(([, k]) => k === hex).map(([baan]) => `baan ${baan}`).join(' / ') || null,
          materiaal: [...(p.materialen.get(hex) ?? [])].sort().join(' / ') || null,
          aantal,
        }))
        .sort((a, b) => b.aantal - a.aantal || a.hex.localeCompare(b.hex)),
    }))
    .filter((p) => p.kleuren.length > 0)
    .sort((a, b) => b.kleuren.length - a.kleuren.length || a.id.localeCompare(b.id)),
  modellen,
};

writeFileSync(join(ROOT, 'kits', 'catalog.json'), JSON.stringify(catalogus, null, 1) + '\n');
schrijfVersie();

console.log(`${modellen.length} modellen in ${kits.length} kits → kits/catalog.json`);
for (const g of catalogus.groepen) {
  console.log(`  ${String(g.aantal).padStart(3)}  ${g.naam}`);
}
for (const p of catalogus.paletten) {
  console.log(`palet ${p.id} — ${p.kleuren.length} kleuren uit ${p.atlas ?? 'eigen materialen'}:`);
  for (const k of p.kleuren) {
    console.log(`  ${String(k.aantal).padStart(3)}  ${k.hex}  ${k.naam}`);
  }
}

const paletPerKit = new Map();
for (const model of modellen) {
  if (!paletPerKit.has(model.kit)) paletPerKit.set(model.kit, new Set());
  if (model.palet) paletPerKit.get(model.kit).add(model.palet);
}
for (const [kit, gebruikt] of paletPerKit) {
  if (gebruikt.size > 1) console.warn(`! ${kit} put uit meer dan één palet: ${[...gebruikt].join(', ')}`);
}
const kitsPerPalet = new Map();
for (const kit of kits) {
  if (kit.palet) kitsPerPalet.set(kit.palet, (kitsPerPalet.get(kit.palet) ?? 0) + 1);
}
for (const kit of kits) {
  if (kit.palet && kitsPerPalet.get(kit.palet) === 1 && !kit.tabblad && !kit.eigenPalet) {
    console.warn(`! ${kit.slug} heeft een eigen palet maar geen "tabblad" in manifest.js`);
  }
}

const bovenBudget = modellen
  .filter((m) => m.driehoekenPerUnit !== null && m.driehoekenPerUnit > BUDGET_PER_UNIT)
  .sort((a, b) => b.driehoekenPerUnit - a.driehoekenPerUnit);
const ERGSTE = 25;
if (bovenBudget.length) {
  console.warn(`! ${bovenBudget.length} modellen boven ${BUDGET_PER_UNIT} driehoeken per unit, de ergste ${Math.min(ERGSTE, bovenBudget.length)}:`);
  for (const m of bovenBudget.slice(0, ERGSTE)) {
    console.warn(`  ${String(m.driehoekenPerUnit).padStart(6)}  ${m.id}  (${m.driehoeken} tri, ${m.wdh.join(' × ')})`);
  }
  if (bovenBudget.length > ERGSTE) {
    console.warn(`  … en nog ${bovenBudget.length - ERGSTE}; de hele lijst staat in catalog.json`);
  }
}
const plat = modellen.filter((m) => m.driehoekenPerUnit === null);
if (plat.length) {
  console.warn(`! ${plat.length} platte modellen zonder volume, dus zonder dichtheid: ${plat.map((m) => m.id).join(', ')}`);
}

if (zonderMetadata.length) console.warn(`! geen metadata in manifest.js: ${zonderMetadata.join(', ')}`);
if (zonderGroep.length) console.warn(`! geen semantische groep: ${zonderGroep.join(', ')}`);
if (zonderKleur.length) {
  console.warn(`! ${zonderKleur.length} modellen zonder kleur in de .glb (kleurfilter slaat ze over)`);
}
