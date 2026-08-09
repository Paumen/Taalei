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
  Kit, Bouwsel, controleer, watPast, draaiVak, ontdraaiVak,
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

const overlap = controleer(bouw([
  { naam: 'hilly-terrain-grass-floor', x: 0, z: 0, laag: 0 },
  { naam: 'beach-terrain-sand-floor', x: 0, z: 0, laag: 0 },
]));
toets('twee stukken in hetzelfde vak is een fout', overlap.some((m) => m.soort === 'overlap' && m.ernst === 'fout'));

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

/* -- de pagina ------------------------------------------------------------- */

console.log('\n— pagina —');

const { chromium } = await import('playwright');
const { maakServer } = await import('./terreinbouwer/serve.mjs');

const server = maakServer();
await new Promise((klaar) => server.listen(0, klaar));
const poort = server.address().port;

const browser = await chromium.launch();
const pagina = await browser.newPage({ viewport: { width: 1400, height: 800 } });

const fouten = [];
pagina.on('pageerror', (fout) => fouten.push(fout.message));
pagina.on('console', (bericht) => { if (bericht.type() === 'error') fouten.push(bericht.text()); });

await pagina.goto(`http://127.0.0.1:${poort}/tools/terreinbouwer/`);
await pagina.waitForFunction('window.KLAAR === true', null, { timeout: 30000 });

toets('de pagina laadt zonder fouten', fouten.length === 0, fouten.slice(0, 2).join(' | '));
toets('het palet is gevuld', await pagina.locator('#palet .stuk').count() === kit.modellen.size);

/* Een klifwand van drie hoog neerzetten via dezelfde weg die de muis gebruikt,
 * en kijken of de controle er niets op aan te merken heeft. */
await pagina.evaluate(async () => {
  const { plaats } = window.TERREINBOUWER;
  await plaats({ naam: 'cliff-terrain-side-base', x: 0, z: 0, laag: 0 });
  await plaats({ naam: 'cliff-terrain-side-mid', x: 0, z: 0, laag: 1 });
  await plaats({ naam: 'cliff-terrain-side-top', x: 0, z: 0, laag: 2 });
  await plaats({ naam: 'cliff-terrain-side-base', x: 0, z: 1, laag: 0 });
});
toets(
  'een klifwand in de pagina levert geen meldingen',
  await pagina.evaluate(() => window.TERREINBOUWER.controleer(window.TERREINBOUWER.bouwsel).length) === 0,
);
toets('de modellen zijn ingeladen', await pagina.evaluate(() => window.TERREINBOUWER.bouwsel.stukken.size) === 4);

/* Dat de controle tevreden is zegt niets over wat er te zíén is. Deze twee
 * kijken naar het scherm in plaats van naar de administratie: staan de stukken
 * op een echte plek, en komt er ook echt geometrie uit de kaartenbak?
 *
 * Niet overbodig: een eerdere versie las de laaghoogte onder de verkeerde naam
 * uit de kit, waardoor elk stuk op y = NaN belandde. Alles klopte — vier
 * stukken, nul meldingen, veertien getekende driehoeken — en het scherm bleef
 * leeg. */
const plek = await pagina.evaluate(() => {
  const { stukken } = window.TERREINBOUWER;
  return stukken.children.map((k) => k.position.toArray());
});
toets(
  'elk geplaatst stuk staat op een eindige plek',
  plek.length === 4 && plek.every((p) => p.every(Number.isFinite)),
  JSON.stringify(plek),
);

const getekend = await pagina.evaluate(() => {
  const T = window.TERREINBOUWER;
  T.renderer.render(T.scene, T.camera);
  return T.renderer.info.render.triangles;
});
toets('er worden driehoeken getekend', getekend > 0, `${getekend} driehoeken`);

toets('het vangnet blijft weg als alles goed gaat', await pagina.locator('#storing').isHidden());

/* -- bediening ------------------------------------------------------------
 * De toetsen hierboven roepen plaats() rechtstreeks aan. Dat zegt niets over de
 * vraag of je er met een muis of een vinger bij kunt, en juist daar ging het
 * mis: het palet vulde zich netjes en er viel niets te plaatsen, omdat er eerst
 * een stuk gekozen moest worden en niets dat vertelde.
 *
 * Hieronder dus geen plaats() maar echte tikken, en één keer zonder muis.
 */

async function versBlad(opties = {}) {
  const blad = await browser.newPage({ viewport: { width: 1200, height: 800 }, ...opties });
  await blad.goto(`http://127.0.0.1:${poort}/tools/terreinbouwer/`);
  await blad.waitForFunction('window.KLAAR === true', null, { timeout: 30000 });
  return blad;
}

const tel = (blad) => blad.evaluate(() => window.TERREINBOUWER.bouwsel.stukken.size);
const midden = async (blad) => {
  const kader = await blad.locator('#doek').boundingBox();
  return [kader.x + kader.width / 2, kader.y + kader.height / 2];
};

const muisBlad = await versBlad();
toets('zonder gekozen stuk staat er een wenk in beeld', await muisBlad.locator('#wenk').isVisible());

/* Het doek mag niet verschuiven als je een knop in de balk indrukt. Doet het
 * dat wel, dan wijst elke tik daarna een ander vak aan dan waar je hem zette —
 * en dat is niet te zien, want de knop werkt gewoon. Zo raakte de balk ooit
 * breder dan de kolom: de browser rolde de knop met de focus in beeld en het
 * doek schoof 86 beeldpunten opzij. */
const doekX = () => muisBlad.evaluate(() =>
  Math.round(document.getElementById('doek').getBoundingClientRect().x));
const voorKnop = await doekX();
for (const naam of ['plaatsen', 'kiezen', 'weghalen']) {
  await muisBlad.getByRole('button', { name: naam }).click();
}
await muisBlad.getByRole('button', { name: 'plaatsen' }).click();
toets(
  'het doek blijft staan waar het staat als je de balk bedient',
  await doekX() === voorKnop,
  `${voorKnop} → ${await doekX()}`,
);
toets(
  'het doek is niet zijwaarts weggerold',
  await muisBlad.evaluate(() => document.querySelector('.doek').scrollLeft) === 0,
);

const [mx, my] = await midden(muisBlad);
await muisBlad.mouse.click(mx, my);
toets('een tik zonder gekozen stuk plaatst niets', await tel(muisBlad) === 0);
toets(
  'maar zegt wel wat er ontbreekt',
  (await muisBlad.locator('#wenk').innerText()).toLowerCase().includes('kies eerst'),
  await muisBlad.locator('#wenk').innerText(),
);

await muisBlad.getByRole('option', { name: 'hilly-terrain-grass-floor' }).first().click();
toets('na het kiezen verdwijnt de wenk', await muisBlad.locator('#wenk').isHidden());
await muisBlad.mouse.click(mx, my);
toets('een tik met gekozen stuk plaatst er één', await tel(muisBlad) === 1);

/* Weghalen vóór het draaien: zodra de camera verschoven is wijst hetzelfde punt
 * op het scherm een ander vak aan, en dan toetst dit niets meer. */
await muisBlad.getByRole('button', { name: 'weghalen' }).click();
await muisBlad.mouse.click(mx, my);
toets('met de knop "weghalen" haalt een tik het stuk weg', await tel(muisBlad) === 0);

await muisBlad.getByRole('button', { name: 'plaatsen' }).click();
await muisBlad.mouse.click(mx, my);
toets('en met "plaatsen" komt er weer een stuk', await tel(muisBlad) === 1);

/* Slepen over het raster mag de camera draaien en verder niets: anders staat er
 * een tegel na elke poging om rond te kijken. */
await muisBlad.mouse.move(mx, my);
await muisBlad.mouse.down();
await muisBlad.mouse.move(mx + 140, my + 60, { steps: 12 });
await muisBlad.mouse.up();
toets('draaien aan de camera plaatst niets', await tel(muisBlad) === 1);
await muisBlad.close();

/* En nu zonder muis: een aanraakscherm, geen toetsenbord, geen tweede knop. */
const tikBlad = await versBlad({
  hasTouch: true,
  isMobile: true,
  viewport: { width: 820, height: 1100 },
});
await tikBlad.getByRole('option', { name: 'hilly-terrain-grass-floor' }).first().tap();
const [tx, ty] = await midden(tikBlad);
await tikBlad.touchscreen.tap(tx, ty);
toets('op een aanraakscherm plaatst een tik een stuk', await tel(tikBlad) === 1);

/* Vegen is op zo'n scherm de enige manier om rond te kijken. Zou dat ook
 * plaatsen, dan loopt het raster vol bij de eerste poging. */
await tikBlad.locator('#doek').dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: tx, clientY: ty, isPrimary: true });
await tikBlad.locator('#doek').dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch', clientX: tx + 120, clientY: ty + 40, isPrimary: true });
toets('vegen om rond te kijken plaatst niets', await tel(tikBlad) === 1);

await tikBlad.close();

/* Een telefoon staand. Hier ging het mis op een manier die op een breed scherm
 * niet te zien is: `.lijst` stond op `flex: 1`, en dat is `flex-basis: 0`. In
 * een kolom die zich naar zijn inhoud voegt telt zo'n vak voor niets mee, dus de
 * lade werd zo hoog als kop, zoekveld en filters samen en de stukken klapten weg
 * tot een streepje. Het palet stond er, en er viel niets te kiezen.
 *
 * Vandaar dat hier niet naar zichtbaarheid wordt gekeken maar naar hoogte: een
 * lijst van vier beeldpunten is technisch zichtbaar en praktisch onbruikbaar. */
const telefoon = await versBlad({
  hasTouch: true,
  isMobile: true,
  viewport: { width: 412, height: 915 },
});

const paletHoogte = await telefoon.evaluate(() =>
  Math.round(document.getElementById('palet').getBoundingClientRect().height));
toets(
  'op een telefoon is de lijst met stukken hoog genoeg om te kiezen',
  paletHoogte > 200, `${paletHoogte}px hoog`,
);

const eersteStuk = telefoon.getByRole('option').first();
toets('en de stukken staan er echt in', await eersteStuk.count() > 0);
await eersteStuk.scrollIntoViewIfNeeded();
await eersteStuk.tap();
toets(
  'een stuk is aan te tikken',
  await telefoon.evaluate(() => window.TERREINBOUWER.stand.penseel) !== null,
);

/* Het raster moet ook nog groot genoeg zijn om op te bouwen. */
const doekHoogte = await telefoon.evaluate(() =>
  Math.round(document.querySelector('.doek').getBoundingClientRect().height));
toets('en het raster houdt ruimte over', doekHoogte > 300, `${doekHoogte}px hoog`);

/* En de rekensom moet kloppen in deze indeling ook. De balk staat hier bóven
 * het doek in plaats van eroverheen, dus het doek begint niet meer op y = 0;
 * wie dat vergeet mikt er structureel naast. */
const [px, py] = await midden(telefoon);
await telefoon.touchscreen.tap(px, py);
toets('een tik op een telefoon plaatst een stuk', await tel(telefoon) === 1);
toets(
  'en de schaduw staat op het vak dat is aangetikt',
  await telefoon.evaluate(() => {
    const T = window.TERREINBOUWER;
    const stuk = [...T.bouwsel.stukken.values()][0];
    return stuk && T.stand.hover
      && stuk.x === T.stand.hover[0] && stuk.z === T.stand.hover[1];
  }),
);

await telefoon.screenshot({ path: join(ROOT, 'docs/terreinbouwer-telefoon.png'), fullPage: false });
await telefoon.close();

/* En andersom: als de bouwer niet opstart moet dat te zíén zijn. Zonder dit
 * blijft er alleen "kit laden…" staan — geen fout, geen aanwijzing, een pagina
 * die niet opschiet. Hier wordt bouwer.js onderweg tegengehouden; dat bootst
 * na wat een browser zonder WebGL 2 of zonder import maps oplevert. */
const stukPagina = await browser.newPage({ viewport: { width: 900, height: 600 } });
await stukPagina.route('**/bouwer.js', (route) => route.abort());
await stukPagina.goto(`http://127.0.0.1:${poort}/tools/terreinbouwer/`);
await stukPagina.waitForSelector('#storing:visible', { timeout: 15000 }).catch(() => {});
toets(
  'een bouwer die niet opstart meldt dat op het scherm',
  await stukPagina.locator('#storing').isVisible(),
);
const storingTekst = await stukPagina.locator('#storing').innerText();
toets(
  'de melding zegt wat deze browser wel en niet kan',
  storingTekst.includes('import maps:') && storingTekst.includes('WebGL 2:'),
  storingTekst.replace(/\n/g, ' | '),
);
await stukPagina.close();

/* Tot slot een plaatje voor de documentatie: een klifwand van drie lagen met de
 * grasvlakte erachter, plus één stuk dat er expres niet hoort — zo laat de
 * schermafbeelding zien wat de bouwer doet in plaats van alleen dát hij het
 * doet. */
await pagina.evaluate(async () => {
  const { plaats, stuur, camera } = window.TERREINBOUWER;
  for (let z = 2; z <= 4; z++) {
    await plaats({ naam: 'cliff-terrain-side-base', x: 0, z, laag: 0 });
    await plaats({ naam: 'cliff-terrain-side-mid', x: 0, z, laag: 1 });
    await plaats({ naam: 'cliff-terrain-side-top', x: 0, z, laag: 2 });
  }
  for (let x = -2; x <= -1; x++) {
    for (let z = 0; z <= 4; z++) await plaats({ naam: 'hilly-terrain-grass-floor', x, z, laag: 3 });
  }
  // en dit hoort er niet: zand op grashoogte, een tiende unit te laag
  await plaats({ naam: 'beach-terrain-sand-floor', x: -1, z: 5, laag: 3 });

  camera.position.set(4.2, 3.4, 5.2);
  stuur.target.set(-0.4, 0.7, 1.1);
  stuur.update();
});
await pagina.waitForTimeout(200);
await pagina.screenshot({ path: join(ROOT, 'docs/terreinbouwer.png') });
console.log('  schermafbeelding → docs/terreinbouwer.png');

await browser.close();
server.close();

console.log(mislukt === 0 ? '\nalles goed' : `\n${mislukt} toetsen mislukt`);
process.exitCode = mislukt === 0 ? 0 : 1;
