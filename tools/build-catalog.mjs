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
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { GROEPEN, KIT_GROEPEN, bepaalGroep } from './semantiek.mjs';
import { leesGlb, meetScene, driehoekenPerUnit, BUDGET_PER_UNIT } from './glb.mjs';

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
    groepen.push({ id, soort: cluster.soort, leden });
    for (const lid of leden) perModel.set(lid, id);
  });

  return { groepen, perModel };
}

/* -- kleuren --------------------------------------------------------------
 * kits/palet.json beschrijft per palet, per cel van de bijbehorende colormap,
 * welke modellen die kleur gebruiken. We draaien dat om naar model → kleuren,
 * zodat je in de catalogus op kleur kunt filteren.
 *
 * Er zijn twee paletten, want er zijn twee atlassen: de zes kits die de
 * gedeelde kits/colormap.png gebruiken, en de grot met zijn eigen sheet. Een
 * model hoort bij precies één palet; dezelfde hex in beide paletten is dus
 * niet dezelfde filterknop.
 */
function leesPalet() {
  const bestand = JSON.parse(readFileSync(join(KITS_DIR, 'palet.json'), 'utf8'));
  const perModel = new Map(); // 'kit/model' → { palet, hexen: Set(hex) }
  const paletten = [];

  for (const palet of bestand.paletten ?? []) {
    const cellen = new Map(); // hex → { hex, naam, textuur, aantal }

    for (const cel of palet.cellen ?? []) {
      const hex = String(cel.kleur).toLowerCase();
      if (!cellen.has(hex)) {
        // `textuur` bij een atlascel, `materiaal` bij een kit zonder atlas:
        // allebei het antwoord op "waar komt deze kleur vandaan?".
        cellen.set(hex, {
          hex,
          naam: kleurNaam(hex),
          textuur: cel.textuur ?? null,
          materiaal: cel.materiaal ?? null,
          aantal: 0,
        });
      }
      for (const bron of cel.bronnen ?? []) {
        for (const model of bron.modellen ?? []) {
          const sleutel = `${bron.kit}/${model}`;
          const bestaand = perModel.get(sleutel);
          if (!bestaand) {
            perModel.set(sleutel, { palet: palet.id, hexen: new Set([hex]) });
          } else if (bestaand.palet !== palet.id) {
            // De scheiding is het hele punt: één model mag niet uit twee
            // atlassen tegelijk komen, anders zegt het kleurfilter niets meer.
            throw new Error(
              `${sleutel} staat zowel in palet '${bestaand.palet}' als in '${palet.id}'`,
            );
          } else {
            bestaand.hexen.add(hex);
          }
        }
      }
    }

    paletten.push({
      id: palet.id,
      naam: palet.naam,
      atlas: palet.atlas ?? null,
      toelichting: palet.toelichting ?? null,
      drempel: palet.drempel ?? bestand.drempel ?? SAMENVOEG_ONDER,
      cellen,
    });
  }

  return { perModel, paletten };
}

/**
 * Cellen die aan minder dan zoveel modellen hangen, gaan op in de
 * dichtstbijzijnde kleur die wél blijft. Een staal voor één model levert een
 * filterknop op die niets filtert; de kleuren liggen bovendien zo dicht bij
 * elkaar dat het onderscheid op het scherm toch niet te zien is.
 *
 * Dit is de standaard; palet.json mag hem overschrijven met `drempel`, en een
 * palet mag dat op zijn beurt weer per palet doen. Dat is nodig omdat de
 * aanname erachter — veel modellen per cel, cellen die op elkaar lijken —
 * alleen voor een colormap-atlas opgaat. De onderwater-kit heeft geen atlas
 * maar een eigen materiaalkleur per soort: daar hángt bijna elke kleur aan één
 * model, en juist díe kleur is waar je op zoekt. Met de standaarddrempel viel
 * het groen van de schildpad samen met het grijs van de rotsen (afstand 90) en
 * het bruin van de zeehond ook (78) — knoppen die dan iets anders filteren dan
 * ze laten zien.
 */
const SAMENVOEG_ONDER = 4;

/**
 * ...maar alleen als de buur ook echt dichtbij ligt. In het gedeelde palet
 * gebeurt het samenvoegen over afstanden tot ~90; het grot-palet is zo klein
 * dat de dichtstbijzijnde buur van het staalblauw van `gate-metal-bars` een
 * bruine rotskleur is (afstand ~200). Zo'n staal samenvoegen liegt over wat
 * je ziet, dus die blijft staan.
 */
const SAMENVOEG_AFSTAND = 120;

const hexNaarRgb = (hex) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/**
 * Afstand tussen twee kleuren volgens de "redmean"-benadering: goedkoper dan
 * een Lab-conversie en dicht genoeg bij wat het oog doet om de juiste buur te
 * kiezen.
 */
function kleurAfstand(a, b) {
  const [r1, g1, b1] = hexNaarRgb(a);
  const [r2, g2, b2] = hexNaarRgb(b);
  const rGemiddeld = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(
    (2 + rGemiddeld / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rGemiddeld) / 256) * db * db,
  );
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
const palet = leesPalet();
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

    const uitPalet = palet.perModel.get(`${slug}/${naam}`);
    const kleuren = [...(uitPalet?.hexen ?? [])].sort();
    if (kleuren.length === 0) zonderKleur.push(`${slug}/${naam}`);

    modellen.push({
      id: `${slug}/${naam}`,
      naam,
      kit: slug,
      groep,
      // Het palet hoort bij de kleuren: dezelfde hex uit een ander palet is
      // een andere atlas en dus een andere filterknop.
      palet: uitPalet?.palet ?? null,
      kleuren,
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
    // De groep waar de kit als geheel in valt (KIT_GROEPEN in semantiek.mjs).
    // De catalogus in de browser heeft hem nodig om te weten wélke modellen van
    // een kit met een eigen tabblad daar thuishoren: die in deze groep. Een
    // model dat bij uitzondering ergens anders is ingedeeld — de vloerlagen en
    // de ladder van de grot staan bij de bouwwerken — hoort in die groep te
    // staan, ook al heeft zijn kit een eigen tabblad.
    kitGroep: KIT_GROEPEN[slug] ?? null,
    toelichting: meta?.toelichting ?? null,
    // Eén palet per kit; leesPalet() bewaakt dat een model er maar één heeft.
    // Welke atlas daarbij hoort staat in het palet zelf, niet hier: elke kit
    // heeft weliswaar een eigen Textures/colormap.png, maar bij de zes kits
    // die het gedeelde palet gebruiken is dat een kopie van dezelfde sheet.
    palet: modellen.find((m) => m.kit === slug && m.palet)?.palet ?? null,
  });
}

const varianten = leesVarianten(new Set(modellen.map((m) => m.id)));
for (const model of modellen) {
  const groep = varianten.perModel.get(model.id);
  if (groep) model.variant = groep;
}

/* -- zeldzame kleuren samenvoegen -----------------------------------------
 * Per palet, want een kleur uit de gedeelde atlas en een kleur uit de
 * grot-atlas zijn losse stalen; die mogen nooit in elkaar opgaan.
 */

const tel = () => {
  for (const p of palet.paletten) for (const cel of p.cellen.values()) cel.aantal = 0;
  for (const model of modellen) {
    if (model.kleuren.length === 0) continue;
    const cellen = palet.paletten.find((p) => p.id === model.palet)?.cellen;
    // Kleuren zonder palet kunnen niet bestaan — ze komen uit hetzelfde
    // palet.json-record — maar als dat ooit scheefloopt is een duidelijke
    // fout beter dan een TypeError diep in de telling.
    if (!cellen) throw new Error(`${model.id} heeft kleuren maar geen bekend palet (${model.palet})`);
    for (const hex of model.kleuren) cellen.get(hex).aantal++;
  }
};

tel();

const samenvoegingen = []; // [paletId, oude hex, nieuwe hex]

for (const p of palet.paletten) {
  const blijft = [...p.cellen.values()].filter((c) => c.aantal >= p.drempel);
  const perPalet = new Map();

  for (const cel of p.cellen.values()) {
    if (cel.aantal === 0 || cel.aantal >= p.drempel || blijft.length === 0) continue;
    const doel = blijft.reduce((beste, kandidaat) =>
      kleurAfstand(cel.hex, kandidaat.hex) < kleurAfstand(cel.hex, beste.hex) ? kandidaat : beste,
    );
    if (kleurAfstand(cel.hex, doel.hex) > SAMENVOEG_AFSTAND) continue;
    perPalet.set(cel.hex, doel.hex);
    samenvoegingen.push([p.id, cel.hex, doel.hex]);
  }

  if (perPalet.size > 0) {
    for (const model of modellen) {
      if (model.palet !== p.id) continue;
      model.kleuren = [...new Set(model.kleuren.map((hex) => perPalet.get(hex) ?? hex))].sort();
    }
  }
}

if (samenvoegingen.length > 0) tel();

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
  // Alleen cellen die daadwerkelijk aan een bestaand model hangen; op donkerste
  // eerst, zodat de filterbalk een herkenbare volgorde houdt. Een palet
  // waarvan geen enkel model meer in de catalogus staat — zoals dat van een
  // kit met "buitenCatalogus" — valt in zijn geheel weg.
  paletten: palet.paletten
    .map((p) => ({
      id: p.id,
      naam: p.naam,
      atlas: p.atlas,
      toelichting: p.toelichting,
      kleuren: [...p.cellen.values()]
        .filter((k) => k.aantal > 0)
        .sort((a, b) => b.aantal - a.aantal || a.hex.localeCompare(b.hex)),
    }))
    .filter((p) => p.kleuren.length > 0),
  modellen,
};

writeFileSync(join(ROOT, 'kits', 'catalog.json'), JSON.stringify(catalogus, null, 1) + '\n');
schrijfVersie();

console.log(`${modellen.length} modellen in ${kits.length} kits → kits/catalog.json`);
for (const g of catalogus.groepen) {
  console.log(`  ${String(g.aantal).padStart(3)}  ${g.naam}`);
}
for (const [paletId, oud, nieuw] of samenvoegingen) {
  const doel = palet.paletten.find((p) => p.id === paletId).cellen.get(nieuw);
  console.log(`samengevoegd in ${paletId}: ${oud} → ${nieuw} (${doel.naam})`);
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
  if (kit.palet && kitsPerPalet.get(kit.palet) === 1 && !kit.tabblad) {
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
  console.warn(`! ${zonderKleur.length} modellen zonder kleur in palet.json (kleurfilter slaat ze over)`);
}
