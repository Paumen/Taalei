/**
 * De terreinbouwer: een raster, een palet en een controle die meeloopt.
 *
 * Deze module is het scherm — het raster tekenen, de muis vertalen, de modellen
 * inladen. De regels staan in aansluiting.js en de vormen in
 * kits/modulair-terrein/aansluitingen.json; hier wordt niets over stukken
 * verondersteld wat daar niet in staat.
 *
 * Draaien: `node tools/terreinbouwer/serve.mjs` en dan de genoemde URL openen.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  Kit, Bouwsel, controleer, watPast, draaiVak, ZIJDEN, STAP, TEGENOVER,
} from './aansluiting.js';

/* Relatief aan deze module, niet aan de wortel van de server: de gepubliceerde
 * site staat onder /Taalei/ en een absoluut pad zou daar naast de repo grijpen. */
const KITMAP = new URL('../../kits/modulair-terrein/', import.meta.url).href;

/* -- kit inladen ----------------------------------------------------------- */

const kit = new Kit(await (await fetch(`${KITMAP}aansluitingen.json`)).json());
const VAK = kit.vak;
const LAAG = kit.laagHoogte;
const bouwsel = new Bouwsel(kit);

/* -- scène ----------------------------------------------------------------- */

const doek = document.getElementById('doek');
const renderer = new THREE.WebGLRenderer({ canvas: doek, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8e4da);
scene.add(new THREE.HemisphereLight(0xffffff, 0x887766, 1.4));
const zon = new THREE.DirectionalLight(0xffffff, 1.5);
zon.position.set(4, 8, 5);
scene.add(zon);

const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 200);
camera.position.set(5, 4.5, 6);

const stuur = new OrbitControls(camera, renderer.domElement);
stuur.target.set(0, 0.4, 0);
stuur.maxPolarAngle = Math.PI / 2 - 0.02; // niet onder de grond kijken
stuur.update();

/**
 * De tekenbuffer op de maat van het doek brengen.
 *
 * Meet het doek zelf en niet zijn ouder: op een smal scherm staat de balk
 * boven het doek in plaats van eroverheen, en dan is de ouder hoger dan waar
 * er getekend wordt. Op een breed scherm komt het op hetzelfde neer.
 */
function pasMaatAan() {
  const kader = doek.getBoundingClientRect();
  const b = Math.max(1, Math.round(kader.width));
  const h = Math.max(1, Math.round(kader.height));
  renderer.setSize(b, h, false);
  camera.aspect = b / h;
  camera.updateProjectionMatrix();
}

addEventListener('resize', pasMaatAan);

/* Niet elke maatverandering is een venstermaatverandering: de balk breekt af
 * zodra hij niet meer past, en het doek krimpt mee zonder dat het venster iets
 * doet. Zonder dit blijft de tekenbuffer dan op de oude maat staan en wijst een
 * tik het verkeerde vak aan. */
new ResizeObserver(pasMaatAan).observe(doek);
pasMaatAan();

/* -- raster ---------------------------------------------------------------- */

/**
 * Het raster loopt langs de vakranden, niet door de vakmiddens: een 1×1-stuk
 * staat op x,z ∈ [-0,25 … 0,25], dus de lijnen liggen op 0,25 + k · 0,5.
 */
const RASTER_VAKKEN = 24;

function maakRaster() {
  const punten = [];
  const eind = (RASTER_VAKKEN / 2) * VAK;
  for (let k = -RASTER_VAKKEN / 2; k <= RASTER_VAKKEN / 2; k++) {
    const p = k * VAK - VAK / 2;
    punten.push(p, 0, -eind - VAK / 2, p, 0, eind - VAK / 2);
    punten.push(-eind - VAK / 2, 0, p, eind - VAK / 2, 0, p);
  }
  const meetkunde = new THREE.BufferGeometry();
  meetkunde.setAttribute('position', new THREE.Float32BufferAttribute(punten, 3));
  return new THREE.LineSegments(meetkunde, new THREE.LineBasicMaterial({
    color: 0xb3ab99, transparent: true, opacity: 0.7,
  }));
}

const raster = maakRaster();
scene.add(raster);

/* -- modellen -------------------------------------------------------------- */

const lader = new GLTFLoader();
const wachtend = new Map();

function haalModel(naam) {
  if (!wachtend.has(naam)) {
    wachtend.set(naam, new Promise((klaar, mis) => {
      lader.load(`${KITMAP}${naam}.glb`, (gltf) => klaar(gltf.scene), undefined, mis);
    }));
  }
  return wachtend.get(naam);
}

/** Waar een stuk in de wereld staat. Het model draagt zijn eigen oorsprong. */
function zetNeer(object, { x, z, laag, slagen }) {
  object.position.set(x * VAK, laag * LAAG, z * VAK);
  object.rotation.y = slagen * Math.PI / 2;
}

const stukken = new THREE.Group();
scene.add(stukken);
const objectVan = new Map(); // stukId → THREE.Object3D

async function tekenStuk(stuk) {
  const object = (await haalModel(stuk.naam)).clone(true);
  zetNeer(object, stuk);
  object.userData.stukId = stuk.id;
  objectVan.set(stuk.id, object);
  stukken.add(object);
}

function wisStuk(id) {
  const object = objectVan.get(id);
  if (!object) return;
  stukken.remove(object);
  objectVan.delete(id);
}

/* -- naden tekenen ---------------------------------------------------------
 * Het sterkste antwoord op "waarom past dit niet" is de naad zelf laten zien.
 * De profielen in aansluitingen.json zijn echte lijnstukken in het vlak van de
 * vakrand, dus ze zijn zonder omrekenen terug te leggen waar ze vandaan komen.
 */

/** Buitennormaal en leesrichting per zijde — dezelfde als in aansluitingen.mjs. */
const ZIJ_ASSEN = {
  n: { normaal: [0, 0, -1], langs: [-1, 0, 0] },
  o: { normaal: [1, 0, 0], langs: [0, 0, -1] },
  z: { normaal: [0, 0, 1], langs: [1, 0, 0] },
  w: { normaal: [-1, 0, 0], langs: [0, 0, 1] },
};

/** De lijnstukken van een randprofiel, in wereldcoördinaten. */
function naadPunten(randId, x, z, laag, zijde) {
  const vorm = kit.randen[randId]?.vorm ?? [];
  const { normaal, langs } = ZIJ_ASSEN[zijde];
  const punten = [];

  for (const [a1, b1, a2, b2] of vorm) {
    for (const [a, b] of [[a1, b1], [a2, b2]]) {
      punten.push(
        x * VAK + normaal[0] * VAK / 2 + langs[0] * a,
        laag * LAAG + b,
        z * VAK + normaal[2] * VAK / 2 + langs[2] * a,
      );
    }
  }
  return punten;
}

function maakLijnen(kleur, breedte = 1) {
  const lijn = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: kleur, linewidth: breedte, depthTest: false, transparent: true }),
  );
  lijn.renderOrder = 5;
  scene.add(lijn);
  return lijn;
}

const naadFout = maakLijnen(0xc0392b);
const naadGoed = maakLijnen(0x3d7a3d);

function vulLijnen(lijn, punten) {
  lijn.geometry.dispose();
  const meetkunde = new THREE.BufferGeometry();
  meetkunde.setAttribute('position', new THREE.Float32BufferAttribute(punten, 3));
  lijn.geometry = meetkunde;
  lijn.visible = punten.length > 0;
}

/* -- schaduwstuk ----------------------------------------------------------
 * Het stuk onder de muis, voordat het geplaatst is. Groen als het past, rood
 * als het dat niet doet — dat is de controle die de opdracht vraagt, maar dan
 * vóór in plaats van ná het neerzetten.
 */

const SCHADUW_GOED = new THREE.MeshLambertMaterial({
  color: 0x4c8f4c, transparent: true, opacity: 0.55, depthWrite: false,
});
const SCHADUW_FOUT = new THREE.MeshLambertMaterial({
  color: 0xc0392b, transparent: true, opacity: 0.55, depthWrite: false,
});

let schaduw = null;
let schaduwNaam = null;

async function zetSchaduw(naam) {
  if (schaduwNaam === naam) return;
  schaduwNaam = naam;
  if (schaduw) { scene.remove(schaduw); schaduw = null; }
  if (!naam) return;

  const object = (await haalModel(naam)).clone(true);
  object.traverse((k) => { if (k.isMesh) k.material = SCHADUW_GOED; });
  if (schaduwNaam !== naam) return; // ondertussen alweer iets anders gekozen
  schaduw = object;
  scene.add(object);
  // Anders blijft er op een aanraakscherm een doorschijnend stuk op de
  // oorsprong staan: daar komt geen muis langs die hem verderop zet.
  werkSchaduwBij();
}

/* -- stand ----------------------------------------------------------------- */

const stand = {
  penseel: null,
  slagen: 0,
  laag: 0,
  hover: null,
  gekozen: null, // id van een geplaatst stuk
  verkennerZijde: 'n',
  toonNaden: true,
  /* plaatsen, kiezen of weghalen. Bestaat omdat shift en de rechtermuisknop
   * niet overal bestaan: op een aanraakscherm is er geen tweede knop en geen
   * toetsenbord, en dan is een knop op het scherm het enige wat overblijft. */
  modus: 'plaats',
};

/* -- wenk -----------------------------------------------------------------
 * De regel over het raster die zegt wat je nu moet doen. Verdwijnt zodra er een
 * stuk gekozen is, want dan spreekt de rest voor zich.
 */

const wenkBalk = document.getElementById('wenk');
let wenkKlok = null;

function wenkOp(tekst = null) {
  clearTimeout(wenkKlok);
  if (tekst) {
    wenkBalk.textContent = tekst;
    wenkBalk.hidden = false;
    wenkBalk.dataset.let = 'ja';
    wenkKlok = setTimeout(() => wenkOp(), 2600);
    return;
  }
  delete wenkBalk.dataset.let;
  if (stand.penseel) {
    wenkBalk.hidden = true;
    return;
  }
  wenkBalk.hidden = false;
  wenkBalk.textContent = 'Kies een stuk uit de lijst — en tik dan op het raster.';
}

/* -- controle tonen -------------------------------------------------------- */

const meldingBak = document.getElementById('meldingen');
const standTekst = document.getElementById('stand');

function toonControle() {
  const meldingen = controleer(bouwsel);
  const fouten = meldingen.filter((m) => m.ernst === 'fout').length;

  standTekst.textContent = bouwsel.stukken.size === 0
    ? 'leeg'
    : `${bouwsel.stukken.size} stukken · ${fouten} fouten · ${meldingen.length - fouten} waarschuwingen`;

  meldingBak.replaceChildren();
  if (meldingen.length === 0) {
    const p = document.createElement('p');
    p.className = 'geen-meldingen';
    p.textContent = bouwsel.stukken.size === 0 ? 'Nog niets geplaatst.' : 'Alles sluit aan.';
    meldingBak.append(p);
  }

  for (const melding of meldingen) {
    const knop = document.createElement('button');
    knop.type = 'button';
    knop.className = 'melding';
    knop.dataset.ernst = melding.ernst;
    const soort = document.createElement('span');
    soort.className = 'melding-soort';
    soort.textContent = melding.soort;
    knop.append(soort, document.createTextNode(melding.tekst));
    knop.addEventListener('click', () => {
      stuur.target.set(melding.plek.x * VAK, melding.plek.laag * LAAG + 0.25, melding.plek.z * VAK);
      stuur.update();
      kies(melding.stukken[0]);
    });
    meldingBak.append(knop);
  }

  /* De naden van alle meldingen die er één aanwijzen, in rood. */
  const punten = [];
  for (const melding of meldingen) {
    if (melding.soort !== 'naad') continue;
    const { x, z, laag, zijde, randen } = melding.plek;
    for (const [i, rand] of randen.entries()) {
      if (!rand) continue;
      const kant = i === 0 ? zijde : TEGENOVER[zijde];
      const [dx, dz] = i === 0 ? [0, 0] : STAP[zijde];
      punten.push(...naadPunten(rand, x + dx, z + dz, laag, kant));
    }
  }
  vulLijnen(naadFout, punten);
}

/* -- naden van het gekozen stuk -------------------------------------------- */

function toonEigenNaden() {
  if (!stand.toonNaden || !stand.gekozen || !bouwsel.stukken.has(stand.gekozen)) {
    vulLijnen(naadGoed, []);
    return;
  }
  const stuk = bouwsel.stukken.get(stand.gekozen);
  const punten = [];
  for (const vak of kit.vakkenVan(stuk.naam, stuk.x, stuk.z, stuk.slagen)) {
    for (const zijde of ZIJDEN) {
      const rand = kit.randVan(stuk.naam, vak.lokaal, zijde, stuk.slagen);
      if (!rand) continue;
      punten.push(...naadPunten(rand, vak.wereld[0], vak.wereld[1], stuk.laag, zijde));
    }
  }
  vulLijnen(naadGoed, punten);
}

/* -- palet ----------------------------------------------------------------- */

const paletBak = document.getElementById('palet');
const filterBak = document.getElementById('filters');
const zoekVeld = document.getElementById('zoek');
const penseelUit = document.getElementById('penseel');

const families = [...new Set(kit.data.modellen.map((m) => m.familie))].sort();
let familieFilter = null;

document.getElementById('kit-tel').textContent =
  `${kit.data.modellen.length} stukken · ${Object.keys(kit.randen).length} randprofielen`;

for (const familie of ['alles', ...families]) {
  const knop = document.createElement('button');
  knop.type = 'button';
  knop.textContent = familie;
  knop.setAttribute('aria-pressed', String(familie === 'alles'));
  knop.addEventListener('click', () => {
    familieFilter = familie === 'alles' ? null : familie;
    for (const k of filterBak.children) k.setAttribute('aria-pressed', String(k === knop));
    vulPalet();
  });
  filterBak.append(knop);
}

function maakStukKnop(model, bijschrift, bijKlik) {
  const knop = document.createElement('button');
  knop.type = 'button';
  knop.className = 'stuk';
  knop.setAttribute('role', 'option');
  knop.setAttribute('aria-selected', 'false');
  knop.draggable = true;
  knop.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', model.naam);
    bijKlik();
  });

  const naam = document.createElement('span');
  naam.className = 'stuk-naam';
  naam.textContent = model.naam;
  const maat = document.createElement('span');
  maat.className = 'stuk-maat';
  maat.textContent = bijschrift;

  knop.append(naam, maat);
  knop.addEventListener('click', bijKlik);
  return knop;
}

function vulPalet() {
  const zoek = zoekVeld.value.trim().toLowerCase();
  paletBak.replaceChildren();

  for (const model of kit.data.modellen) {
    if (familieFilter && model.familie !== familieFilter) continue;
    if (zoek && !model.naam.toLowerCase().includes(zoek)) continue;

    const knop = maakStukKnop(model, `${model.vakken[0]}×${model.vakken[1]}`, () => {
      stand.penseel = model.naam;
      penseelUit.textContent = model.naam;
      zetSchaduw(model.naam);
      zetModus('plaats'); // net iets gekozen: dan wil je plaatsen, niet weghalen
      wenkOp();
      for (const k of paletBak.children) k.setAttribute('aria-selected', 'false');
      knop.setAttribute('aria-selected', 'true');
    });
    if (model.naam === stand.penseel) knop.setAttribute('aria-selected', 'true');
    paletBak.append(knop);
  }
}

zoekVeld.addEventListener('input', vulPalet);
vulPalet();

/* -- verkenner -------------------------------------------------------------
 * "Wat past hier tegenaan" is de vraag waar het pakket om draait, en hij is met
 * de gemeten profielen in één keer te beantwoorden: zoek elk stuk in elke
 * draaistand waarvan het profiel het spiegelbeeld is. Klikken zet het meteen
 * neer, zodat het antwoord ook te zien is en niet alleen te lezen.
 */

const verkennerBak = document.getElementById('verkenner');
const verkennerLijst = document.getElementById('verkenner-lijst');
const verkennerUitleg = document.getElementById('verkenner-uitleg');

function kies(id) {
  stand.gekozen = bouwsel.stukken.has(id) ? id : null;
  toonEigenNaden();
  vulVerkenner();
}

function vulVerkenner() {
  if (!stand.gekozen) {
    verkennerBak.hidden = true;
    return;
  }
  verkennerBak.hidden = false;
  const stuk = bouwsel.stukken.get(stand.gekozen);

  /* Per zijde het buitenste vak van het gekozen stuk; daar wordt tegenaan
   * gepast. Bij een stuk van meer dan één vak breed is dat het eerste vak van
   * die zijde — het staat erbij, zodat duidelijk is waar het antwoord over
   * gaat. */
  const vakken = kit.vakkenVan(stuk.naam, stuk.x, stuk.z, stuk.slagen);
  const keuzes = [];
  for (const zijde of ZIJDEN) {
    for (const vak of vakken) {
      const rand = kit.randVan(stuk.naam, vak.lokaal, zijde, stuk.slagen);
      if (rand === null) continue;
      keuzes.push({ zijde, vak, rand });
      break;
    }
  }

  const nu = keuzes.find((k) => k.zijde === stand.verkennerZijde) ?? keuzes[0];
  verkennerLijst.replaceChildren();

  const knoppen = document.createElement('div');
  knoppen.className = 'filters';
  for (const keuze of keuzes) {
    const knop = document.createElement('button');
    knop.type = 'button';
    knop.textContent = { n: 'noord', o: 'oost', z: 'zuid', w: 'west' }[keuze.zijde];
    knop.setAttribute('aria-pressed', String(keuze === nu));
    knop.addEventListener('click', () => { stand.verkennerZijde = keuze.zijde; vulVerkenner(); });
    knoppen.append(knop);
  }
  verkennerBak.querySelector('.filters')?.remove();
  verkennerBak.insertBefore(knoppen, verkennerLijst);

  if (!nu) {
    verkennerUitleg.textContent = 'Dit stuk heeft geen buitenzijden.';
    return;
  }

  const passend = watPast(kit, nu.rand, TEGENOVER[nu.zijde]);
  const spiegel = kit.randen[nu.rand].spiegel;
  verkennerUitleg.textContent = spiegel
    ? `${stuk.naam} · rand ${nu.rand} → er past ${spiegel} tegenaan (${passend.length} mogelijkheden)`
    : `${stuk.naam} · rand ${nu.rand} → hier past niets in deze kit tegenaan`;

  const [dx, dz] = STAP[nu.zijde];
  const doelVak = [nu.vak.wereld[0] + dx, nu.vak.wereld[1] + dz];

  for (const kandidaat of passend.slice(0, 120)) {
    const model = kit.model(kandidaat.naam);
    const knop = maakStukKnop(model, `${kandidaat.slagen * 90}°`, () => {
      // Het passende vak van de kandidaat moet ín het buurvak terechtkomen;
      // zijn oorsprong ligt dus zoveel verderop als dat vak van hem af ligt.
      const [lu, lv] = kandidaat.lokaal.split(',').map(Number);
      const [du, dv] = draaiVak([lu, lv], kandidaat.slagen);
      plaats({
        naam: kandidaat.naam,
        x: doelVak[0] - du,
        z: doelVak[1] - dv,
        laag: stuk.laag,
        slagen: kandidaat.slagen,
      });
    });
    verkennerLijst.append(knop);
  }
}

/* -- plaatsen en weghalen -------------------------------------------------- */

async function plaats(stukGegevens) {
  const stuk = bouwsel.zet(stukGegevens);
  await tekenStuk(stuk);
  toonControle();
  toonEigenNaden();
  return stuk;
}

function haalWeg(id) {
  bouwsel.haalWeg(id);
  wisStuk(id);
  if (stand.gekozen === id) stand.gekozen = null;
  toonControle();
  toonEigenNaden();
  vulVerkenner();
}

/* -- muis ------------------------------------------------------------------ */

const straal = new THREE.Raycaster();
const muis = new THREE.Vector2();
const werkvlak = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raakpunt = new THREE.Vector3();

function vakOnderMuis(gebeurtenis) {
  const kader = renderer.domElement.getBoundingClientRect();
  muis.x = ((gebeurtenis.clientX - kader.left) / kader.width) * 2 - 1;
  muis.y = -((gebeurtenis.clientY - kader.top) / kader.height) * 2 + 1;
  straal.setFromCamera(muis, camera);

  werkvlak.constant = -stand.laag * LAAG;
  if (!straal.ray.intersectPlane(werkvlak, raakpunt)) return null;
  return [Math.round(raakpunt.x / VAK), Math.round(raakpunt.z / VAK)];
}

/**
 * Zet het schaduwstuk op het vak onder de muis en kleurt het naar wat de
 * controle ervan zegt.
 *
 * De controle wordt niet nagebootst maar echt gedraaid: het stuk gaat er even
 * in, controleer() loopt eroverheen, en het gaat er weer uit. Zo kan de
 * voorspelling nooit uit de pas lopen met wat er ná het plaatsen gemeld wordt.
 */
function werkSchaduwBij() {
  if (!schaduw || !stand.hover || !stand.penseel) {
    if (schaduw) schaduw.visible = false;
    return;
  }
  schaduw.visible = true;
  const proef = { naam: stand.penseel, x: stand.hover[0], z: stand.hover[1], laag: stand.laag, slagen: stand.slagen };
  zetNeer(schaduw, proef);

  const stuk = bouwsel.zet(proef);
  const raakt = controleer(bouwsel).filter((m) => m.stukken.includes(stuk.id));
  bouwsel.haalWeg(stuk.id);

  const materiaal = raakt.length ? SCHADUW_FOUT : SCHADUW_GOED;
  schaduw.traverse((k) => { if (k.isMesh) k.material = materiaal; });
}

/**
 * Hoeveel de aanwijzer tussen neer en op mag verschuiven en het nog een tik
 * heten.
 *
 * Zonder deze grens plaatst elke poging om de camera te draaien een stuk: het
 * indrukken is voor de baanbesturing het begin van een sleep en voor de bouwer
 * het neerzetten van een tegel. Op een aanraakscherm is dat geen randgeval maar
 * de normale gang van zaken — daar is slepen de énige manier om rond te kijken.
 * Acht beeldpunten is ruim genoeg voor een trillende vinger en ruim te weinig
 * voor een bedoelde sleep.
 */
const TIK_SPELING = 8;

let neer = null;

renderer.domElement.addEventListener('pointermove', (e) => {
  // Een aanraakscherm kent geen zweven: daar zou de schaduw pas verspringen
  // tijdens het slepen, precies wanneer je hem niet wilt zien.
  if (e.pointerType !== 'mouse') return;
  const vak = vakOnderMuis(e);
  if (!vak) return;
  if (stand.hover && vak[0] === stand.hover[0] && vak[1] === stand.hover[1]) return;
  stand.hover = vak;
  werkSchaduwBij();
});

renderer.domElement.addEventListener('pointerdown', (e) => {
  neer = { x: e.clientX, y: e.clientY, id: e.pointerId };
});

renderer.domElement.addEventListener('pointercancel', () => { neer = null; });

renderer.domElement.addEventListener('pointerup', (e) => {
  const begin = neer;
  neer = null;
  if (!begin || begin.id !== e.pointerId) return;
  if (Math.hypot(e.clientX - begin.x, e.clientY - begin.y) > TIK_SPELING) return; // gedraaid, niet getikt
  if (e.button !== 0 && e.pointerType === 'mouse') return;

  const vak = vakOnderMuis(e);
  if (!vak) return;

  /* Zonder muis is de tik zelf het aanwijzen: schuif de schaduw mee, zodat er
   * ook op een aanraakscherm te zien is wáár het volgende stuk terechtkomt en
   * of het daar past. */
  if (e.pointerType !== 'mouse') {
    stand.hover = vak;
    werkSchaduwBij();
  }

  const bewoners = bouwsel.op(vak[0], vak[1], stand.laag);

  /* Met een muis binnen handbereik zijn de sneltoetsen prettiger dan het
   * omschakelen van de modus; zonder muis zijn ze onbereikbaar. Vandaar
   * allebei, met de toetsen als voorrang op de modus. */
  const modus = e.shiftKey ? 'weg' : (e.ctrlKey || e.metaKey) ? 'kies' : stand.modus;

  if (modus === 'weg') {
    for (const b of bewoners) haalWeg(b.id);
    return;
  }
  if (modus === 'kies' || !stand.penseel) {
    if (bewoners.length) kies(bewoners[0].id);
    else if (!stand.penseel) wenkOp('Kies eerst een stuk uit de lijst.');
    return;
  }
  plaats({ naam: stand.penseel, x: vak[0], z: vak[1], laag: stand.laag, slagen: stand.slagen });
});

renderer.domElement.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const vak = vakOnderMuis(e);
  if (!vak) return;
  const bewoners = bouwsel.op(vak[0], vak[1], stand.laag);
  if (bewoners.length) kies(bewoners[0].id);
});

/* -- slepen ----------------------------------------------------------------
 * Voor wie een stuk uit de lijst naar het raster trekt in plaats van te tikken.
 * Werkt alleen met een muis — een aanraakscherm stuurt geen sleepgebeurtenissen
 * — dus het is een extra weg, nooit de enige.
 */

renderer.domElement.addEventListener('dragover', (e) => {
  if (!stand.penseel) return;
  e.preventDefault(); // pas hierna mag er losgelaten worden
  const vak = vakOnderMuis(e);
  if (!vak) return;
  stand.hover = vak;
  werkSchaduwBij();
});

renderer.domElement.addEventListener('drop', (e) => {
  e.preventDefault();
  const naam = e.dataTransfer?.getData('text/plain') || stand.penseel;
  if (!naam || !kit.modellen.has(naam)) return;
  const vak = vakOnderMuis(e);
  if (!vak) return;
  plaats({ naam, x: vak[0], z: vak[1], laag: stand.laag, slagen: stand.slagen });
});

/* -- bediening ------------------------------------------------------------- */

const laagUit = document.getElementById('laag-nu');
const draaiUit = document.getElementById('draai-nu');

function zetLaag(nieuw) {
  stand.laag = Math.max(0, nieuw);
  laagUit.textContent = String(stand.laag);
  raster.position.y = stand.laag * LAAG;
  werkSchaduwBij();
}

function zetDraai(nieuw) {
  stand.slagen = ((nieuw % 4) + 4) % 4;
  draaiUit.textContent = `${stand.slagen * 90}°`;
  werkSchaduwBij();
}

const modusBak = document.getElementById('modus');

function zetModus(nieuw) {
  stand.modus = nieuw;
  for (const knop of modusBak.children) {
    knop.setAttribute('aria-pressed', String(knop.dataset.modus === nieuw));
  }
}

for (const knop of modusBak.children) {
  knop.addEventListener('click', () => zetModus(knop.dataset.modus));
}

document.getElementById('laag-min').addEventListener('click', () => zetLaag(stand.laag - 1));
document.getElementById('laag-plus').addEventListener('click', () => zetLaag(stand.laag + 1));
document.getElementById('draai').addEventListener('click', () => zetDraai(stand.slagen + 1));

document.getElementById('toon-raster').addEventListener('change', (e) => {
  raster.visible = e.target.checked;
});
document.getElementById('toon-naden').addEventListener('change', (e) => {
  stand.toonNaden = e.target.checked;
  toonEigenNaden();
});

addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea')) return;
  if (e.key === 'r' || e.key === 'R') zetDraai(stand.slagen + 1);
  if (e.key === 'e' || e.key === 'E') zetLaag(stand.laag + 1);
  if (e.key === 'q' || e.key === 'Q') zetLaag(stand.laag - 1);
  if ((e.key === 'Delete' || e.key === 'Backspace') && stand.gekozen) haalWeg(stand.gekozen);
});

/* -- bewaren en openen ----------------------------------------------------- */

const BEWAARSLEUTEL = 'terreinbouwer-bouwsel';

document.getElementById('bewaar').addEventListener('click', () => {
  const json = JSON.stringify(bouwsel.naarJson(), null, 1);
  localStorage.setItem(BEWAARSLEUTEL, json);
  const blob = new Blob([json], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'bouwsel.json';
  link.click();
  URL.revokeObjectURL(link.href);
});

const bestandVeld = document.getElementById('bestand');
document.getElementById('laad').addEventListener('click', () => bestandVeld.click());
bestandVeld.addEventListener('change', async () => {
  const bestand = bestandVeld.files[0];
  if (!bestand) return;
  await openBouwsel(JSON.parse(await bestand.text()));
  bestandVeld.value = '';
});

document.getElementById('leeg').addEventListener('click', () => openBouwsel({ stukken: [] }));

async function openBouwsel(json) {
  for (const id of [...bouwsel.stukken.keys()]) { bouwsel.haalWeg(id); wisStuk(id); }
  stand.gekozen = null;
  for (const stuk of json.stukken ?? []) await plaats(stuk);
  toonControle();
  vulVerkenner();
}

const bewaard = localStorage.getItem(BEWAARSLEUTEL);
if (bewaard) await openBouwsel(JSON.parse(bewaard));

/* -- draaien --------------------------------------------------------------- */

toonControle();
wenkOp();
renderer.setAnimationLoop(() => {
  stuur.update();
  renderer.render(scene, camera);
});

// Voor tools/toets-terreinbouwer.mjs, dat de pagina in een echte browser
// nakijkt: zonder haak zou het alleen kunnen zien dát er iets tekent.
window.TERREINBOUWER = { kit, bouwsel, stand, controleer, plaats, haalWeg, scene, stukken, camera, stuur, renderer };
window.KLAAR = true;
