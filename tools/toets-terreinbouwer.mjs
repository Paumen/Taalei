/**
 * Toetst de terreinbouwer.
 *
 * Draaien vanuit de repo-root:
 *
 *     NODE_PATH=$(npm root -g) node tools/toets-terreinbouwer.mjs
 *
 * Twee delen. Eerst de regels zelf, in Node: aansluiting.js heeft met opzet
 * geen DOM nodig, dus die is hier gewoon te importeren. Daarna de pagina in een
 * echte browser, want three.js en de GLTFLoader zijn in Node niet na te doen.
 *
 * De gevallen hieronder zijn met de hand aan de geometrie nagerekend (zie de
 * kop van tools/aansluitingen.mjs). Ze staan er niet om te bevestigen wat de
 * code doet, maar om te merken wanneer een meting stilletjes verschuift: een
 * andere afronding, een andere snijtolerantie, en de grasvloer op 0,1 valt weer
 * samen met de zandvloer op 0.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Kit, Bouwsel, controleer, watPast, draaiVak, ontdraaiVak, naden, naadSleutel, vormSleutel,
} from './terreinbouwer/aansluiting.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const kit = new Kit(JSON.parse(readFileSync(join(ROOT, 'kits/modulair-terrein/aansluitingen.json'), 'utf8')));

let mislukt = 0;
function toets(naam, voorwaarde, toelichting = '') {
  const goed = voorwaarde === true;
  if (!goed) mislukt++;
  console.log(`${goed ? 'ok  ' : 'FOUT'}  ${naam}${goed || !toelichting ? '' : ` — ${toelichting}`}`);
}

/** Een bouwsel uit een lijstje, kort opgeschreven. */
function bouw(stukken) {
  const bouwsel = new Bouwsel(kit);
  for (const stuk of stukken) bouwsel.zet(stuk);
  return bouwsel;
}

const soorten = (meldingen) => [...new Set(meldingen.map((m) => m.soort))].sort().join(',');

/* -- draaien --------------------------------------------------------------- */

console.log('\n— draaien —');

let heenEnWeer = true;
for (let slagen = 0; slagen < 4; slagen++) {
  for (const vak of [[0, 0], [1, 0], [0, 1], [2, -3], [-1, 2]]) {
    const terug = ontdraaiVak(draaiVak(vak, slagen), slagen);
    if (terug[0] !== vak[0] || terug[1] !== vak[1]) heenEnWeer = false;
  }
}
toets('draaien en terugdraaien komt uit op hetzelfde vak', heenEnWeer);
toets('een kwartslag stuurt (1,0) naar (0,-1)', JSON.stringify(draaiVak([1, 0], 1)) === '[0,-1]');
toets('vier kwartslagen is niets', JSON.stringify(draaiVak([2, -3], 4)) === '[2,-3]');

/* Een gedraaid stuk moet zijn profiel meenemen: de oostzijde van een ongedraaid
 * stuk is de noordzijde van datzelfde stuk na één kwartslag. */
const kliffMid = 'cliff-terrain-side-mid';
toets(
  'na een kwartslag is oost noord geworden',
  kit.randVan(kliffMid, '0,0', 'n', 1) === kit.randVan(kliffMid, '0,0', 'o', 0),
);

/* -- naden ----------------------------------------------------------------- */

console.log('\n— naden —');

toets(
  'drie grasvloeren naast elkaar sluiten aan',
  controleer(bouw([
    { naam: 'hilly-terrain-grass-floor', x: 0, z: 0, laag: 0 },
    { naam: 'hilly-terrain-grass-floor', x: 1, z: 0, laag: 0 },
    { naam: 'hilly-terrain-grass-floor', x: 2, z: 0, laag: 0 },
  ])).length === 0,
);

/* Gras ligt op 0,1 en zand op 0. Dat verschil van een tiende unit is precies
 * wat een naadcontrole moet zien; een eerdere versie van aansluitingen.mjs
 * verloor de hoogte van een horizontale rand en noemde deze twee gelijk. */
const grasNaastZand = controleer(bouw([
  { naam: 'hilly-terrain-grass-floor', x: 0, z: 0, laag: 0 },
  { naam: 'beach-terrain-sand-floor', x: 1, z: 0, laag: 0 },
]));
toets('gras (0,1) naast zand (0) geeft een naadmelding', soorten(grasNaastZand) === 'naad', soorten(grasNaastZand));

/* Klif en steilrand heten allebei "side-mid" en zijn allebei een halve laag
 * hoog, maar de klif knikt naar voren en de steilrand niet. Dat verschil zit in
 * de voorzijde, niet in de zijkanten waarmee ze aan hun buren vastzitten —
 * dus dít is wat er getoetst kan worden, en niet meer dan dat. */
toets(
  'klif-mid en steilrand-mid hebben een verschillende voorzijde',
  kit.randVan('cliff-terrain-side-mid', '0,0', 'w', 0)
    !== kit.randVan('escarpment-terrain-side-mid', '0,0', 'w', 0),
);
toets(
  'maar dezelfde zijkant, dus in één wand meldt de naadcontrole niets',
  controleer(bouw([
    { naam: 'cliff-terrain-side-mid', x: 0, z: 0, laag: 0 },
    { naam: 'escarpment-terrain-side-mid', x: 0, z: 1, laag: 0 },
  ])).length === 0,
);

/* Een -base en een -mid náást elkaar in dezelfde wand is wél een echte naadfout:
 * de base loopt schuin op van 0 naar 0,5 en de mid staat recht. */
const baseNaastMid = controleer(bouw([
  { naam: 'cliff-terrain-side-base', x: 0, z: 0, laag: 0 },
  { naam: 'cliff-terrain-side-mid', x: 0, z: 1, laag: 0 },
]));
toets(
  'een -base naast een -mid in dezelfde wand geeft een naadmelding',
  soorten(baseNaastMid) === 'naad', soorten(baseNaastMid),
);

toets(
  'twee klif-mids in één wand sluiten aan',
  controleer(bouw([
    { naam: 'cliff-terrain-side-mid', x: 0, z: 0, laag: 0 },
    { naam: 'cliff-terrain-side-mid', x: 0, z: 1, laag: 0 },
  ])).length === 0,
);

/* Dezelfde wand, een kwartslag gedraaid: nu loopt hij over x in plaats van
 * over z. Sluit hij dan nog steeds, dan klopt de draailogica én de afspraak dat
 * een profiel van links naar rechts van buitenaf wordt gelezen. */
toets(
  'twee klif-mids sluiten ook aan na een kwartslag',
  controleer(bouw([
    { naam: 'cliff-terrain-side-mid', x: 0, z: 0, laag: 0, slagen: 1 },
    { naam: 'cliff-terrain-side-mid', x: 1, z: 0, laag: 0, slagen: 1 },
  ])).length === 0,
);

/* -- stapelen -------------------------------------------------------------- */

console.log('\n— stapelen —');

toets(
  'base, mid en top op elkaar sluiten aan',
  controleer(bouw([
    { naam: 'cliff-terrain-side-base', x: 0, z: 0, laag: 0 },
    { naam: 'cliff-terrain-side-mid', x: 0, z: 0, laag: 1 },
    { naam: 'cliff-terrain-side-top', x: 0, z: 0, laag: 2 },
  ])).length === 0,
);

const zwevend = controleer(bouw([{ naam: 'cliff-terrain-side-mid', x: 0, z: 0, laag: 2 }]));
toets('een klif-mid zonder onderbouw zweeft', zwevend.some((m) => m.soort === 'zwevend' && m.ernst === 'fout'));

toets(
  'een dekvlak zonder onderbouw zweeft niet',
  controleer(bouw([{ naam: 'hilly-terrain-grass-floor', x: 0, z: 0, laag: 3 }]))
    .every((m) => m.soort !== 'zwevend'),
);

const omgekeerd = controleer(bouw([
  { naam: 'cliff-terrain-side-mid', x: 0, z: 0, laag: 0 },
  { naam: 'cliff-terrain-side-base', x: 0, z: 0, laag: 1 },
]));
toets('een -base boven een -mid geeft een trapmelding', omgekeerd.some((m) => m.soort === 'trap'));

/* Samenvallende stukken zijn geen melding. Een kei op een tegel, een klifhoek
 * die zijn vak niet vult en een tegel in dat lege vak: dat is bouwen, geen
 * botsing. De bouwer meet en meldt; wat samen kan is een oordeel van wie bouwt.
 */
for (const [wat, stukken] of [
  ['twee terreintegels in één vak', [
    { naam: 'hilly-terrain-grass-floor', x: 0, z: 0, laag: 0 },
    { naam: 'beach-terrain-sand-floor', x: 0, z: 0, laag: 0 },
  ]],
  ['een kei op een grastegel', [
    { naam: 'hilly-terrain-grass-floor', x: 0, z: 0, laag: 0 },
    { naam: 'shared-prop-boulder-a', x: 0, z: 0, laag: 0 },
  ]],
  ['een tegel in het lege vak van een klifhoek', [
    { naam: 'cliff-terrain-corner-inner-3x3-mid', x: 0, z: 0, laag: 0 },
    { naam: 'hilly-terrain-grass-floor', x: 0, z: 0, laag: 0 },
  ]],
]) {
  toets(
    `${wat} levert geen botsingsmelding op`,
    controleer(bouw(stukken)).every((m) => m.soort === 'naad' || m.soort === 'trap'
      || m.soort === 'zwevend' || m.soort === 'stapel'),
  );
}

/* Eén uitzondering: precies hetzelfde stuk twee keer op precies dezelfde plek.
 * Dat dekt zichzelf af, dus je ziet het niet en je merkt het pas als je er één
 * weghaalt en er nog een staat. */
const dubbel = controleer(bouw([
  { naam: 'hilly-terrain-grass-floor', x: 0, z: 0, laag: 0 },
  { naam: 'hilly-terrain-grass-floor', x: 0, z: 0, laag: 0 },
]));
toets('hetzelfde stuk twee keer op dezelfde plek wordt wél gemeld',
  dubbel.some((m) => m.soort === 'dubbel'));
toets('en twee verschillende stukken op één plek niet',
  !controleer(bouw([
    { naam: 'hilly-terrain-grass-floor', x: 0, z: 0, laag: 0 },
    { naam: 'beach-terrain-sand-floor', x: 0, z: 0, laag: 0 },
  ])).some((m) => m.soort === 'dubbel'));

/* -- verkenner ------------------------------------------------------------- */

console.log('\n— verkenner —');

/* De belangrijkste eigenschap van watPast(): wat hij aanwijst moet er ook
 * echt tegenaan passen. Anders belooft de bouwer iets wat de controle daarna
 * afkeurt, en dan is hij erger dan geen bouwer.
 *
 * Voor elk stuk met een niet-lege noordrand: pak wat watPast() teruggeeft, zet
 * het in het buurvak en kijk of er een naadmelding komt.
 */
let voorstellen = 0;
let afgekeurd = [];
for (const model of kit.modellen.values()) {
  const lokaal = Object.keys(model.zijden.n)[0];
  const rand = kit.randVan(model.naam, lokaal, 'n', 0);
  if (kit.isOpen(rand)) continue;

  const [lu, lv] = lokaal.split(',').map(Number);
  for (const kandidaat of watPast(kit, rand, 'z').slice(0, 3)) {
    const [ku, kv] = kandidaat.lokaal.split(',').map(Number);
    const [du, dv] = draaiVak([ku, kv], kandidaat.slagen);
    const meldingen = controleer(bouw([
      { naam: model.naam, x: -lu, z: -lv, laag: 0 },
      { naam: kandidaat.naam, x: -du, z: -1 - dv, laag: 0, slagen: kandidaat.slagen },
    ]));
    voorstellen++;
    if (meldingen.some((m) => m.soort === 'naad')) {
      afgekeurd.push(`${model.naam}.n ← ${kandidaat.naam}@${kandidaat.slagen * 90}°`);
    }
  }
}
toets(
  `alle ${voorstellen} voorstellen van de verkenner sluiten ook echt aan`,
  afgekeurd.length === 0,
  afgekeurd.slice(0, 3).join('; '),
);

/* Andersom: wie geen spiegel heeft, krijgt geen voorstellen. */
const doodlopend = Object.entries(kit.randen).find(([, r]) => !r.spiegel);
toets(
  'een doodlopende rand levert geen voorstellen op',
  watPast(kit, doodlopend[0], 'z').length === 0,
);

/* -- combinaties ------------------------------------------------------------
 * naden() somt op wat er ís; controleer() meldt wat er mis is. Het gereedschap
 * draait om het eerste: pas als je alle voegen op een rij ziet kun je er iets
 * van vinden.
 */

console.log('\n— combinaties —');

const tweeGras = bouw([
  { naam: 'hilly-terrain-grass-floor', x: 0, z: 0, laag: 0 },
  { naam: 'hilly-terrain-grass-floor', x: 1, z: 0, laag: 0 },
]);
const naadLijst = naden(tweeGras);
toets('twee tegels naast elkaar geven één voeg', naadLijst.length === 1, `${naadLijst.length}`);
toets('en die voeg sluit aan', naadLijst[0]?.sluit === true);

/* Ook een voeg die níét sluit hoort in de lijst: je kunt alleen iets vinden van
 * wat je te zien krijgt, en juist de stappen zijn het bekijken waard. */
const grasZand = naden(bouw([
  { naam: 'hilly-terrain-grass-floor', x: 0, z: 0, laag: 0 },
  { naam: 'beach-terrain-sand-floor', x: 1, z: 0, laag: 0 },
]));
toets('een voeg die niet sluit staat er ook in', grasZand.length === 1 && grasZand[0].sluit === false);

/* Een wand van drie geeft twee voegen, en dus twee oordelen. Eerder werden die
 * op één regel gepropt omdat de randprofielen gelijk zijn; dan kun je de ene
 * niet goed en de andere niet afkeuren, en juist dat moet kunnen. */
const wand = naden(bouw([
  { naam: 'cliff-terrain-side-mid', x: 0, z: 0, laag: 0 },
  { naam: 'cliff-terrain-side-mid', x: 0, z: 1, laag: 0 },
  { naam: 'cliff-terrain-side-mid', x: 0, z: 2, laag: 0 },
]));
toets('drie stukken in een wand geven twee voegen', wand.length === 2, `${wand.length}`);
toets(
  'en twee losse oordelen, één per plek',
  new Set(wand.map((n) => n.sleutel)).size === 2,
  wand.map((n) => n.sleutel).join(' / '),
);
toets(
  'de sleutel zegt waar de voeg zit',
  wand.every((n) => n.sleutel.includes(`${n.plek.x},`) && n.sleutel.includes(`,${n.plek.laag},`)),
  wand.map((n) => n.sleutel).join(' / '),
);
toets(
  'en erbij wat er op die plek tegen elkaar aan staat',
  wand.every((n) => n.namen.every((naam) => n.sleutel.includes(naam))),
  wand[0]?.sleutel,
);

/* De plek alleen was niet genoeg, en dat kostte een ronde: twee bouwsels staan
 * allebei op vak (0,0). Wie de klifwand had beoordeeld kreeg de steilrand als
 * "al beoordeeld" voorgeschoteld — dertien oordelen over stukken die er nooit
 * aan te pas waren gekomen. */
const zelfdePlek = naden(bouw([
  { naam: 'escarpment-terrain-side-mid', x: 0, z: 0, laag: 0 },
  { naam: 'escarpment-terrain-side-mid', x: 0, z: 1, laag: 0 },
  { naam: 'escarpment-terrain-side-mid', x: 0, z: 2, laag: 0 },
]));
toets(
  'een ánder bouwsel op dezelfde vakken deelt geen enkel oordeel',
  zelfdePlek.every((n) => !wand.some((w) => w.sleutel === n.sleutel)),
  `${wand[0]?.sleutel} vs ${zelfdePlek[0]?.sleutel}`,
);

/* En de voeg zelf mag niet van twee kanten twee sleutels krijgen: wie de
 * stukken in de omgekeerde volgorde neerzet, beoordeelt dezelfde voeg. */
const andersom = naden(bouw([
  { naam: 'cliff-terrain-side-mid', x: 0, z: 2, laag: 0 },
  { naam: 'cliff-terrain-side-mid', x: 0, z: 1, laag: 0 },
  { naam: 'cliff-terrain-side-mid', x: 0, z: 0, laag: 0 },
]));
toets(
  'in omgekeerde bouwvolgorde zijn het dezelfde voegen',
  new Set([...wand, ...andersom].map((n) => n.sleutel)).size === 2,
  [...new Set([...wand, ...andersom].map((n) => n.sleutel))].join(' / '),
);

/* De vorm is wél gedeeld — dat is hoe je achteraf ziet dat dezelfde twee
 * stukken op de ene plek goed vielen en op de andere niet. */
toets(
  'maar de vorm is bij beide dezelfde',
  new Set(wand.map((n) => n.vorm)).size === 1,
  wand[0]?.vorm,
);

/* Klif-mid en steilrand-mid delen hun randprofielen (r055/r056). Op profiel
 * bewaren gooide ze op één hoop; op vorm blijven het twee dingen. */
const klifMid = naden(bouw([
  { naam: 'cliff-terrain-side-mid', x: 0, z: 0, laag: 0 },
  { naam: 'cliff-terrain-side-mid', x: 0, z: 1, laag: 0 },
]))[0];
const steilMid = naden(bouw([
  { naam: 'escarpment-terrain-side-mid', x: 0, z: 0, laag: 0 },
  { naam: 'escarpment-terrain-side-mid', x: 0, z: 1, laag: 0 },
]))[0];
toets(
  'klif en steilrand delen hun randprofielen',
  JSON.stringify(klifMid.randen) === JSON.stringify(steilMid.randen),
  `${klifMid.randen} vs ${steilMid.randen}`,
);
toets(
  'maar hun vorm verschilt, dus ze zijn apart te beoordelen',
  klifMid.vorm !== steilMid.vorm,
  `${klifMid.vorm} vs ${steilMid.vorm}`,
);
toets(
  'en hun sleutel ook, al liggen ze op hetzelfde vak',
  klifMid.sleutel !== steilMid.sleutel,
  `${klifMid.sleutel} vs ${steilMid.sleutel}`,
);

/* -- versiestempel --------------------------------------------------------- */

console.log('\n— versiestempel —');

/* Een vergeten stempel is niet te zien: de pagina laadt, met een stylesheet of
 * een script van de vorige keer ernaast. Daarom is het hier een mislukte toets
 * en geen raadsel achteraf. */
const { stempel, metStempel } = await import('./terreinbouwer/stempel.mjs');
const indexHtml = readFileSync(join(ROOT, 'tools/terreinbouwer/index.html'), 'utf8');
const nu = stempel();
toets(
  `de stempel in index.html is bij de tijd (${nu})`,
  metStempel(indexHtml, nu) === indexHtml,
  'draai `node tools/terreinbouwer/stempel.mjs`',
);


/* -- de pagina -------------------------------------------------------------
 * De bouwer is voor een telefoon gemaakt, dus wordt hij als telefoon getoetst:
 * een aanraakscherm, geen muis, geen toetsenbord. Alles gaat via echte tikken
 * op echte knoppen — niet via de functies eronder. Juist dat verschil legde de
 * fouten bloot die de vorige versie onbruikbaar maakten.
 */

console.log('\n— pagina op een telefoon —');

const { chromium } = await import('playwright');
const { maakServer } = await import('./terreinbouwer/serve.mjs');

const server = maakServer();
await new Promise((klaar) => server.listen(0, klaar));
const poort = server.address().port;

const browser = await chromium.launch();

/** Een verse telefoon met de bouwer erop. */
async function telefoon(breedte = 412, hoogte = 915) {
  const blad = await browser.newPage({
    viewport: { width: breedte, height: hoogte },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2.6,
  });
  blad.on('pageerror', (fout) => console.log('  [paginafout]', fout.message));
  await blad.goto(`http://127.0.0.1:${poort}/tools/terreinbouwer/`);
  await blad.waitForFunction('window.KLAAR === true', null, { timeout: 30000 });
  return blad;
}

const aantal = (blad) => blad.evaluate(() => window.TERREINBOUWER.bouwsel.stukken.size);
const wijzer = (blad) => blad.evaluate(() => window.TERREINBOUWER.stand.wijzer.join(','));
const midden = async (blad) => {
  const kader = await blad.locator('#doek').boundingBox();
  return [kader.x + kader.width / 2, kader.y + kader.height / 2];
};

const blad = await telefoon();

toets('de pagina laadt', await blad.locator('#doek').isVisible());
toets('en past op het scherm zonder te rollen', await blad.evaluate(
  () => document.documentElement.scrollHeight <= document.documentElement.clientHeight + 1,
));

/* Elke knop moet raakbaar zijn. Een knop van 20 beeldpunten is met een muis
 * prima en met een duim een gok. */
const teKlein = await blad.evaluate(() => {
  const uit = [];
  for (const knop of document.querySelectorAll('button')) {
    if (knop.offsetParent === null) continue; // niet in beeld
    const k = knop.getBoundingClientRect();
    if (k.height < 36 || k.width < 36) uit.push(`${knop.id || knop.textContent.trim()} ${Math.round(k.width)}×${Math.round(k.height)}`);
  }
  return uit;
});
toets('alle knoppen zijn groot genoeg voor een duim', teKlein.length === 0, teKlein.join(', '));

/* -- richten zet niets neer ------------------------------------------------ */

const [mx, my] = await midden(blad);
await blad.touchscreen.tap(mx, my);
toets('tikken op het raster zet niets neer', await aantal(blad) === 0);
toets('maar verplaatst wel de wijzer', await wijzer(blad) !== '');

const voorVeeg = await wijzer(blad);
await blad.locator('#doek').dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: mx, clientY: my, isPrimary: true });
await blad.locator('#doek').dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch', clientX: mx + 120, clientY: my + 60, isPrimary: true });
toets('vegen om rond te kijken laat de wijzer staan', await wijzer(blad) === voorVeeg);

/* -- een stuk kiezen en neerzetten ----------------------------------------- */

toets('"Zet neer" kan nog niet', await blad.locator('#zet').isDisabled());

await blad.locator('#stuk-knop').tap();
toets('het blad met stukken gaat open', await blad.locator('#blad').isVisible());

const paletHoogte = await blad.evaluate(
  () => Math.round(document.getElementById('blad-inhoud').getBoundingClientRect().height),
);
toets('de lijst met stukken is hoog genoeg om te kiezen', paletHoogte >= 180, `${paletHoogte}px`);

await blad.locator('#zoek').fill('grass-floor');
const eerste = blad.locator('#blad-inhoud .rij').first();
toets('zoeken levert een stuk op', await eerste.count() === 1);
await eerste.tap();

toets('het blad sluit na het kiezen', await blad.locator('#blad').isHidden());
toets('en het gekozen stuk staat onderaan', (await blad.locator('#penseel').innerText()).includes('grass-floor'));
toets('"Zet neer" kan nu wel', await blad.locator('#zet').isEnabled());
toets('en er staat nog steeds niets', await aantal(blad) === 0);

await blad.locator('#zet').tap();
toets('"Zet neer" zet er één neer', await aantal(blad) === 1);
toets('op het vak van de wijzer', await blad.evaluate(() => {
  const T = window.TERREINBOUWER;
  const stuk = [...T.bouwsel.stukken.values()][0];
  return stuk.x === T.stand.wijzer[0] && stuk.z === T.stand.wijzer[1];
}));
/* Neerzetten op een bezet vak wordt niet geweigerd: een kei hoort op een tegel,
 * en of twee stukken samen kunnen is een oordeel van wie bouwt. De bouwer meldt
 * wat hij meet en beslist niets. */
toets('"Zet neer" blijft kunnen op een bezet vak', await blad.locator('#zet').isEnabled());
await blad.evaluate(() => window.TERREINBOUWER.kiesStuk('shared-prop-boulder-a'));
await blad.locator('#zet').tap();
toets('een kei kan op de tegel die er al ligt', await aantal(blad) === 2);
toets(
  'en dat levert geen botsingsmelding op',
  await blad.evaluate(() => window.TERREINBOUWER
    .controleer(window.TERREINBOUWER.bouwsel)
    .every((m) => m.soort !== 'overlap' && m.soort !== 'dubbel')),
);
await blad.locator('#weg').tap();
toets('"Weg" haalt de kei weg en laat de tegel liggen', await aantal(blad) === 1);

/* -- weghalen en terugdraaien ---------------------------------------------- */

toets('"Weg" kan nu', await blad.locator('#weg').isEnabled());
const voorWeg = await aantal(blad);
await blad.locator('#weg').tap();
toets('"Weg" haalt het weg', await aantal(blad) === voorWeg - 1);

/* De geschiedenis is hier: tegel neergezet, kei erop, kei weg, tegel weg. Elke
 * stap terug draait er precies één om — ook de stap waarmee de kei verdween. */
await blad.locator('#ongedaan').tap();
toets('ongedaan zet de weggehaalde tegel terug', await aantal(blad) === voorWeg);
await blad.locator('#ongedaan').tap();
toets('nog een keer ongedaan draait ook de stap dáárvoor terug', await aantal(blad) === voorWeg + 1);
await blad.locator('#opnieuw').tap();
toets('opnieuw doet die stap weer', await aantal(blad) === voorWeg);

/* Tien stukken neerzetten en in tien tikken terugdraaien: dat is het geval
 * waar het om begonnen was — tientallen stukken en geen weg terug. */
const voorTien = await aantal(blad);
for (let i = 0; i < 10; i++) {
  await blad.evaluate((n) => {
    const T = window.TERREINBOUWER;
    return T.doeZet({ naam: 'hilly-terrain-grass-floor', x: n + 3, z: 0, laag: 0, slagen: 0 });
  }, i);
}
toets('tien stukken erbij', await aantal(blad) === voorTien + 10);
for (let i = 0; i < 10; i++) await blad.locator('#ongedaan').tap();
toets('en tien keer ongedaan haalt ze er allemaal af', await aantal(blad) === voorTien);

/* -- lagen ----------------------------------------------------------------- */

await blad.locator('#laag-plus').tap();
toets('een laag omhoog', await blad.locator('#laag-nu').innerText() === '1');
await blad.locator('#laag-min').tap();
await blad.locator('#laag-min').tap();
toets('en niet onder nul', await blad.locator('#laag-nu').innerText() === '0');

await blad.locator('#draai').tap();
toets('draaien telt door', await blad.locator('#draai-nu').innerText() === '90°');

/* -- de controle ----------------------------------------------------------- */

await blad.locator('#stand-knop').tap();
toets('de controle gaat open', await blad.locator('#blad').isVisible());
toets('en meldt niets bij één los stuk', (await blad.locator('#blad-inhoud').innerText()).includes('sluit aan'));
await blad.locator('#blad-sluit').tap();
toets('en gaat weer dicht', await blad.locator('#blad').isHidden());

/* -- past hier tegenaan ----------------------------------------------------
 * De vraag waar het pakket om draait. Hier getoetst zoals hij gesteld wordt:
 * richt op een stuk dat er staat, open de controle, en kijk of er iets te
 * kiezen valt dat er daarna ook echt tegenaan blijkt te passen.
 */

/* Eerst het veld leegmaken: anders meet deze toets de naden van wat er nog van
 * de vorige stappen stond en niet die van het voorstel. */
await blad.evaluate(async () => {
  const T = window.TERREINBOUWER;
  while (T.bouwsel.stukken.size) T.doeWeg([...T.bouwsel.stukken.keys()][0]);
  await T.doeZet({ naam: 'cliff-terrain-side-base', x: 0, z: 0, laag: 0, slagen: 0 });
  T.stand.wijzer = [0, 0];
  T.stand.laag = 0;
});
await blad.locator('#stand-knop').tap();
await blad.getByRole('button', { name: 'Past hier' }).tap();

const voorstelRijen = blad.locator('#blad-inhoud .rij');
const hoeveel = await voorstelRijen.count();
toets('"Past hier" noemt passende stukken', hoeveel > 0, `${hoeveel} voorstellen`);

const voorNaam = await voorstelRijen.first().locator('.rij-naam').innerText();
const voorAantal = await aantal(blad);
await voorstelRijen.first().tap();
toets('een voorstel aantikken zet het neer', await aantal(blad) === voorAantal + 1);
toets(
  `en dat voorstel (${voorNaam}) sluit dan ook echt aan`,
  await blad.evaluate(() => window.TERREINBOUWER
    .controleer(window.TERREINBOUWER.bouwsel)
    .every((m) => m.soort !== 'naad')),
);

await blad.evaluate(() => {
  const T = window.TERREINBOUWER;
  while (T.bouwsel.stukken.size) T.doeWeg([...T.bouwsel.stukken.keys()][0]);
});

/* -- zelf oordelen ---------------------------------------------------------
 * De opbrengst van het gereedschap: niet wat de meting vindt, maar wat jij
 * ervan vindt — en dat het bewaard blijft.
 */

await blad.evaluate(async () => {
  const T = window.TERREINBOUWER;
  while (T.bouwsel.stukken.size) T.doeWeg([...T.bouwsel.stukken.keys()][0]);
  localStorage.removeItem('terreinbouwer-oordelen');
  T.oordelen.clear();
  // gras naast zand: de meting zegt "stap", want 0,1 tegen 0
  await T.doeZet({ naam: 'hilly-terrain-grass-floor', x: 0, z: 0, laag: 0, slagen: 0 });
  await T.doeZet({ naam: 'beach-terrain-sand-floor', x: 1, z: 0, laag: 0, slagen: 0 });
});

await blad.locator('#stand-knop').tap();
await blad.getByRole('button', { name: 'Voegen' }).tap();
toets('de voeg staat in de lijst', await blad.locator('.combo').count() === 1);
/* De meting mag er niet staan zolang er nog geen oordeel is: het antwoord
 * voorzeggen maakt van beoordelen napraten. */
toets(
  'de meting staat er nog niet bij',
  !(await blad.locator('.combo-meting').innerText()).includes('meting'),
  await blad.locator('.combo-meting').innerText(),
);
toets(
  'maar wel wáár de voeg zit',
  /vak -?\d+,-?\d+ · laag \d+/.test(await blad.locator('.combo-meting').innerText()),
);

await blad.locator('.combo-knoppen button[data-keuze="goed"]').tap();
toets('"goed" wordt vastgelegd', await blad.evaluate(() => window.TERREINBOUWER.oordelen.size) === 1);
toets(
  'en het verschil met de meting staat erbij',
  (await blad.locator('.combo-afwijking').innerText()).includes('niet samenvallen'),
);
toets(
  'het oordeel gaat vóór de meting',
  await blad.evaluate(() => [...window.TERREINBOUWER.oordelen.values()][0].oordeel === 'goed'),
);

/* Nog eens tikken trekt het in — anders zit je vast aan een misklik. */
await blad.locator('.combo-knoppen button[data-keuze="goed"]').tap();
toets('nog eens tikken trekt het oordeel in', await blad.evaluate(() => window.TERREINBOUWER.oordelen.size) === 0);

await blad.locator('.combo-knoppen button[data-keuze="niet"]').tap();
toets('en "niet" legt het andersom vast', await blad.evaluate(
  () => [...window.TERREINBOUWER.oordelen.values()][0]?.oordeel === 'niet',
));

await blad.locator('#blad-sluit').tap();

/* De kern van deze ronde: twee voegen met dezelfde stukken op een andere plek
 * moeten los van elkaar te beoordelen zijn. Eerder deelden ze één regel en één
 * stel knoppen, en dan kun je niet zeggen dat de ene goed valt en de andere
 * niet. */
await blad.evaluate(async () => {
  const T = window.TERREINBOUWER;
  while (T.bouwsel.stukken.size) T.doeWeg([...T.bouwsel.stukken.keys()][0]);
  localStorage.removeItem('terreinbouwer-oordelen');
  T.oordelen.clear();
  for (let z = 0; z < 3; z++) {
    await T.doeZet({ naam: 'cliff-terrain-side-mid', x: 0, z, laag: 0, slagen: 0 });
  }
});
await blad.locator('#stand-knop').tap();
await blad.getByRole('button', { name: 'Voegen' }).tap();
toets('een wand van drie geeft twee losse regels', await blad.locator('.combo').count() === 2);

await blad.locator('.combo').nth(0).locator('button[data-keuze="goed"]').tap();
await blad.locator('.combo').nth(1).locator('button[data-keuze="niet"]').tap();
toets('de ene goed en de andere niet is mogelijk', await blad.evaluate(() => {
  const o = [...window.TERREINBOUWER.oordelen.values()].map((x) => x.oordeel).sort();
  return o.length === 2 && o[0] === 'goed' && o[1] === 'niet';
}));
toets(
  'en de bouwer meldt dat dezelfde vorm elders anders viel',
  (await blad.locator('#blad-inhoud').innerText()).includes('hangt dus van de plek af'),
);

await blad.locator('#blad-sluit').tap();
await blad.evaluate(async () => {
  const T = window.TERREINBOUWER;
  while (T.bouwsel.stukken.size) T.doeWeg([...T.bouwsel.stukken.keys()][0]);
  localStorage.removeItem('terreinbouwer-oordelen');
  T.oordelen.clear();
  await T.doeZet({ naam: 'hilly-terrain-grass-floor', x: 0, z: 0, laag: 0, slagen: 0 });
  await T.doeZet({ naam: 'beach-terrain-sand-floor', x: 1, z: 0, laag: 0, slagen: 0 });
});
await blad.locator('#stand-knop').tap();
await blad.getByRole('button', { name: 'Voegen' }).tap();
await blad.locator('.combo-knoppen button[data-keuze="niet"]').first().tap();
await blad.locator('#blad-sluit').tap();

/* Het oordeel moet een herlaadbeurt overleven, anders is het geen opbrengst. */
const bewaard = await blad.evaluate(() => localStorage.getItem('terreinbouwer-oordelen'));
toets('het oordeel wordt bewaard', typeof bewaard === 'string' && bewaard.includes('niet'));
await blad.reload();
await blad.waitForFunction('window.KLAAR === true', null, { timeout: 30000 });
toets(
  'en staat er na herladen nog',
  await blad.evaluate(() => window.TERREINBOUWER.oordelen.size) === 1,
);

await blad.evaluate(async () => {
  const T = window.TERREINBOUWER;
  await T.doeZet({ naam: 'hilly-terrain-grass-floor', x: 0, z: 0, laag: 0, slagen: 0 });
  await T.doeZet({ naam: 'beach-terrain-sand-floor', x: 1, z: 0, laag: 0, slagen: 0 });
});
await blad.locator('#stand-knop').tap();
await blad.getByRole('button', { name: 'Voegen' }).tap();
toets(
  'en kleurt de combinatie na herladen nog steeds',
  await blad.locator('.combo').first().getAttribute('data-oordeel') === 'niet',
);

/* -- voorbeeldbouwsels -----------------------------------------------------
 * Er moet iets staan om over te oordelen. Deze toets doet wat jij doet: blad
 * open, bouwsel kiezen, en kijken of er daarna combinaties te beoordelen zijn.
 */

/* Naast het blad tikken sluit het — anders dekt het de knoppenbalk af en kom
 * je er alleen via het kruisje uit. */
toets('het blad staat nog open', await blad.locator('#blad').isVisible());
await blad.locator('#waas').tap({ position: { x: 10, y: 10 } });
toets('naast het blad tikken sluit het', await blad.locator('#blad').isHidden());

await blad.locator('#stuk-knop').tap();
await blad.getByRole('button', { name: 'Bouwsels' }).tap();
const bouwselRijen = await blad.locator('.bouwsel').count();
toets('er staan bouwsels klaar', bouwselRijen >= 5, `${bouwselRijen}`);

await blad.locator('.bouwsel').filter({ hasText: 'Klifwand van drie lagen' }).tap();
/* Openen is werk: elk model moet nog opgehaald worden. Wachten tot het er
 * staat, niet meteen kijken. */
await blad.waitForFunction(() => window.TERREINBOUWER.bouwsel.stukken.size === 15,
  null, { timeout: 15000 }).catch(() => {});
toets('een bouwsel openen zet stukken neer', await aantal(blad) === 15, `${await aantal(blad)}`);
toets('en het blad sluit', await blad.locator('#blad').isHidden());
toets(
  'de stukken staan op eindige plekken',
  await blad.evaluate(() => window.TERREINBOUWER.stukken.children
    .every((k) => k.position.toArray().every(Number.isFinite))),
);

await blad.locator('#stand-knop').tap();
await blad.getByRole('button', { name: 'Voegen' }).tap();
const teBeoordelen = await blad.locator('.combo').count();
toets('en er valt iets te beoordelen', teBeoordelen >= 3, `${teBeoordelen} combinaties`);
await blad.locator('#blad-sluit').tap();

/* Elk bouwsel moet openen en voegen opleveren — een bouwsel uit losse stukken
 * geeft niemand iets te beoordelen. */
const perBouwsel = await blad.evaluate(async () => {
  const T = window.TERREINBOUWER;
  const uit = [];
  for (const voorbeeld of T.voorbeelden) {
    await T.openBouwsel(voorbeeld);
    uit.push({
      naam: voorbeeld.naam,
      stukken: T.bouwsel.stukken.size,
      voegen: T.naden(T.bouwsel).length,
    });
  }
  return uit;
});
for (const b of perBouwsel) {
  toets(
    `bouwsel "${b.naam}" levert voegen op`,
    b.stukken === undefined ? false : b.voegen > 0,
    JSON.stringify(b),
  );
}

/* -- één voeg bekijken -----------------------------------------------------
 * Een regel in de lijst staat voor een combinatie die tien keer in een bouwsel
 * kan zitten. Met alleen twee stuknamen erbij is niet te zien wélke voeg je
 * beoordeelt; bekijken moet de voeg zelf in beeld zetten.
 */

await blad.evaluate(async () => {
  const T = window.TERREINBOUWER;
  await T.openBouwsel(T.voorbeelden.find((v) => v.naam.startsWith('Klifwand')));
});

await blad.locator('#stand-knop').tap();
await blad.getByRole('button', { name: 'Voegen' }).tap();
const eersteCombo = blad.locator('.combo').first();
const comboNaam = await eersteCombo.locator('.combo-namen').innerText();
await eersteCombo.locator('.combo-toon').tap();

toets('bekijken sluit het blad', await blad.locator('#blad').isHidden());
toets('en toont de kijkbalk', await blad.locator('#voet-kijk').isVisible());
toets('de gewone knoppenbalk gaat weg', await blad.locator('.voet:not(.voet-kijk)').isHidden());
toets(
  'de kijkbalk noemt dezelfde stukken',
  (await blad.locator('#kijk-namen').innerText()).replace(/\s+/g, ' ')
    === comboNaam.replace(/\s+/g, ' '),
  `${await blad.locator('#kijk-namen').innerText()} vs ${comboNaam}`,
);
toets(
  'en zegt de hoeveelste voeg het is',
  /voeg \d+ van \d+/.test(await blad.locator('#kijk-bij').innerText()),
  await blad.locator('#kijk-bij').innerText(),
);
toets(
  'zonder de meting voor te zeggen',
  !(await blad.locator('#kijk-bij').innerText()).includes('meting'),
  await blad.locator('#kijk-bij').innerText(),
);

/* De blauwe lijn moet er ook echt zijn — anders wijst de balk naar niets. */
/* De aanwijzing moet echte meetkunde zijn en geen lijn: een WebGL-lijn is één
 * beeldpunt breed en op een telefoon dus nauwelijks te zien. */
const markering = await blad.evaluate(() => {
  const T = window.TERREINBOUWER;
  const groep = T.scene.children.find((k) => k.isGroup && k.renderOrder === 7);
  return {
    er: !!groep,
    zichtbaar: !!groep && groep.visible,
    staafjes: groep ? groep.children.length : 0,
    meshes: groep ? groep.children.every((k) => k.isMesh) : false,
  };
});
toets(
  'er wordt een voeg aangewezen in beeld',
  markering.er && markering.zichtbaar && markering.staafjes > 0,
  JSON.stringify(markering),
);
toets('en wel met echte staafjes, niet met haarlijnen', markering.meshes);

/* Volgende voeg: de wijzer moet meeverspringen, anders kijk je nog naar de
 * vorige. */
const voorVolgende = await wijzer(blad);
await blad.locator('#kijk-volgende').tap();
toets('volgende voeg verplaatst de wijzer', await wijzer(blad) !== voorVolgende,
  `${voorVolgende} → ${await wijzer(blad)}`);

const voorOordeel = await blad.evaluate(() => window.TERREINBOUWER.stand.kijk.index);
await blad.locator('#kijk-goed').tap();
toets(
  'oordelen kan vanuit de kijkbalk',
  await blad.evaluate(() => window.TERREINBOUWER.oordelen.size) > 0,
);
toets(
  'en daarna sta je vanzelf bij de volgende voeg',
  await blad.evaluate(() => window.TERREINBOUWER.stand.kijk.index) !== voorOordeel,
);

/* De camera moet de stand houden die jij hem gegeven hebt. Hier wordt hij met
 * de hand ergens neergezet, en na een stap naar de volgende voeg moet de hoek
 * en de afstand tot het mikpunt hetzelfde zijn — alleen het mikpunt verschuift. */
const standVoor = await blad.evaluate(() => {
  const T = window.TERREINBOUWER;
  T.camera.position.set(T.stuur.target.x + 3, T.stuur.target.y + 2, T.stuur.target.z - 1);
  T.stuur.update();
  return T.camera.position.clone().sub(T.stuur.target).toArray().map((v) => +v.toFixed(3));
});
await blad.locator('#kijk-volgende').tap();
const standNa = await blad.evaluate(() => {
  const T = window.TERREINBOUWER;
  return T.camera.position.clone().sub(T.stuur.target).toArray().map((v) => +v.toFixed(3));
});
toets(
  'en de camera houdt de stand die je hem zelf gaf',
  JSON.stringify(standVoor) === JSON.stringify(standNa),
  `${JSON.stringify(standVoor)} → ${JSON.stringify(standNa)}`,
);
toets(
  'de meting van de beoordeelde voeg is nu wél te zien',
  await blad.evaluate(() => {
    const T = window.TERREINBOUWER;
    return [...T.oordelen.values()].every((o) => typeof o.meting === 'boolean');
  }),
);

await blad.screenshot({ path: join(ROOT, 'docs/terreinbouwer.png') });

/* -- doorwerken ------------------------------------------------------------
 * De lus waar het om gaat: oordelen, oordelen, volgend bouwsel, oordelen.
 * Alles wat daartussen zat — bladen openen en sluiten, tabbladen kiezen — is
 * werk dat niets oplevert, en dat was zes tikken tussen twee oordelen.
 */

await blad.evaluate(async () => {
  const T = window.TERREINBOUWER;
  localStorage.removeItem('terreinbouwer-oordelen');
  T.oordelen.clear();
  await T.openBouwsel(T.voorbeelden[0]);          // Grasvlakte
  T.beginKijken(0);
});

toets('de doorgaan-knop staat er nog niet', await blad.locator('#kijk-volgend-bouwsel').isHidden());

/* Alles beoordelen met alleen de goed-knop: hij hoort telkens door te springen
 * naar de eerstvolgende voeg zonder oordeel. */
const teGaan = await blad.evaluate(() => window.TERREINBOUWER.stand.kijk.lijst.length);
for (let i = 0; i < teGaan; i++) await blad.locator('#kijk-goed').tap();

toets(
  `alle ${teGaan} voegen beoordeeld met alleen de goed-knop`,
  await blad.evaluate(() => window.TERREINBOUWER.oordelen.size) === teGaan,
  `${await blad.evaluate(() => window.TERREINBOUWER.oordelen.size)} van ${teGaan}`,
);
toets('en dan verschijnt de doorgaan-knop', await blad.locator('#kijk-volgend-bouwsel').isVisible());
toets(
  'die het volgende bouwsel bij naam noemt',
  (await blad.locator('#kijk-volgend-bouwsel').innerText()).includes(
    await blad.evaluate(() => window.TERREINBOUWER.voorbeelden[1].naam),
  ),
  await blad.locator('#kijk-volgend-bouwsel').innerText(),
);

await blad.locator('#kijk-volgend-bouwsel').tap();
await blad.waitForFunction(
  (n) => window.TERREINBOUWER.bouwsel.noemer === n,
  await blad.evaluate(() => window.TERREINBOUWER.voorbeelden[1].naam),
  { timeout: 15000 },
).catch(() => {});
toets(
  'doorgaan laadt het volgende bouwsel',
  await blad.evaluate(() => window.TERREINBOUWER.bouwsel.noemer)
    === await blad.evaluate(() => window.TERREINBOUWER.voorbeelden[1].naam),
);
toets('en zet je meteen weer aan het beoordelen', await blad.locator('#voet-kijk').isVisible());
toets(
  'bij een voeg die nog geen oordeel heeft',
  await blad.evaluate(() => {
    const T = window.TERREINBOUWER;
    const naad = T.stand.kijk.lijst[T.stand.kijk.index];
    return !T.oordelen.has(naad.sleutel);
  }),
);

/* De hele ronde langs, want de fout die dit moet vangen liet zich pas bij het
 * derde bouwsel zien: elk bouwsel staat op vak (0,0), dus met een sleutel die
 * alleen de plek noemt kwam het volgende bouwsel al beoordeeld binnen. */
const rondje = await blad.evaluate(async () => {
  const T = window.TERREINBOUWER;
  localStorage.removeItem('terreinbouwer-oordelen');
  T.oordelen.clear();
  const uit = [];
  for (const voorbeeld of T.voorbeelden) {
    await T.openBouwsel(voorbeeld);
    const lijst = T.naden(T.bouwsel);
    uit.push({
      naam: voorbeeld.naam,
      voegen: lijst.length,
      alGeoordeeld: lijst.filter((n) => T.oordelen.has(n.sleutel)).length,
    });
    for (const naad of lijst) T.velOordeel(naad.sleutel, 'goed', naad);
  }
  return uit;
});
toets(
  'elk volgend bouwsel komt onbeoordeeld binnen',
  rondje.every((b) => b.alGeoordeeld === 0),
  rondje.filter((b) => b.alGeoordeeld).map((b) => `${b.naam}: ${b.alGeoordeeld}/${b.voegen}`).join(', '),
);
toets(
  'en samen leveren ze net zoveel oordelen op als voegen',
  await blad.evaluate(() => window.TERREINBOUWER.oordelen.size)
    === rondje.reduce((som, b) => som + b.voegen, 0),
  `${await blad.evaluate(() => window.TERREINBOUWER.oordelen.size)} van `
    + `${rondje.reduce((som, b) => som + b.voegen, 0)}`,
);

/* De keerzijde van hetzelfde: het bouwsel opnieuw openen moet zijn eigen
 * oordelen wél terugbrengen, anders is elke ronde weggegooid werk. */
toets(
  'een bouwsel opnieuw openen brengt zijn eigen oordelen terug',
  await blad.evaluate(async () => {
    const T = window.TERREINBOUWER;
    await T.openBouwsel(T.voorbeelden[0]);
    const lijst = T.naden(T.bouwsel);
    return lijst.length > 0 && lijst.every((n) => T.oordelen.get(n.sleutel)?.oordeel === 'goed');
  }),
);
toets(
  'en zelf iets neerzetten maakt er weer onbeoordeelde voegen van',
  await blad.evaluate(async () => {
    const T = window.TERREINBOUWER;
    T.kiesStuk('hilly-terrain-grass-floor');
    await T.doeZet({ naam: 'hilly-terrain-grass-floor', x: 9, z: 9, laag: 0, slagen: 0 });
    await T.doeZet({ naam: 'hilly-terrain-grass-floor', x: 10, z: 9, laag: 0, slagen: 0 });
    return T.bouwsel.noemer === ''
      && T.naden(T.bouwsel).every((n) => !T.oordelen.has(n.sleutel));
  }),
);

await blad.evaluate(() => {
  window.TERREINBOUWER.oordelen.clear();
  localStorage.removeItem('terreinbouwer-oordelen');
});
await blad.locator('#kijk-stop').tap();
toets('klaar met kijken brengt de knoppenbalk terug',
  await blad.locator('.voet:not(.voet-kijk)').isVisible());
toets('en de aanwijzing verdwijnt', await blad.evaluate(() => {
  const T = window.TERREINBOUWER;
  const groep = T.scene.children.find((k) => k.isGroup && k.renderOrder === 7);
  return !groep.visible;
}));
console.log('  schermafbeelding → docs/terreinbouwer.png');
await blad.close();

/* -- een reeks schermmaten -------------------------------------------------
 * De fout die de vorige versie onbruikbaar maakte zat in één indeling en was in
 * de andere niet te zien. Wie alleen toetst op de maten die hij zelf bedacht,
 * toetst zijn eigen aannames.
 */

for (const [breedte, hoogte] of [[320, 568], [360, 740], [412, 915], [768, 1024], [1280, 800]]) {
  const b = await telefoon(breedte, hoogte);

  /* Elke knop in de kop moet te raken zijn, en op 320 px was dat er één niet:
   * de standknop kreeg wat er overbleef en dat was achttien pixels. Juist die
   * knop is de ingang naar de voegenlijst, dus wie hem niet kan raken kan niets
   * beoordelen — op het kleinste scherm, waar niemand toevallig kijkt. */
  const koppen = await b.evaluate(() => [...document.querySelectorAll('.kop .knop')].map((k) => {
    const kader = k.getBoundingClientRect();
    return {
      id: k.id,
      breed: Math.round(kader.width),
      binnen: kader.left >= -0.5 && kader.right <= innerWidth + 0.5,
    };
  }));
  toets(
    `op ${breedte}×${hoogte} is elke knop in de kop te raken`,
    koppen.every((k) => k.breed >= 44 && k.binnen),
    JSON.stringify(koppen.filter((k) => k.breed < 44 || !k.binnen)),
  );

  await b.locator('#stuk-knop').tap();
  const meting = await b.evaluate(() => {
    const inhoud = document.getElementById('blad-inhoud').getBoundingClientRect();
    const rij = document.querySelector('#blad-inhoud .rij')?.getBoundingClientRect();
    const doek = document.getElementById('doek').getBoundingClientRect();
    return {
      lijst: Math.round(inhoud.height),
      rij: rij ? Math.round(rij.height) : 0,
      doek: Math.round(doek.height),
      rolt: document.documentElement.scrollHeight > document.documentElement.clientHeight + 1,
    };
  });
  toets(
    `op ${breedte}×${hoogte} valt er te kiezen en te bouwen`,
    meting.lijst >= 180 && meting.rij >= 36 && meting.doek >= 200 && !meting.rolt,
    JSON.stringify(meting),
  );
  await b.close();
}

/* -- het vangnet ----------------------------------------------------------- */

const stuk = await browser.newPage({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true });
await stuk.route('**/bouwer.js*', (route) => route.abort());
await stuk.goto(`http://127.0.0.1:${poort}/tools/terreinbouwer/`);
await stuk.waitForSelector('#storing:visible', { timeout: 15000 }).catch(() => {});
toets('een bouwer die niet opstart meldt dat op het scherm', await stuk.locator('#storing').isVisible());
const storingTekst = await stuk.locator('#storing').innerText();
toets(
  'en zegt wat deze browser wel en niet kan',
  storingTekst.includes('import maps:') && storingTekst.includes('WebGL 2:'),
);
await stuk.close();

await browser.close();
server.close();

console.log(mislukt === 0 ? '\nalles goed' : `\n${mislukt} toetsen mislukt`);
process.exitCode = mislukt === 0 ? 0 : 1;
