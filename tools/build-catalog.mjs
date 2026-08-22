/**
 * Bouwt catalog.json vanuit de bestanden in kits/.
 *
 * Draai vanuit de repo-root:  node tools/build-catalog.mjs
 *
 * De catalogus wordt volledig afgeleid van wat er écht op schijf staat, zodat
 * hij niet uit de pas kan lopen met de kits. Per model worden bestandsgrootte
 * en driehoekstelling uit de .glb gelezen — de tri-count is relevant voor de
 * rendering-budgetten (zie brainstorm.md: cave-kit pas laden ná de ingang).
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { GROEPEN, KIT_GROEPEN, bepaalGroep } from './semantiek.mjs';
import { leesGlb, leesAccessor, meetScene, driehoekenPerUnit, BUDGET_PER_UNIT } from './glb.mjs';
import { leesPng, KOLOMMEN, RIJEN } from './kleurmap.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KITS_DIR = join(ROOT, 'kits');

/* -- kit-metadata ---------------------------------------------------------
 * kits/manifest.js is een browser-script (window.KENNEY_KITS = [...]).
 * We voeren het uit in een lege context met alleen een nep-`window`, zodat we
 * niet afhankelijk zijn van de opmaak van het bestand. De modellijst uit het
 * manifest negeren we; die komt van schijf.
 */
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
    // `tabblad` en `toelichting` staan alleen bij kits die op zichzelf staan:
    // de grot en de onderwater-kit krijgen een eigen tabblad met een eigen
    // uitleg waarom ze niet tussen de andere kits horen.
    meta.set(kit.slug, {
      naam: kit.name,
      url: kit.url,
      tabblad: kit.tabblad ?? null,
      toelichting: kit.toelichting ?? null,
      // `true` = de hele kit doet niet mee; een lijst = deze modellen niet.
      // De bestanden blijven in de repo, ze staan alleen niet in de catalogus.
      buitenCatalogus: kit.buitenCatalogus === true,
      buitenCatalogusModellen: new Set(
        Array.isArray(kit.buitenCatalogus) ? kit.buitenCatalogus : [],
      ),
      eigenPalet: kit.eigenPalet === true,
      // Alle kits zijn CC0; alleen een kit met gemengde herkomst zegt het zelf.
      licentieLabel: kit.licentieLabel ?? 'CC0',
    });
  }
  return meta;
}

/* -- varianten ------------------------------------------------------------
 * docs/asset_variants.json komt van tools/vind-varianten.mjs, dat op zijn beurt
 * deze catalogus leest. Twee stappen dus, en de tweede mag achterlopen: een
 * groep die naar een model verwijst dat er niet meer is wordt hier opgeschoond,
 * en blijft er één lid over dan is het geen groep meer.
 *
 * Wat de catalogus in de browser ermee doet: van elke groep één kaart tonen met
 * het aantal erbij, en de rest achter die kaart. Daarvoor is per model genoeg
 * te weten in welke groep hij zit; de leden staan in `varianten`.
 */
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
    // Het lid dat de groep op de kaart vertegenwoordigt. Staat dat model niet
    // (meer) in de catalogus, dan neemt het eerste overgebleven lid het over.
    const hoofd = leden.includes(cluster.hoofd) ? cluster.hoofd : leden[0];
    groepen.push({ id, soort: cluster.soort, hoofd, leden });
    for (const lid of leden) perModel.set(lid, id);
  });

  return { groepen, perModel };
}

/* -- kleuren --------------------------------------------------------------
 * Uit het model zelf, niet uit een lijst ernaast. Een model draagt zijn kleur
 * op één van twee manieren, en allebei staan ze in de .glb:
 *
 *   - met een colormap: het materiaal wijst naar Textures/colormap.png en de
 *     UV's prikken een punt in die atlas. De kleur is de pixel waar ze landen.
 *   - zonder: het materiaal draagt een baseColorFactor. Dat doet de
 *     onderwater-kit, die uit een pack komt zonder atlas.
 *
 * Zo kan de kleurfilter niet uit de pas lopen met de modellen: er ís geen
 * tweede administratie meer die bijgewerkt moet worden na een omkleuring.
 *
 * De atlas is een raster van 16 × 4 banen (KOLOMMEN × RIJEN in kleurmap.mjs);
 * binnen een baan loopt de kleur van licht naar donker, want de schaduw zit in
 * de textuur gebakken. Elke gebruikte pixel apart tonen zou honderden stalen
 * geven die je op het scherm niet uit elkaar houdt, dus één staal per baan: de
 * pixel die in de hele catalogus het meeste oppervlak beslaat.
 *
 * Oppervlak, niet hoekpunten: een fijn onderverdeeld hoekje zou anders zwaarder
 * wegen dan het grote vlak ernaast, en dan toont het staal een tint die je op
 * het model nauwelijks ziet.
 */

const atlassen = new Map(); // pad → { pixels, breedte, hoogte, sleutel }

function leesAtlas(pad) {
  if (!atlassen.has(pad)) {
    const png = leesPng(pad);
    // De sleutel is de inhoud, niet het pad: elke kit draagt zijn eigen kopie
    // van kits/colormap.png omdat de .glb er met een relatief pad naar wijst.
    // Byte voor byte dezelfde sheet is hetzelfde palet.
    const sleutel = createHash('sha256').update(readFileSync(pad)).digest('hex').slice(0, 12);
    atlassen.set(pad, { ...png, sleutel });
  }
  return atlassen.get(pad);
}

/** glTF bewaart baseColorFactor lineair; op het scherm staat sRGB. */
function naarSrgb(lineair) {
  const v = lineair <= 0.0031308 ? lineair * 12.92 : 1.055 * lineair ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(Math.max(v, 0), 1) * 255);
}

const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

/**
 * Wat een model aan kleur draagt: per primitive het materiaal opzoeken en
 * ofwel de atlas uitlezen, ofwel de materiaalkleur overnemen.
 *
 * @returns {{atlas: string|null, banen: Map<string, Map<string, number>>, materialen: Map<string, string>}}
 *   `banen` is 'kolom,rij' → hoe vaak welke pixel geraakt wordt; `materialen`
 *   is hex → materiaalnaam.
 */
function leesKleuren(glb, dir) {
  const { json } = glb;
  const banen = new Map();
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
      // Eén atlas per model; twee zou betekenen dat de helft van het model uit
      // een andere sheet komt, en dan zegt "de kleur van dit model" niets meer.
      if (atlasPad && atlasPad !== pad) throw new Error(`${dir}: meer dan één colormap in één model`);
      atlasPad = pad;

      const atlas = leesAtlas(pad);
      const celBreed = atlas.breedte / KOLOMMEN;
      const celHoog = atlas.hoogte / RIJEN;
      const uv = leesAccessor(glb, prim.attributes.TEXCOORD_0);
      const pos = prim.attributes.POSITION === undefined ? null : leesAccessor(glb, prim.attributes.POSITION);
      const idx = prim.indices === undefined ? null : leesAccessor(glb, prim.indices);

      /** De pixel waar hoekpunt `i` op landt, of null op lege atlasruimte. */
      const pixelVan = (i) => {
        const x = Math.min(Math.max(Math.floor(uv.data[i * 2] * atlas.breedte), 0), atlas.breedte - 1);
        const y = Math.min(Math.max(Math.floor(uv.data[i * 2 + 1] * atlas.hoogte), 0), atlas.hoogte - 1);
        const i4 = (y * atlas.breedte + x) * 4;
        // Zwart is in deze atlassen geen kleur maar lege ruimte. Een UV die
        // daar landt kleurt niets zichtbaars en levert dus geen staal op.
        if (atlas.pixels[i4] === 0 && atlas.pixels[i4 + 1] === 0 && atlas.pixels[i4 + 2] === 0) return null;
        return {
          baan: `${Math.floor(x / celBreed)},${Math.floor(y / celHoog)}`,
          kleur: hex(atlas.pixels[i4], atlas.pixels[i4 + 1], atlas.pixels[i4 + 2]),
        };
      };

      const tel = (i, gewicht) => {
        const punt = pixelVan(i);
        if (!punt) return;
        if (!banen.has(punt.baan)) banen.set(punt.baan, new Map());
        const pixels = banen.get(punt.baan);
        pixels.set(punt.kleur, (pixels.get(punt.kleur) ?? 0) + gewicht);
      };

      // Zonder posities valt er geen oppervlak te meten; dan telt elk hoekpunt
      // even zwaar. Dat komt in deze kits niet voor, maar een model zonder
      // kleur is erger dan een model met een grover gewogen staal.
      if (!pos) {
        for (let i = 0; i < uv.count; i++) tel(i, 1);
        continue;
      }

      const hoek = (n) => (idx ? idx.data[n] : n);
      const punten = idx ? idx.count : uv.count;
      for (let n = 0; n + 2 < punten; n += 3) {
        const [a, b, c] = [hoek(n), hoek(n + 1), hoek(n + 2)];
        // Halve lengte van het kruisproduct: de oppervlakte van de driehoek.
        const u1 = [0, 1, 2].map((k) => pos.data[b * 3 + k] - pos.data[a * 3 + k]);
        const u2 = [0, 1, 2].map((k) => pos.data[c * 3 + k] - pos.data[a * 3 + k]);
        const kruis = [
          u1[1] * u2[2] - u1[2] * u2[1],
          u1[2] * u2[0] - u1[0] * u2[2],
          u1[0] * u2[1] - u1[1] * u2[0],
        ];
        const oppervlak = Math.hypot(...kruis) / 2;
        if (!(oppervlak > 0)) continue;
        for (const punt of [a, b, c]) tel(punt, oppervlak / 3);
      }
    }
  }

  return { atlas: atlasPad, banen, materialen };
}

/**
 * Grove Nederlandse benaming van een hex-kleur, zodat de filterknoppen iets
 * zeggen. Bewust ruw: het gaat om herkenning, niet om precisie.
 */
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

/* -- .glb uitlezen --------------------------------------------------------
 * Container, afmetingen, driehoeken en tekenopdrachten komen uit tools/glb.mjs;
 * dat rekent ook de skinning mee, wat voor de geanimeerde onderwater-kit nodig
 * is. tools/importeer-onderwater.mjs gebruikt dezelfde module, zodat een model
 * op dezelfde manier wordt opgemeten als het wordt ingeladen.
 */

/* -- versiestempel --------------------------------------------------------
 * GitHub Pages serveert met `cache-control: max-age=600`. Zonder versie in de
 * URL kijk je na een deploy dus tot tien minuten naar oude CSS of JS, of erger:
 * naar nieuwe HTML met oude JS. De hash hangt aan de inhoud, dus hij verandert
 * precies wanneer er iets verandert.
 */
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

/* -- catalogus opbouwen --------------------------------------------------- */

const kitMeta = leesKitMetadata();
/* "buitenCatalogus" in manifest.js houdt modellen uit de catalogus zonder ze
 * weg te gooien: `true` voor een hele kit, of een lijst modelnamen voor een
 * deel ervan. De bestanden blijven waar ze zijn — geen modellen, geen groepen,
 * geen kleuren — en het weghalen van die regel zet ze weer terug. */
const kitSlugs = readdirSync(KITS_DIR)
  .filter((naam) => statSync(join(KITS_DIR, naam)).isDirectory())
  .filter((naam) => !kitMeta.get(naam)?.buitenCatalogus)
  .sort();

const kits = [];
const modellen = [];
const perModelKleur = new Map(); // 'kit/model' → { atlas, banen, materialen, paletSleutel }
const zonderMetadata = [];
const zonderGroep = [];
const zonderKleur = [];

for (const slug of kitSlugs) {
  const dir = join(KITS_DIR, slug);
  const meta = kitMeta.get(slug);
  if (!meta) zonderMetadata.push(slug);

  const bestanden = readdirSync(dir)
    .filter((n) => n.endsWith('.glb'))
    .filter((n) => !meta?.buitenCatalogusModellen.has(n.replace(/\.glb$/, '')))
    .sort();
  if (bestanden.length === 0) continue;

  for (const bestand of bestanden) {
    const naam = bestand.replace(/\.glb$/, '');
    const pad = `kits/${slug}/${bestand}`;
    const glb = leesGlb(join(dir, bestand));
    const gltf = glb.json;
    const scene = meetScene(glb);
    const groep = bepaalGroep(slug, naam);
    if (groep === 'overig') zonderGroep.push(`${slug}/${naam}`);

    const gelezen = leesKleuren(glb, dir);
    if (gelezen.banen.size === 0 && gelezen.materialen.size === 0) zonderKleur.push(`${slug}/${naam}`);
    /* Welke atlas een model gebruikt bepaalt in welk palet het valt: dezelfde
     * hex uit twee sheets is niet dezelfde kleur en dus niet dezelfde
     * filterknop. Een model zonder atlas draagt materiaalkleuren, en die
     * staan op zichzelf per kit. */
    const paletSleutel = gelezen.atlas ? leesAtlas(gelezen.atlas).sleutel : `materiaal:${slug}`;
    perModelKleur.set(`${slug}/${naam}`, { ...gelezen, paletSleutel });

    modellen.push({
      id: `${slug}/${naam}`,
      naam,
      kit: slug,
      groep,
      // Palet en kleuren worden hieronder ingevuld, zodra van alle modellen
      // bekend is welke pixel per baan het vaakst geraakt wordt.
      palet: null,
      kleuren: [],
      pad,
      bytes: statSync(join(dir, bestand)).size,
      driehoeken: scene.driehoeken,
      // Dezelfde telling gedeeld door het volume van de bounding box, zodat een
      // groot model niet vanzelf "zwaar" heet. De stijlgids (§4) legt de grens
      // op 1000; een plat model heeft geen volume en dus geen getal.
      driehoekenPerUnit: driehoekenPerUnit(scene.driehoeken, scene.wdh),
      materialen: (gltf.materials ?? []).length,
      // Breedte × diepte × hoogte in rastereenheden (1 = één wand-/vloersegment).
      wdh: scene.wdh,
      calls: scene.calls,
      // Alleen bij modellen die animaties dragen; dat is nu de onderwater-kit.
      // De namen zijn die van de pack zelf — je hebt ze nodig om een clip af te
      // spelen, dus ze staan er zoals ze in het bestand staan.
      ...((gltf.animations ?? []).length
        ? { animaties: gltf.animations.map((a, i) => a.name ?? `animatie ${i}`) }
        : {}),
    });
  }

  kits.push({
    slug,
    naam: meta?.naam ?? slug,
    // "Fantasy Town Kit" → "Fantasy Town": in de filterbalk is dat achtervoegsel ruis.
    kort: (meta?.naam ?? slug).replace(/\s+Kit$/, ''),
    url: meta?.url ?? null,
    licentie: `kits/${slug}/LICENSE.txt`,
    licentieLabel: meta?.licentieLabel ?? 'CC0',
    aantal: bestanden.length,
    // Een kit met een eigen tabblad staat buiten de kit- en groepsweergave;
    // zonder tabblad zou hij nergens meer te zien zijn.
    tabblad: meta?.tabblad ?? null,
    eigenPalet: meta?.eigenPalet ?? false,
    // De groep waar de kit als geheel in valt (KIT_GROEPEN in semantiek.mjs).
    // De catalogus in de browser heeft hem nodig om te weten wélke modellen van
    // een kit met een eigen tabblad daar thuishoren: die in deze groep. Een
    // model dat bij uitzondering ergens anders is ingedeeld — de vloerlagen en
    // de ladder van de grot staan bij de bouwwerken — hoort in die groep te
    // staan, ook al heeft zijn kit een eigen tabblad.
    kitGroep: KIT_GROEPEN[slug] ?? null,
    toelichting: meta?.toelichting ?? null,
    // Wordt hieronder ingevuld, samen met de kleuren van de modellen.
    palet: null,
  });
}

const varianten = leesVarianten(new Set(modellen.map((m) => m.id)));
for (const model of modellen) {
  const groep = varianten.perModel.get(model.id);
  if (groep) model.variant = groep;
}

/* -- kleuren samenvatten ---------------------------------------------------
 * Per palet: welke banen van welke atlas gebruikt worden, en welke pixel in
 * zo'n baan het vaakst geraakt wordt. Die pixel wordt het staal in de
 * filterbalk — één knop per baan, met de kleur die de modellen er echt uit
 * halen.
 *
 * Modellen zonder atlas dragen hun kleur per materiaal; daar is elke kleur al
 * één waarde en valt er niets samen te vatten.
 */

const paletten = new Map(); // sleutel → palet in opbouw

for (const model of modellen) {
  const gelezen = perModelKleur.get(model.id);
  if (!gelezen || (gelezen.banen.size === 0 && gelezen.materialen.size === 0)) continue;

  if (!paletten.has(gelezen.paletSleutel)) {
    paletten.set(gelezen.paletSleutel, {
      atlas: gelezen.atlas,
      kits: new Set(),
      banen: new Map(), // 'kolom,rij' → Map(hex → hoe vaak geraakt)
      materialen: new Map(), // hex → Set(materiaalnaam)
    });
  }
  const palet = paletten.get(gelezen.paletSleutel);
  palet.kits.add(model.kit);

  for (const [baan, pixels] of gelezen.banen) {
    if (!palet.banen.has(baan)) palet.banen.set(baan, new Map());
    const totaal = palet.banen.get(baan);
    for (const [hex, aantal] of pixels) totaal.set(hex, (totaal.get(hex) ?? 0) + aantal);
  }
  for (const [hex, naam] of gelezen.materialen) {
    if (!palet.materialen.has(hex)) palet.materialen.set(hex, new Set());
    palet.materialen.get(hex).add(naam);
  }
}

/* De canonieke gedeelde sheet: elke kit draagt er een kopie van, maar in de
 * catalogus wijst het palet naar het origineel. */
const GEDEELDE_ATLAS = join(KITS_DIR, 'colormap.png');
const gedeeldeSleutel = existsSync(GEDEELDE_ATLAS) ? leesAtlas(GEDEELDE_ATLAS).sleutel : null;

for (const [sleutel, palet] of paletten) {
  // Welke kleur een baan op de filterbalk krijgt: de pixel waar de meeste
  // hoekpunten op landen. Bij gelijkspel de donkerste, zodat de keuze niet van
  // de leesvolgorde afhangt.
  palet.baanKleur = new Map();
  for (const [baan, pixels] of palet.banen) {
    const [hex] = [...pixels].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    palet.baanKleur.set(baan, hex);
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

/* Nu pas kunnen de modellen hun kleuren krijgen: een baan is één staal, en
 * welke kleur dat staal heeft weet je pas als alle modellen geteld zijn. */
for (const model of modellen) {
  const gelezen = perModelKleur.get(model.id);
  const palet = paletten.get(gelezen?.paletSleutel);
  if (!palet) continue;
  model.palet = palet.id;
  model.kleuren = [
    ...new Set([
      ...[...gelezen.banen.keys()].map((baan) => palet.baanKleur.get(baan)),
      ...gelezen.materialen.keys(),
    ]),
  ].sort();
}

for (const kit of kits) {
  kit.palet = modellen.find((m) => m.kit === kit.slug && m.palet)?.palet ?? null;
}

/* Hoeveel modellen elk staal draagt — dat getal staat op de filterknop. */
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
  // Zodat de catalogus in de browser de grens niet nog eens hoeft te kennen.
  budgetPerUnit: BUDGET_PER_UNIT,
  kits,
  varianten: varianten.groepen,
  groepen: GROEPEN.map(({ beschrijving, ...g }) => ({
    ...g,
    aantal: modellen.filter((m) => m.groep === g.id).length,
  })),
  // Meest gedragen kleur eerst, zodat de filterbalk een herkenbare volgorde
  // houdt. Een palet komt hier alleen in voor zover modellen in de catalogus
  // eruit putten: waar niets uit staat, staat ook geen knop.
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
          // Waar de kleur vandaan komt: de baan in de atlas, of het materiaal
          // dat hem draagt. Staat in de tooltip van de filterknop.
          textuur: p.atlas
            ? 'baan ' + [...p.baanKleur].filter(([, k]) => k === hex).map(([baan]) => baan).join(' / ')
            : null,
          materiaal: p.atlas ? null : [...(p.materialen.get(hex) ?? [])].sort().join(' / ') || null,
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

/* Elke kit hoort in precies één palet; anders is de atlasscheiding lek. */
const paletPerKit = new Map();
for (const model of modellen) {
  if (!paletPerKit.has(model.kit)) paletPerKit.set(model.kit, new Set());
  if (model.palet) paletPerKit.get(model.kit).add(model.palet);
}
for (const [kit, gebruikt] of paletPerKit) {
  if (gebruikt.size > 1) console.warn(`! ${kit} put uit meer dan één palet: ${[...gebruikt].join(', ')}`);
}
/**
 * Een kit die als enige uit zijn palet put, staat op zichzelf en valt daarmee
 * buiten zowel de kit- als de groepsweergave. Zonder tabblad in manifest.js is
 * hij dan nergens meer te zien — een lege plek die je pas in de browser opmerkt.
 */
const kitsPerPalet = new Map();
for (const kit of kits) {
  if (kit.palet) kitsPerPalet.set(kit.palet, (kitsPerPalet.get(kit.palet) ?? 0) + 1);
}
for (const kit of kits) {
  // "eigenPalet" in manifest.js zegt: we weten het, het is zo bedoeld. Zonder
  // die bevestiging is een kit met een palet dat hij met niemand deelt en zonder
  // eigen tabblad een ongeluk — zijn kleuren mengen niet met de kits waar hij
  // tussen komt te staan.
  if (kit.palet && kitsPerPalet.get(kit.palet) === 1 && !kit.tabblad && !kit.eigenPalet) {
    console.warn(`! ${kit.slug} heeft een eigen palet maar geen "tabblad" in manifest.js`);
  }
}

/* Boven het budget is geen harde fout: de kits zijn ingekocht zoals ze zijn, en
 * een model dat erboven zit is een kandidaat om te vereenvoudigen, geen
 * bouwstop. De build noemt ze bij naam zodat de lijst niet stilletjes groeit. */
const bovenBudget = modellen
  .filter((m) => m.driehoekenPerUnit !== null && m.driehoekenPerUnit > BUDGET_PER_UNIT)
  .sort((a, b) => b.driehoekenPerUnit - a.driehoekenPerUnit);
const ERGSTE = 25; // de hele lijst is te lang om elke build af te drukken
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
