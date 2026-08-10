
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const KITMAP = new URL('../../kits/modulair-terrein/', import.meta.url).href;

const VERSIE = new URL(import.meta.url).searchParams.get('v');
const vers = (adres) => (VERSIE ? `${adres}?v=${VERSIE}` : adres);

const {
  Kit, Bouwsel, naden, naadSleutel, vormSleutel, STAP,
} = await import(vers('./aansluiting.js'));

const kit = new Kit(await (await fetch(vers(`${KITMAP}aansluitingen.json`))).json());
const voorbeelden = (await (await fetch(vers('./bouwsels.json'))).json()).bouwsels;
const VAK = kit.vak;
const LAAG = kit.laagHoogte;
const bouwsel = new Bouwsel(kit);

const doek = document.getElementById('doek');
const renderer = new THREE.WebGLRenderer({ canvas: doek, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8e4da);
scene.add(new THREE.HemisphereLight(0xffffff, 0x887766, 1.4));
const zon = new THREE.DirectionalLight(0xffffff, 1.5);
zon.position.set(4, 8, 5);
scene.add(zon);

const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);
camera.position.set(3.2, 2.8, 3.8);

const stuur = new OrbitControls(camera, renderer.domElement);
stuur.target.set(0, 0.3, 0);
stuur.maxPolarAngle = Math.PI / 2 - 0.03;
stuur.minDistance = 1;
stuur.maxDistance = 20;
stuur.enableDamping = true;
stuur.dampingFactor = 0.12;
stuur.update();

function pasMaatAan() {
  const kader = doek.getBoundingClientRect();
  const b = Math.max(1, Math.round(kader.width));
  const h = Math.max(1, Math.round(kader.height));
  renderer.setSize(b, h, false);
  camera.aspect = b / h;
  camera.updateProjectionMatrix();
}

addEventListener('resize', pasMaatAan);
new ResizeObserver(pasMaatAan).observe(doek);
pasMaatAan();

const RASTER_VAKKEN = 24;

const raster = (() => {
  const punten = [];
  const eind = (RASTER_VAKKEN / 2) * VAK;
  for (let k = -RASTER_VAKKEN / 2; k <= RASTER_VAKKEN / 2; k++) {
    const p = k * VAK - VAK / 2;
    punten.push(p, 0, -eind - VAK / 2, p, 0, eind - VAK / 2);
    punten.push(-eind - VAK / 2, 0, p, eind - VAK / 2, 0, p);
  }
  const meetkunde = new THREE.BufferGeometry();
  meetkunde.setAttribute('position', new THREE.Float32BufferAttribute(punten, 3));
  const lijn = new THREE.LineSegments(meetkunde, new THREE.LineBasicMaterial({
    color: 0xb3ab99, transparent: true, opacity: 0.75,
  }));
  scene.add(lijn);
  return lijn;
})();

const wijzer = (() => {
  const h = VAK / 2;
  const p = [];
  const hoeken = [[-h, -h], [h, -h], [h, h], [-h, h]];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = hoeken[i];
    const [bx, bz] = hoeken[(i + 1) % 4];
    p.push(ax, 0, az, bx, 0, bz);
    p.push(ax, 0, az, ax, LAAG * 0.35, az);
  }
  const meetkunde = new THREE.BufferGeometry();
  meetkunde.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  const lijn = new THREE.LineSegments(meetkunde, new THREE.LineBasicMaterial({
    color: 0x2b6cb0, depthTest: false, transparent: true,
  }));
  lijn.renderOrder = 6;
  scene.add(lijn);
  return lijn;
})();

const lader = new GLTFLoader();
const wachtend = new Map();

function haalModel(naam) {
  if (!wachtend.has(naam)) {
    wachtend.set(naam, new Promise((klaar, mis) => {
      lader.load(vers(`${KITMAP}${naam}.glb`), (gltf) => klaar(gltf.scene), undefined, mis);
    }));
  }
  return wachtend.get(naam);
}

function zetNeer(object, { x, z, laag, slagen }) {
  object.position.set(x * VAK, laag * LAAG, z * VAK);
  object.rotation.y = slagen * Math.PI / 2;
}

const stukken = new THREE.Group();
scene.add(stukken);
const objectVan = new Map();

async function tekenStuk(stuk) {
  const object = (await haalModel(stuk.naam)).clone(true);
  zetNeer(object, stuk);
  objectVan.set(stuk.id, object);
  stukken.add(object);
}

function wisStuk(id) {
  const object = objectVan.get(id);
  if (!object) return;
  stukken.remove(object);
  objectVan.delete(id);
}

const ZIJ_ASSEN = {
  n: { normaal: [0, 0, -1], langs: [-1, 0, 0] },
  o: { normaal: [1, 0, 0], langs: [0, 0, -1] },
  z: { normaal: [0, 0, 1], langs: [1, 0, 0] },
  w: { normaal: [-1, 0, 0], langs: [0, 0, 1] },
};

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

function vlakPunten(vlakId, x, z, grens, slagen) {
  const r = ((slagen % 4) + 4) % 4;
  const draai = ([a, b]) => {
    let [p, q] = [a, b];
    for (let i = 0; i < r; i++) [p, q] = [q, -p];
    return [p, q];
  };
  const punten = [];
  for (const [a1, b1, a2, b2] of kit.vlakken[vlakId] ?? []) {
    for (const [a, b] of [draai([a1, b1]), draai([a2, b2])]) {
      punten.push(x * VAK + a, grens * LAAG, z * VAK + b);
    }
  }
  return punten;
}

const MARKEER_DIKTE = 0.016;

const gemarkeerd = new THREE.Group();
gemarkeerd.renderOrder = 7;
scene.add(gemarkeerd);

const markeerMateriaal = new THREE.MeshBasicMaterial({
  color: 0x1d4ed8, depthTest: false, transparent: true, opacity: 0.95,
});
const markeerVorm = new THREE.CylinderGeometry(MARKEER_DIKTE, MARKEER_DIKTE, 1, 6);

function vulStaafjes(groep, punten) {
  for (const kind of [...groep.children]) groep.remove(kind);

  const van = new THREE.Vector3();
  const tot = new THREE.Vector3();
  for (let i = 0; i + 5 < punten.length; i += 6) {
    van.set(punten[i], punten[i + 1], punten[i + 2]);
    tot.set(punten[i + 3], punten[i + 4], punten[i + 5]);
    const lengte = van.distanceTo(tot);
    if (lengte < 1e-6) continue;

    const staaf = new THREE.Mesh(markeerVorm, markeerMateriaal);
    staaf.position.copy(van).add(tot).multiplyScalar(0.5);
    staaf.scale.set(1, lengte, 1);
    staaf.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      tot.clone().sub(van).normalize(),
    );
    staaf.renderOrder = 7;
    groep.add(staaf);
  }
  groep.visible = groep.children.length > 0;
}

const SCHADUW_GOED = new THREE.MeshLambertMaterial({
  color: 0x3d7a3d, transparent: true, opacity: 0.5, depthWrite: false,
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
  if (schaduwNaam !== naam) return;
  schaduw = object;
  scene.add(object);
  werkBijAlles();
}

const stand = {
  penseel: null,
  slagen: 0,
  laag: 0,
  wijzer: [0, 0],
  kijk: null,
};

const geschiedenis = [];
const teruggedraaid = [];

const beschrijf = (s) => ({ naam: s.naam, x: s.x, z: s.z, laag: s.laag, slagen: s.slagen });

async function plaatsStuk(gegevens) {
  const stuk = bouwsel.zet(gegevens);
  await tekenStuk(stuk);
  return stuk;
}

function verwijderStuk(id) {
  bouwsel.haalWeg(id);
  wisStuk(id);
}

async function doeZet(gegevens) {
  bouwsel.noemer = '';
  const stuk = await plaatsStuk(gegevens);
  geschiedenis.push({ soort: 'zet', gegevens, id: stuk.id });
  teruggedraaid.length = 0;
  werkBijAlles();
}

function doeWeg(id) {
  const stuk = bouwsel.stukken.get(id);
  if (!stuk) return;
  const gegevens = beschrijf(stuk);
  verwijderStuk(id);
  geschiedenis.push({ soort: 'weg', gegevens, id });
  teruggedraaid.length = 0;
  werkBijAlles();
}

async function verzet(vanaf, naar, heen) {
  const stap = vanaf.pop();
  if (!stap) return;
  const moetZetten = heen ? stap.soort === 'zet' : stap.soort === 'weg';
  if (moetZetten) await plaatsStuk({ ...stap.gegevens, id: stap.id });
  else verwijderStuk(stap.id);
  naar.push(stap);
  werkBijAlles();
}

const ongedaan = () => verzet(geschiedenis, teruggedraaid, false);
const opnieuw = () => verzet(teruggedraaid, geschiedenis, true);

const OORDEELSLEUTEL = 'terrain-authoring-tool-oordelen';

const SLEUTELVORM = /^[^|]*\|(zij|rand|stapel)\|-?\d+,-?\d+,-?\d+,[nozwb] .+>.+$/;

const bewaard = Object.entries(JSON.parse(localStorage.getItem(OORDEELSLEUTEL) ?? '{}'));
const oordelen = new Map(bewaard.filter(([s]) => SLEUTELVORM.test(s)));
const vervallen = bewaard.length - oordelen.size;

function bewaarOordelen() {
  localStorage.setItem(OORDEELSLEUTEL, JSON.stringify(Object.fromEntries(oordelen)));
}

if (vervallen) bewaarOordelen();

function velOordeel(sleutel, oordeel, naad) {
  if (oordelen.get(sleutel)?.oordeel === oordeel) oordelen.delete(sleutel);
  else {
    oordelen.set(sleutel, {
      oordeel,
      soort: naad.soort,
      namen: naad.namen,
      slagen: naad.slagen,
      randen: naad.randen,
      vorm: naad.vorm,
      plek: naad.plek,
    });
  }
  bewaarOordelen();
  werkBijAlles();
}

const standKnop = document.getElementById('stand-knop');
const standTekst = document.getElementById('stand');
const zetKnop = document.getElementById('zet');
const wegKnop = document.getElementById('weg');
const ongedaanKnop = document.getElementById('ongedaan');
const opnieuwKnop = document.getElementById('opnieuw');
const penseelUit = document.getElementById('penseel');
const wenkBalk = document.getElementById('wenk');

function opWijzer() {
  const bewoners = bouwsel.op(stand.wijzer[0], stand.wijzer[1], stand.laag);
  return bewoners.length ? bouwsel.stukken.get(bewoners[bewoners.length - 1].id) : null;
}

function werkBijAlles() {
  standTekst.textContent = bouwsel.stukken.size === 0 ? 'leeg' : `${bouwsel.stukken.size} stukken`;

  wijzer.position.set(stand.wijzer[0] * VAK, stand.laag * LAAG + 0.004, stand.wijzer[1] * VAK);
  raster.position.y = stand.laag * LAAG;

  const bewoner = opWijzer();
  const proef = stand.penseel && {
    naam: stand.penseel, x: stand.wijzer[0], z: stand.wijzer[1], laag: stand.laag, slagen: stand.slagen,
  };

  if (schaduw && proef) {
    schaduw.visible = true;
    zetNeer(schaduw, proef);
    wijzer.material.color.setHex(0x2b6cb0);
  } else {
    if (schaduw) schaduw.visible = false;
    wijzer.material.color.setHex(bewoner ? 0xc07a1e : 0x2b6cb0);
  }

  zetKnop.disabled = !stand.penseel;
  wegKnop.disabled = !bewoner;
  ongedaanKnop.disabled = geschiedenis.length === 0;
  opnieuwKnop.disabled = teruggedraaid.length === 0;

  tekenGemarkeerd();
  werkKijkBalkBij();

  werkWenkBij(bewoner);
}

function werkWenkBij(bewoner) {
  if (stand.kijk) {
    wenkBalk.hidden = false;
    wenkBalk.textContent = 'De blauwe lijn is deze voeg.';
    return;
  }
  if (!stand.penseel) {
    wenkBalk.hidden = false;
    wenkBalk.textContent = 'Tik op "stuk" om er een te kiezen.';
    return;
  }
  if (bouwsel.stukken.size === 0) {
    wenkBalk.hidden = false;
    wenkBalk.textContent = 'Tik het raster om te richten, dan "Zet neer".';
    return;
  }
  if (bewoner) {
    wenkBalk.hidden = false;
    wenkBalk.textContent = bewoner.naam;
    return;
  }
  wenkBalk.hidden = true;
}

const voetGewoon = document.querySelector('.voet:not(.voet-kijk)');
const voetKijk = document.getElementById('voet-kijk');

function beginKijken(index) {
  const lijst = naden(bouwsel);
  if (lijst.length === 0) return;
  stand.kijk = { lijst, index: 0 };
  sluitBlad();
  kijkNaar(index);
}

function stopKijken() {
  stand.kijk = null;
  werkBijAlles();
}

function kijkNaar(index) {
  if (!stand.kijk) return;
  const { lijst } = stand.kijk;
  stand.kijk.index = ((index % lijst.length) + lijst.length) % lijst.length;
  const naad = lijst[stand.kijk.index];

  stand.wijzer = [naad.plek.x, naad.plek.z];
  stand.laag = naad.plek.laag;
  zetLaagUit();

  const [dx, dz] = STAP[naad.plek.zijde] ?? [0, 0];
  const mikpunt = new THREE.Vector3(
    (naad.plek.x + dx / 2) * VAK,
    naad.plek.laag * LAAG + (naad.soort === 'zij' ? 0.25 : LAAG / 2),
    (naad.plek.z + dz / 2) * VAK,
  );
  const standpunt = camera.position.clone().sub(stuur.target);
  stuur.target.copy(mikpunt);
  camera.position.copy(mikpunt).add(standpunt);
  stuur.update();

  werkBijAlles();
}

const SOORTNAAM = {
  zij: 'naast elkaar',
  rand: 'schuin erboven',
  stapel: 'op elkaar',
};

function tekenGemarkeerd() {
  if (!stand.kijk) {
    vulStaafjes(gemarkeerd, []);
    return;
  }
  const naad = stand.kijk.lijst[stand.kijk.index];
  const punten = [];
  for (const deel of naad.delen) {
    if (deel.vlak) punten.push(...vlakPunten(deel.vlak, deel.x, deel.z, naad.plek.laag + 1, deel.slagen));
    else if (deel.rand) punten.push(...naadPunten(deel.rand, deel.x, deel.z, deel.laag, deel.zijde));
  }
  vulStaafjes(gemarkeerd, punten);
}

function werkKijkBalkBij() {
  voetKijk.hidden = !stand.kijk;
  voetGewoon.hidden = !!stand.kijk;
  if (!stand.kijk) return;

  const { lijst, index } = stand.kijk;
  const naad = lijst[index];
  const nogNiet = lijst.filter((n) => !oordelen.has(n.sleutel)).length;
  const mijn = oordelen.get(naad.sleutel)?.oordeel ?? null;

  const doorKnop = document.getElementById('kijk-volgend-bouwsel');
  doorKnop.hidden = nogNiet > 0 || voorbeelden.length === 0;
  doorKnop.textContent = `Volgend: ${volgendVoorbeeld().naam} ›`;

  document.getElementById('kijk-namen').textContent = `${naad.namen[0]} ↔ ${naad.namen[1]}`;

  document.getElementById('kijk-bij').textContent =
    `voeg ${index + 1} van ${lijst.length} · nog ${nogNiet} te gaan`
    + ` · ${SOORTNAAM[naad.soort]}`;
  document.getElementById('kijk-goed').setAttribute('aria-pressed', String(mijn === 'goed'));
  document.getElementById('kijk-niet').setAttribute('aria-pressed', String(mijn === 'niet'));
}

function volgendVoorbeeld() {
  const nu = voorbeelden.findIndex((v) => v.naam === bouwsel.noemer);
  return voorbeelden[(nu + 1) % voorbeelden.length];
}

function vorigVoorbeeld() {
  const nu = voorbeelden.findIndex((v) => v.naam === bouwsel.noemer);
  const basis = nu === -1 ? 0 : nu;
  return voorbeelden[(basis - 1 + voorbeelden.length) % voorbeelden.length];
}

async function volgendBouwsel() {
  await openBouwsel(volgendVoorbeeld());
  const lijst = naden(bouwsel);
  const eerste = lijst.findIndex((n) => !oordelen.has(n.sleutel));
  if (lijst.length === 0) return;
  beginKijken(eerste === -1 ? 0 : eerste);
}

document.getElementById('kijk-volgend-bouwsel').addEventListener('click', volgendBouwsel);
document.getElementById('kijk-vorige').addEventListener('click', () => kijkNaar(stand.kijk.index - 1));
document.getElementById('kijk-volgende').addEventListener('click', () => kijkNaar(stand.kijk.index + 1));
document.getElementById('kijk-stop').addEventListener('click', stopKijken);
for (const [id, keuze] of [['kijk-goed', 'goed'], ['kijk-niet', 'niet']]) {
  document.getElementById(id).addEventListener('click', () => {
    const naad = stand.kijk.lijst[stand.kijk.index];
    const was = oordelen.get(naad.sleutel)?.oordeel;
    velOordeel(naad.sleutel, keuze, naad);
    if (was === keuze) return;
    const { lijst, index } = stand.kijk;
    for (let i = 1; i <= lijst.length; i++) {
      const kandidaat = (index + i) % lijst.length;
      if (!oordelen.has(lijst[kandidaat].sleutel)) return kijkNaar(kandidaat);
    }
    return undefined;
  });
}

const blad = document.getElementById('blad');
const bladTitel = document.getElementById('blad-titel');
const bladTabs = document.getElementById('blad-tabs');
const bladZoek = document.getElementById('blad-zoek');
const bladFilters = document.getElementById('blad-filters');
const bladInhoud = document.getElementById('blad-inhoud');
const zoekVeld = document.getElementById('zoek');

const waas = document.getElementById('waas');

function sluitBlad() {
  blad.hidden = true;
  waas.hidden = true;
}

function openBlad(titel) {
  bladTitel.textContent = titel;
  blad.hidden = false;
  waas.hidden = false;
  bladInhoud.scrollTop = 0;
}

waas.addEventListener('click', sluitBlad);

document.getElementById('blad-sluit').addEventListener('click', sluitBlad);

function maakRij(naam, bij, bijTik, gekozen = false) {
  const knop = document.createElement('button');
  knop.type = 'button';
  knop.className = 'rij';
  knop.setAttribute('aria-selected', String(gekozen));
  const links = document.createElement('span');
  links.className = 'rij-naam';
  links.textContent = naam;
  const rechts = document.createElement('span');
  rechts.className = 'rij-bij';
  rechts.textContent = bij;
  knop.append(links, rechts);
  knop.addEventListener('click', bijTik);
  return knop;
}

const families = [...new Set(kit.data.modellen.map((m) => m.familie))].sort();
let familieFilter = null;

function kiesStuk(naam) {
  stand.penseel = naam;
  penseelUit.textContent = naam;
  zetSchaduw(naam);
  sluitBlad();
  werkBijAlles();
}

function vulPalet() {
  const zoek = zoekVeld.value.trim().toLowerCase();
  bladInhoud.replaceChildren();

  const passend = kit.data.modellen.filter((m) => (
    (!familieFilter || m.familie === familieFilter)
    && (!zoek || m.naam.toLowerCase().includes(zoek))
  ));

  if (passend.length === 0) {
    const leeg = document.createElement('p');
    leeg.className = 'leeg';
    leeg.textContent = 'Geen stuk met die naam.';
    bladInhoud.append(leeg);
    return;
  }

  for (const model of passend) {
    bladInhoud.append(maakRij(
      model.naam,
      `${model.vakken[0]}×${model.vakken[1]}`,
      () => kiesStuk(model.naam),
      model.naam === stand.penseel,
    ));
  }
}

function toonPalet(tab = 'stukken') {
  openBlad(tab === 'stukken' ? 'Kies een stuk' : 'Open een bouwsel');
  bladZoek.hidden = tab !== 'stukken';
  bladTabs.replaceChildren();
  bladFilters.replaceChildren();
  bladInhoud.replaceChildren();

  for (const [sleutel, label] of [['stukken', 'Stukken'], ['bouwsels', 'Bouwsels']]) {
    const knop = document.createElement('button');
    knop.type = 'button';
    knop.textContent = label;
    knop.setAttribute('aria-pressed', String(sleutel === tab));
    knop.addEventListener('click', () => toonPalet(sleutel));
    bladTabs.append(knop);
  }

  if (tab === 'bouwsels') return vulBouwsels();

  for (const familie of ['alles', ...families]) {
    const knop = document.createElement('button');
    knop.type = 'button';
    knop.textContent = familie;
    const aan = familie === 'alles' ? familieFilter === null : familieFilter === familie;
    knop.setAttribute('aria-pressed', String(aan));
    knop.addEventListener('click', () => {
      familieFilter = familie === 'alles' ? null : familie;
      for (const k of bladFilters.children) {
        k.setAttribute('aria-pressed', String(k === knop));
      }
      vulPalet();
    });
    bladFilters.append(knop);
  }

  vulPalet();
}

function vulBouwsels() {
  const huidigeNaam = bouwsel.noemer;
  const index = voorbeelden.findIndex((v) => v.naam === huidigeNaam);

  if (voorbeelden.length > 0) {
    const stapper = document.createElement('div');
    stapper.className = 'bouwsel-stapper';

    const vorigeKnop = document.createElement('button');
    vorigeKnop.type = 'button';
    vorigeKnop.className = 'knop';
    vorigeKnop.setAttribute('aria-label', 'Vorig bouwsel');
    vorigeKnop.textContent = '‹';
    vorigeKnop.addEventListener('click', () => openBouwsel(vorigVoorbeeld(), { blijfOpen: true }));

    const stand_ = document.createElement('div');
    stand_.className = 'bouwsel-stapper-stand';
    stand_.textContent = index === -1
      ? `${voorbeelden.length} bouwsels`
      : `${index + 1} / ${voorbeelden.length} — ${huidigeNaam}`;

    const volgendeKnop = document.createElement('button');
    volgendeKnop.type = 'button';
    volgendeKnop.className = 'knop';
    volgendeKnop.setAttribute('aria-label', 'Volgend bouwsel');
    volgendeKnop.textContent = '›';
    volgendeKnop.addEventListener('click', () => openBouwsel(volgendVoorbeeld(), { blijfOpen: true }));

    stapper.append(vorigeKnop, stand_, volgendeKnop);
    bladInhoud.append(stapper);
  }

  for (const voorbeeld of voorbeelden) {
    const rij = document.createElement('button');
    rij.type = 'button';
    rij.className = 'bouwsel';
    rij.setAttribute('aria-pressed', String(voorbeeld.naam === huidigeNaam));

    const naam = document.createElement('div');
    naam.className = 'bouwsel-naam';
    naam.textContent = voorbeeld.naam;

    const bij = document.createElement('div');
    bij.className = 'bouwsel-bij';
    bij.textContent = `${voorbeeld.stukken.length} stukken — ${voorbeeld.waarover}`;

    rij.append(naam, bij);
    rij.addEventListener('click', () => openBouwsel(voorbeeld));
    bladInhoud.append(rij);
  }

  const voet = document.createElement('div');
  voet.className = 'uitleg';
  voet.innerHTML = '<p>Een bouwsel openen vervangt wat er staat en wist de '
    + 'stappen terug. Je oordelen blijven.</p>';
  bladInhoud.append(voet);
}

async function openBouwsel(voorbeeld, { blijfOpen = false } = {}) {
  for (const id of [...bouwsel.stukken.keys()]) verwijderStuk(id);
  geschiedenis.length = 0;
  teruggedraaid.length = 0;

  for (const stuk of voorbeeld.stukken) await plaatsStuk(stuk);
  bouwsel.noemer = voorbeeld.naam;

  const xen = voorbeeld.stukken.map((p) => p.x);
  const zen = voorbeeld.stukken.map((p) => p.z);
  const lagen = voorbeeld.stukken.map((p) => p.laag);
  const middenX = Math.round((Math.min(...xen) + Math.max(...xen)) / 2);
  const middenZ = Math.round((Math.min(...zen) + Math.max(...zen)) / 2);
  const spanwijdte = Math.max(
    (Math.max(...xen) - Math.min(...xen) + 1) * VAK,
    (Math.max(...zen) - Math.min(...zen) + 1) * VAK,
    (Math.max(...lagen) + 1) * LAAG,
  );
  const afstand = spanwijdte * 1.9 + 1.4;

  stand.wijzer = [middenX, middenZ];
  stand.laag = 0;
  zetLaagUit();
  stuur.target.set(middenX * VAK, Math.max(...lagen) * LAAG * 0.5, middenZ * VAK);
  camera.position.set(
    middenX * VAK + afstand * 0.62,
    afstand * 0.58,
    middenZ * VAK + afstand * 0.78,
  );
  stuur.update();

  if (blijfOpen) {
    bladInhoud.replaceChildren();
    vulBouwsels();
  } else {
    sluitBlad();
  }
  werkBijAlles();
}

zoekVeld.addEventListener('input', vulPalet);
document.getElementById('stuk-knop').addEventListener('click', () => toonPalet('stukken'));

function toonControleBlad() {
  openBlad('Voegen');
  bladZoek.hidden = true;
  bladFilters.replaceChildren();
  bladTabs.replaceChildren();
  bladInhoud.replaceChildren();
  vulCombinaties();
}

function vulCombinaties() {
  const lijst = naden(bouwsel);

  if (lijst.length === 0) {
    const p = document.createElement('p');
    p.className = 'leeg';
    p.textContent = 'Nog geen twee stukken die elkaar raken. Zet er twee naast '
      + 'elkaar; de voeg ertussen komt hier te staan.';
    bladInhoud.append(p);
    return;
  }

  const nogNiet = lijst.filter((n) => !oordelen.has(n.sleutel)).length;

  const beoordeel = document.createElement('button');
  beoordeel.type = 'button';
  beoordeel.className = 'blad-beoordeel';
  beoordeel.textContent = nogNiet
    ? `Beoordeel ze ${nogNiet === lijst.length ? 'allemaal' : `alle ${nogNiet}`} ›`
    : 'Alles beoordeeld';
  beoordeel.disabled = nogNiet === 0;
  beoordeel.addEventListener('click', () => {
    beginKijken(lijst.findIndex((n) => !oordelen.has(n.sleutel)));
  });
  bladInhoud.append(beoordeel);

  const kop = document.createElement('div');
  kop.className = 'uitleg';
  kop.innerHTML = `<p>${lijst.length} voegen, ${nogNiet} nog niet beoordeeld. `
    + 'Elke voeg staat op zichzelf: twee keer dezelfde stukken op een andere '
    + 'plek zijn twee oordelen.</p>'
    + (vervallen
      ? `<p class="kwijt">${vervallen} eerder bewaarde oordelen zijn vervallen: `
        + 'die hingen aan iets anders dan een voeg en waren niet om te rekenen.</p>'
      : '');
  bladInhoud.append(kop);

  const zijNaam = { n: 'noord', o: 'oost', z: 'zuid', w: 'west' };

  for (const [index, naad] of lijst.entries()) {
    const mijn = oordelen.get(naad.sleutel)?.oordeel ?? null;

    const rij = document.createElement('div');
    rij.className = 'combo';
    rij.dataset.oordeel = mijn ?? 'geen';

    const toon = document.createElement('button');
    toon.type = 'button';
    toon.className = 'combo-toon';

    const namen = document.createElement('div');
    namen.className = 'combo-namen';
    namen.textContent = `${naad.namen[0]}  ↔  ${naad.namen[1]}`;

    const waar = document.createElement('div');
    waar.className = 'combo-meting';
    waar.textContent = `vak ${naad.plek.x},${naad.plek.z} · laag ${naad.plek.laag} · `
      + (zijNaam[naad.plek.zijde] ?? 'boven')
      + ` · ${SOORTNAAM[naad.soort]}`;

    toon.append(namen, waar);
    toon.addEventListener('click', () => beginKijken(index));

    const knoppen = document.createElement('div');
    knoppen.className = 'combo-knoppen';
    for (const [waarde, label] of [['goed', '✓ goed'], ['niet', '✗ niet']]) {
      const knop = document.createElement('button');
      knop.type = 'button';
      knop.textContent = label;
      knop.dataset.keuze = waarde;
      knop.setAttribute('aria-pressed', String(mijn === waarde));
      knop.addEventListener('click', () => {
        velOordeel(naad.sleutel, waarde, naad);
        toonControleBlad();
      });
      knoppen.append(knop);
    }

    rij.append(toon, knoppen);

    bladInhoud.append(rij);
  }

  const voet = document.createElement('div');
  voet.className = 'uitleg';
  voet.innerHTML = `<p>${oordelen.size} voegen beoordeeld. Nog eens tikken op `
    + 'dezelfde knop trekt het oordeel in.</p>';
  const uit = document.createElement('button');
  uit.type = 'button';
  uit.className = 'blad-uit';
  uit.textContent = 'Oordelen opslaan als bestand';
  uit.addEventListener('click', exporteerOordelen);

  const in_ = document.createElement('button');
  in_.type = 'button';
  in_.className = 'blad-uit';
  in_.id = 'lees-oordelen';
  in_.textContent = 'Oordelen inlezen uit bestand';
  in_.addEventListener('click', () => kiezer.click());

  const kiezer = document.createElement('input');
  kiezer.type = 'file';
  kiezer.accept = 'application/json,.json';
  kiezer.className = 'weg';
  kiezer.addEventListener('change', () => {
    const [bestand] = kiezer.files;
    if (bestand) leesOordelen(bestand);
  });

  voet.append(uit, in_, kiezer);
  if (leesVerslag) {
    const p = document.createElement('p');
    p.className = leesVerslag.mis ? 'kwijt' : '';
    p.textContent = leesVerslag.tekst;
    voet.append(p);
  }
  bladInhoud.append(voet);
}

function exporteerOordelen() {
  const inhoud = JSON.stringify({
    kit: 'modulair-terrein',
    gemaakt: 'tools/terrain-authoring-tool/',
    toelichting: 'Per voeg — één plek in één bouwsel, met erbij wat daar tegen '
      + 'elkaar aan staat — het oordeel van wie bouwt. `meting` is wat '
      + 'aansluitingen.mjs erover zegt en is `null` waar niets te meten viel; '
      + '`oordeel` gaat voor.',
    oordelen: Object.fromEntries(oordelen),
  }, null, 1);
  const blob = new Blob([inhoud], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'combinatie-oordelen.json';
  link.click();
  URL.revokeObjectURL(link.href);
}

let leesVerslag = null;

async function leesOordelen(bestand) {
  let binnen;
  try {
    binnen = JSON.parse(await bestand.text());
  } catch (fout) {
    leesVerslag = { mis: true, tekst: `${bestand.name} is geen leesbare JSON: ${fout.message}` };
    toonControleBlad();
    return;
  }

  const rijen = Object.entries(binnen?.oordelen ?? {});
  if (rijen.length === 0) {
    leesVerslag = { mis: true, tekst: `In ${bestand.name} staat geen "oordelen" met inhoud.` };
    toonControleBlad();
    return;
  }

  let bij = 0;
  let anders = 0;
  let gelijk = 0;
  const over = [];

  for (const [sleutel, waarde] of rijen) {
    if (!SLEUTELVORM.test(sleutel) || (waarde?.oordeel !== 'goed' && waarde?.oordeel !== 'niet')) {
      over.push(sleutel);
      continue;
    }
    const had = oordelen.get(sleutel);
    if (!had) bij += 1;
    else if (had.oordeel !== waarde.oordeel) anders += 1;
    else { gelijk += 1; continue; }
    oordelen.set(sleutel, waarde);
  }

  bewaarOordelen();

  const stukjes = [`${bij} erbij`];
  if (anders) stukjes.push(`${anders} overschreven`);
  if (gelijk) stukjes.push(`${gelijk} stond er al zo`);
  if (over.length) stukjes.push(`${over.length} overgeslagen (sleutel van een oudere versie)`);
  leesVerslag = {
    mis: over.length > 0,
    tekst: `${bestand.name}: ${rijen.length} oordelen gelezen — ${stukjes.join(', ')}.`,
  };

  werkBijAlles();
  toonControleBlad();
}

standKnop.addEventListener('click', () => toonControleBlad());

const straal = new THREE.Raycaster();
const punt = new THREE.Vector2();
const werkvlak = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raakpunt = new THREE.Vector3();

function vakOnder(gebeurtenis) {
  const kader = renderer.domElement.getBoundingClientRect();
  punt.x = ((gebeurtenis.clientX - kader.left) / kader.width) * 2 - 1;
  punt.y = -((gebeurtenis.clientY - kader.top) / kader.height) * 2 + 1;
  straal.setFromCamera(punt, camera);
  werkvlak.constant = -stand.laag * LAAG;
  if (!straal.ray.intersectPlane(werkvlak, raakpunt)) return null;
  return [Math.round(raakpunt.x / VAK), Math.round(raakpunt.z / VAK)];
}

const TIK_SPELING = 12;
let neer = null;

renderer.domElement.addEventListener('pointerdown', (e) => {
  neer = { x: e.clientX, y: e.clientY, id: e.pointerId };
});
renderer.domElement.addEventListener('pointercancel', () => { neer = null; });

renderer.domElement.addEventListener('pointerup', (e) => {
  const begin = neer;
  neer = null;
  if (!begin || begin.id !== e.pointerId) return;
  if (Math.hypot(e.clientX - begin.x, e.clientY - begin.y) > TIK_SPELING) return;

  const vak = vakOnder(e);
  if (!vak) return;
  stand.wijzer = vak;
  werkBijAlles();
});

const laagUit = document.getElementById('laag-nu');
const draaiUit = document.getElementById('draai-nu');

function zetLaagUit() {
  laagUit.textContent = String(stand.laag);
}

document.getElementById('laag-min').addEventListener('click', () => {
  stand.laag = Math.max(0, stand.laag - 1);
  zetLaagUit();
  werkBijAlles();
});

document.getElementById('laag-plus').addEventListener('click', () => {
  stand.laag += 1;
  zetLaagUit();
  werkBijAlles();
});

document.getElementById('draai').addEventListener('click', () => {
  stand.slagen = (stand.slagen + 1) % 4;
  draaiUit.textContent = `${stand.slagen * 90}°`;
  werkBijAlles();
});

zetKnop.addEventListener('click', () => {
  if (!stand.penseel) return;
  doeZet({
    naam: stand.penseel, x: stand.wijzer[0], z: stand.wijzer[1], laag: stand.laag, slagen: stand.slagen,
  });
});

wegKnop.addEventListener('click', () => {
  const bewoner = opWijzer();
  if (bewoner) doeWeg(bewoner.id);
});

ongedaanKnop.addEventListener('click', ongedaan);
opnieuwKnop.addEventListener('click', opnieuw);

zetLaagUit();
werkBijAlles();

renderer.setAnimationLoop(() => {
  stuur.update();
  renderer.render(scene, camera);
});

window.TERRAIN_AUTHORING_TOOL = {
  kit, bouwsel, stand, camera, renderer, scene, stukken, stuur,
  doeZet, doeWeg, ongedaan, opnieuw, kiesStuk, versie: VERSIE,
  naden, oordelen, velOordeel, naadSleutel, vormSleutel, voorbeelden, openBouwsel,
  volgendBouwsel,
  beginKijken, kijkNaar, stopKijken,
};
window.KLAAR = true;
