/**
 * De terreinbouwer: een raster, een wijzer en een controle die meeloopt.
 *
 * Voor een telefoon geschreven, en voor niets anders. De regels staan in
 * aansluiting.js en de vormen in kits/modulair-terrein/aansluitingen.json; hier
 * wordt niets over stukken verondersteld wat daar niet in staat.
 *
 * ── De wijzer ──────────────────────────────────────────────────────────────
 *
 * Eén vak op het raster is het gerichte vak: de wijzer. Tikken verplaatst hem
 * en zet nooit iets neer. Neerzetten en weghalen gebeuren met een knop
 * onderaan.
 *
 * Dat is de kern van deze versie en het antwoord op wat er mis was. Eerst zette
 * elke tik meteen een stuk neer. Op een aanraakscherm is vegen de enige manier
 * om rond te kijken, dus wie de camera wilde draaien liet een spoor van tegels
 * achter, en wie zich vergiste moest het foute stuk opzoeken en weghalen. Nu is
 * richten gescheiden van beslissen: tik zoveel je wilt, draai zoveel je wilt,
 * en pas de knop legt iets vast. Wat de knop gaat doen is van tevoren te zien —
 * de schaduw staat op de wijzer, groen als het past en rood als het niet past.
 *
 * ── Ongedaan maken ─────────────────────────────────────────────────────────
 *
 * Bouwen is proberen, dus alles is terug te draaien. Zonder dat kost elke
 * misser een zoektocht, en dat is bij tientallen stukken geen bijzaak.
 *
 * Draaien: `node tools/terreinbouwer/serve.mjs` en dan de genoemde URL openen.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/* Relatief aan deze module, niet aan de wortel van de server: de gepubliceerde
 * site staat onder /Taalei/ en een absoluut pad zou daar naast de repo grijpen. */
const KITMAP = new URL('../../kits/modulair-terrein/', import.meta.url).href;

/**
 * De versiestempel die index.html achter dit bestand heeft gezet, doorgegeven
 * aan alles wat híér nog wordt opgehaald (zie tools/terreinbouwer/stempel.mjs).
 *
 * Anders lekt de stempel: index.html haalt een nieuwe bouwer.js op omdat het
 * adres veranderd is, en die laadt daarna de oude aansluiting.js van een adres
 * dat níét veranderd is. Vandaar dat de import hier dynamisch is — een gewone
 * import kan geen adres meekrijgen zonder bouwstap.
 */
const VERSIE = new URL(import.meta.url).searchParams.get('v');
const vers = (adres) => (VERSIE ? `${adres}?v=${VERSIE}` : adres);

const {
  Kit, Bouwsel, controleer, watPast, draaiVak, naden, naadSleutel, vormSleutel,
  ZIJDEN, STAP, TEGENOVER,
} = await import(vers('./aansluiting.js'));

const kit = new Kit(await (await fetch(vers(`${KITMAP}aansluitingen.json`))).json());
const voorbeelden = (await (await fetch(vers('./bouwsels.json'))).json()).bouwsels;
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

const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);
camera.position.set(3.2, 2.8, 3.8);

const stuur = new OrbitControls(camera, renderer.domElement);
stuur.target.set(0, 0.3, 0);
stuur.maxPolarAngle = Math.PI / 2 - 0.03; // niet onder de grond kijken
stuur.minDistance = 1;
stuur.maxDistance = 20;
stuur.enableDamping = true;
stuur.dampingFactor = 0.12;
stuur.update();

/**
 * De tekenbuffer op de maat van het doek brengen.
 *
 * Meet het doek zelf, niet zijn ouder, en kijk mee met een ResizeObserver: op
 * een telefoon verandert de hoogte ook zonder dat het venster iets doet — de
 * adresbalk schuift weg, het toetsenbord komt op. Blijft de buffer dan op de
 * oude maat staan, dan wijst een tik het verkeerde vak aan.
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
new ResizeObserver(pasMaatAan).observe(doek);
pasMaatAan();

/* -- raster ---------------------------------------------------------------- */

/**
 * Het raster loopt langs de vakranden, niet door de vakmiddens: een 1×1-stuk
 * staat op x,z ∈ [-0,25 … 0,25], dus de lijnen liggen op 0,25 + k · 0,5.
 */
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

/**
 * De wijzer: een dik vierkant om het gerichte vak, plus vier hoekstreepjes
 * omhoog zodat hij ook zichtbaar is als er al iets in dat vak staat.
 */
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

/* -- modellen -------------------------------------------------------------- */

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

/** Waar een stuk in de wereld staat. Het model draagt zijn eigen oorsprong. */
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

const naadFout = (() => {
  const lijn = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0xc0392b, depthTest: false, transparent: true }),
  );
  lijn.renderOrder = 5;
  scene.add(lijn);
  return lijn;
})();

/** De voeg die je op dit moment staat te bekijken, fel en bovenop alles. */
const gemarkeerd = (() => {
  const lijn = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0x2b6cb0, depthTest: false, transparent: true }),
  );
  lijn.renderOrder = 7;
  scene.add(lijn);
  return lijn;
})();

function vulLijnen(lijn, punten) {
  lijn.geometry.dispose();
  const meetkunde = new THREE.BufferGeometry();
  meetkunde.setAttribute('position', new THREE.Float32BufferAttribute(punten, 3));
  lijn.geometry = meetkunde;
  lijn.visible = punten.length > 0;
}

/* -- schaduw --------------------------------------------------------------- */

const SCHADUW_GOED = new THREE.MeshLambertMaterial({
  color: 0x3d7a3d, transparent: true, opacity: 0.5, depthWrite: false,
});
const SCHADUW_FOUT = new THREE.MeshLambertMaterial({
  color: 0xc0392b, transparent: true, opacity: 0.5, depthWrite: false,
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
  werkBijAlles();
}

/* -- stand ----------------------------------------------------------------- */

const stand = {
  penseel: null,
  slagen: 0,
  laag: 0,
  wijzer: [0, 0],
  /* Welke combinatie je staat te bekijken, en de hoeveelste voeg ervan.
   * `null` betekent gewoon bouwen. */
  kijk: null,
};

/* -- geschiedenis ----------------------------------------------------------
 * Wát er stond wordt onthouden, niet welk stuk het was: bij het terugzetten
 * komt er een nieuw stuk met een nieuw nummer, en dat wordt hier bijgewerkt
 * zodat een volgende stap nog steeds het goede stuk te pakken heeft.
 */

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
  const stuk = await plaatsStuk(gegevens);
  geschiedenis.push({ soort: 'zet', gegevens, id: stuk.id });
  teruggedraaid.length = 0; // een nieuwe stap maakt de tak vooruit ongeldig
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

/**
 * Draait één stap terug (heen = false) of zet hem er weer op (heen = true).
 *
 * Het stuk komt terug ónder zijn eigen nummer. Zonder dat verwijst een oudere
 * stap in de geschiedenis naar een nummer dat niet meer bestaat en doet hij
 * niets — zichtbaar als een knop die het ene moment werkt en het volgende niet.
 */
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

/* -- oordelen --------------------------------------------------------------
 * Waar het gereedschap voor bedoeld is: niet de meting bewaren maar wat jíj
 * ervan vindt.
 *
 * De meting zegt of twee randen elkaars spiegelbeeld zijn, en dat is een feit
 * over de vorm. Of een combinatie goed is, is dat niet: een trap in een
 * rotswand kan precies de bedoeling zijn, en twee randen die tot op de
 * honderdste samenvallen kunnen er lelijk uitzien. Alleen wie bouwt kan dat
 * zeggen, dus bewaart dit bestand zijn oordeel en niet dat van de meting.
 *
 * Bewaard op het paar randprofielen: keur je die vorm goed, dan geldt dat voor
 * elk stuk met die randen en in elke draaistand. Anders zou dezelfde vraag
 * tientallen keren terugkomen.
 */

const OORDEELSLEUTEL = 'terreinbouwer-oordelen';

const oordelen = new Map(Object.entries(
  JSON.parse(localStorage.getItem(OORDEELSLEUTEL) ?? '{}'),
));

function bewaarOordelen() {
  localStorage.setItem(OORDEELSLEUTEL, JSON.stringify(Object.fromEntries(oordelen)));
}

function velOordeel(sleutel, oordeel, naad) {
  if (oordelen.get(sleutel)?.oordeel === oordeel) oordelen.delete(sleutel); // nog eens tikken = intrekken
  else {
    oordelen.set(sleutel, {
      oordeel,
      namen: naad.namen,
      slagen: naad.slagen,
      randen: naad.randen,
      vorm: naad.vorm,
      plek: naad.plek,
      meting: naad.sluit,
    });
  }
  bewaarOordelen();
  werkBijAlles();
}

/**
 * Of dezelfde vórm elders anders beoordeeld is.
 *
 * Geen tegenstrijdigheid om op te lossen maar een uitkomst om te melden: twee
 * keer dezelfde twee stukken tegen elkaar, één keer goed bevonden en één keer
 * niet, betekent dat het van de omgeving afhangt. Dat is precies het soort ding
 * dat je met een gereedschap als dit wilt vinden.
 */
function vormElders(naad, sleutel) {
  const anders = [];
  for (const [s, o] of oordelen) {
    if (s === sleutel || o.vorm !== naad.vorm) continue;
    anders.push(o.oordeel);
  }
  return {
    goed: anders.filter((o) => o === 'goed').length,
    niet: anders.filter((o) => o === 'niet').length,
  };
}

/* -- wat er op het scherm hoort te staan ----------------------------------- */

const standKnop = document.getElementById('stand-knop');
const standTekst = document.getElementById('stand');
const zetKnop = document.getElementById('zet');
const wegKnop = document.getElementById('weg');
const ongedaanKnop = document.getElementById('ongedaan');
const opnieuwKnop = document.getElementById('opnieuw');
const penseelUit = document.getElementById('penseel');
const wenkBalk = document.getElementById('wenk');

let laatsteMeldingen = [];

/** Het stuk dat op de wijzer staat, of null. */
function opWijzer() {
  const bewoners = bouwsel.op(stand.wijzer[0], stand.wijzer[1], stand.laag);
  // het laatst neergezette bovenop: dat is wat je ziet en dus wat "Weg" pakt
  return bewoners.length ? bouwsel.stukken.get(bewoners[bewoners.length - 1].id) : null;
}

/**
 * Alles bijwerken wat van de stand afhangt.
 *
 * Eén functie voor het hele scherm in plaats van een handvol losse. Het is
 * weinig werk — de controle is lineair in het aantal bezette vakken — en het
 * scheelt de hele klasse fouten waarbij twee dingen uit de pas gaan lopen.
 */
function werkBijAlles() {
  const meldingen = controleer(bouwsel);
  laatsteMeldingen = meldingen;
  const fouten = meldingen.filter((m) => m.ernst === 'fout').length;
  const waarschuwingen = meldingen.length - fouten;

  standTekst.textContent = bouwsel.stukken.size === 0 ? 'leeg'
    : fouten ? `${fouten} fout${fouten > 1 ? 'en' : ''}`
      : waarschuwingen ? `${waarschuwingen} let op`
        : `${bouwsel.stukken.size} ✓`;
  standKnop.dataset.ernst = bouwsel.stukken.size === 0 ? 'leeg'
    : fouten ? 'fout' : waarschuwingen ? 'waarschuwing' : 'goed';

  /* de wijzer en de schaduw */
  wijzer.position.set(stand.wijzer[0] * VAK, stand.laag * LAAG + 0.004, stand.wijzer[1] * VAK);
  raster.position.y = stand.laag * LAAG;

  const bewoner = opWijzer();
  const proef = stand.penseel && {
    naam: stand.penseel, x: stand.wijzer[0], z: stand.wijzer[1], laag: stand.laag, slagen: stand.slagen,
  };

  if (schaduw && proef) {
    schaduw.visible = true;
    zetNeer(schaduw, proef);
    /* De controle wordt niet nagebootst maar echt gedraaid: het stuk gaat er
     * even in, controleer() loopt eroverheen, en het gaat er weer uit. Zo kan
     * de voorspelling nooit uit de pas lopen met wat er ná het neerzetten
     * gemeld wordt. */
    const tijdelijk = bouwsel.zet(proef);
    const raakt = controleer(bouwsel).filter((m) => m.stukken.includes(tijdelijk.id));
    bouwsel.haalWeg(tijdelijk.id);
    const materiaal = raakt.length ? SCHADUW_FOUT : SCHADUW_GOED;
    schaduw.traverse((k) => { if (k.isMesh) k.material = materiaal; });
    wijzer.material.color.setHex(raakt.length ? 0xc0392b : 0x3d7a3d);
  } else {
    if (schaduw) schaduw.visible = false;
    wijzer.material.color.setHex(bewoner ? 0xc07a1e : 0x2b6cb0);
  }

  /* Neerzetten wordt niet geweigerd omdat er al iets staat. Een kei hoort op
   * een tegel, en of twee stukken samen kunnen is een oordeel — de controle
   * meldt wat ze meet, de bouwer beslist niets voor je. */
  zetKnop.disabled = !stand.penseel;
  wegKnop.disabled = !bewoner;
  ongedaanKnop.disabled = geschiedenis.length === 0;
  opnieuwKnop.disabled = teruggedraaid.length === 0;

  /* de rode naden van alle meldingen die er één aanwijzen */
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
  /* Tijdens het kijken staan de rode naden uit: anders is niet te zien welke
   * lijn erbij hoort. */
  vulLijnen(naadFout, stand.kijk ? [] : punten);
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

/* -- één voeg bekijken -----------------------------------------------------
 * Het antwoord op "ik zie niet welke voeg ik beoordeel". Een regel in de lijst
 * staat voor een combinatie, en die kan tien keer in een bouwsel zitten; met
 * alleen twee stuknamen erbij is niet te zien wélke.
 *
 * Bekijken zet daarom de voeg zelf in beeld: de doorsnede wordt fel getekend op
 * de plek waar hij zit, de camera draait ernaartoe, en de knoppenbalk maakt
 * plaats voor "vorige / volgende / goed / niet". Zo oordeel je over wat je ziet
 * in plaats van over twee namen.
 */

const voetGewoon = document.querySelector('.voet:not(.voet-kijk)');
const voetKijk = document.getElementById('voet-kijk');

/**
 * Ga één voeg staan bekijken, en loop er met ‹ en › door alle andere heen.
 *
 * De lijst is álle voegen van het bouwsel, niet die van één soort. Dat is het
 * hele punt van deze ronde: elke voeg is er één, en je moet ze stuk voor stuk
 * langs kunnen lopen en er stuk voor stuk iets van kunnen vinden.
 */
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

/** Naar de zoveelste voeg kijken. */
function kijkNaar(index) {
  if (!stand.kijk) return;
  const { lijst } = stand.kijk;
  stand.kijk.index = ((index % lijst.length) + lijst.length) % lijst.length;
  const naad = lijst[stand.kijk.index];

  /* De wijzer op het vak van de voeg, de camera erheen. Van dichtbij, want een
   * voeg is een halve unit breed en je moet er iets van kunnen zien. */
  stand.wijzer = [naad.plek.x, naad.plek.z];
  stand.laag = naad.plek.laag;
  zetLaagUit();

  /* De camera schuift mee, maar houdt de stand die jij hem gegeven hebt.
   *
   * Het standpunt wordt niet opnieuw bepaald: alleen het mikpunt verspringt naar
   * de volgende voeg, en de camera houdt dezelfde afstand en hoek ten opzichte
   * daarvan. Wie zich heeft ingedraaid om goed op een wand te kunnen kijken,
   * kijkt er na de volgende voeg nog steeds zo op — en dat is nodig, want bij
   * veertig voegen achter elkaar is elke keer opnieuw richten het werk waar je
   * juist vanaf wilt. */
  const [dx, dz] = STAP[naad.plek.zijde];
  const mikpunt = new THREE.Vector3(
    (naad.plek.x + dx / 2) * VAK,
    naad.plek.laag * LAAG + 0.25,
    (naad.plek.z + dz / 2) * VAK,
  );
  const standpunt = camera.position.clone().sub(stuur.target);
  stuur.target.copy(mikpunt);
  camera.position.copy(mikpunt).add(standpunt);
  stuur.update();

  werkBijAlles();
}

/** De doorsnede van de voeg die je nu bekijkt. Alleen die ene. */
function tekenGemarkeerd() {
  if (!stand.kijk) {
    vulLijnen(gemarkeerd, []);
    return;
  }
  const naad = stand.kijk.lijst[stand.kijk.index];
  const punten = [];
  const { x, z, laag, zijde } = naad.plek;
  for (const [i, rand] of naad.randen.entries()) {
    if (!rand) continue;
    const kant = i === 0 ? zijde : TEGENOVER[zijde];
    const [dx, dz] = i === 0 ? [0, 0] : STAP[zijde];
    punten.push(...naadPunten(rand, x + dx, z + dz, laag, kant));
  }
  vulLijnen(gemarkeerd, punten);
}

function werkKijkBalkBij() {
  voetKijk.hidden = !stand.kijk;
  voetGewoon.hidden = !!stand.kijk;
  if (!stand.kijk) return;

  const { lijst, index } = stand.kijk;
  const naad = lijst[index];
  const nogNiet = lijst.filter((n) => !oordelen.has(n.sleutel)).length;
  const mijn = oordelen.get(naad.sleutel)?.oordeel ?? null;

  document.getElementById('kijk-namen').textContent = `${naad.namen[0]} ↔ ${naad.namen[1]}`;

  /* Wat de meting ervan vindt komt er pas bij nadat jij iets gezegd hebt.
   *
   * Anders staat het antwoord er al voordat je gekeken hebt, en dan beoordeel je
   * niet de voeg maar de meting. Dat is geen kleinigheid: bij een gereedschap
   * waarvan de hele opbrengst jouw oordeel is, is het voorzeggen van dat oordeel
   * het ergste wat het kan doen. Achteraf is het wél nuttig — dan zie je waar je
   * met de meting van mening verschilt. */
  document.getElementById('kijk-bij').textContent =
    `voeg ${index + 1} van ${lijst.length} · nog ${nogNiet} te gaan`
    + (mijn ? ` · de meting zei: ${naad.sluit ? 'sluit aan' : 'stap of gat'}` : '');
  document.getElementById('kijk-goed').setAttribute('aria-pressed', String(mijn === 'goed'));
  document.getElementById('kijk-niet').setAttribute('aria-pressed', String(mijn === 'niet'));
}

document.getElementById('kijk-vorige').addEventListener('click', () => kijkNaar(stand.kijk.index - 1));
document.getElementById('kijk-volgende').addEventListener('click', () => kijkNaar(stand.kijk.index + 1));
document.getElementById('kijk-stop').addEventListener('click', stopKijken);
for (const [id, keuze] of [['kijk-goed', 'goed'], ['kijk-niet', 'niet']]) {
  document.getElementById(id).addEventListener('click', () => {
    const naad = stand.kijk.lijst[stand.kijk.index];
    const was = oordelen.get(naad.sleutel)?.oordeel;
    velOordeel(naad.sleutel, keuze, naad);
    /* Doorlopen naar de volgende voeg die nog geen oordeel heeft: bij veertig
     * voegen wil je niet na elke tik zelf de pijl zoeken. Bij intrekken blijf
     * je staan, want dan was je juist niet klaar met deze. */
    if (was === keuze) return;
    const { lijst, index } = stand.kijk;
    for (let i = 1; i <= lijst.length; i++) {
      const kandidaat = (index + i) % lijst.length;
      if (!oordelen.has(lijst[kandidaat].sleutel)) return kijkNaar(kandidaat);
    }
    return undefined;
  });
}

/* -- het blad -------------------------------------------------------------- */

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

/* Naast het blad tikken sluit het. Zonder dit is het kruisje de enige uitweg,
 * en het blad dekt de knoppenbalk af — je zit er dan aan vast tot je hem vindt. */
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

/* -- palet ----------------------------------------------------------------- */

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

/**
 * De voorbeeldbouwsels, om iets te hébben om over te oordelen.
 *
 * Tegel voor tegel een klifwand neerzetten op een telefoon is werk; deze
 * leveren in één tik een stuk terrein op met tien tot twintig voegen erin.
 * Wat ze opleveren staat erbij, zodat je vooraf weet waar je naar gaat kijken.
 */
function vulBouwsels() {
  for (const bouwsel of voorbeelden) {
    const rij = document.createElement('button');
    rij.type = 'button';
    rij.className = 'bouwsel';

    const naam = document.createElement('div');
    naam.className = 'bouwsel-naam';
    naam.textContent = bouwsel.naam;

    const bij = document.createElement('div');
    bij.className = 'bouwsel-bij';
    bij.textContent = `${bouwsel.stukken.length} stukken — ${bouwsel.waarover}`;

    rij.append(naam, bij);
    rij.addEventListener('click', () => openBouwsel(bouwsel));
    bladInhoud.append(rij);
  }

  const voet = document.createElement('div');
  voet.className = 'uitleg';
  voet.innerHTML = '<p>Een bouwsel openen vervangt wat er staat en wist de '
    + 'stappen terug. Je oordelen blijven.</p>';
  bladInhoud.append(voet);
}

/**
 * Zet een bouwsel neer in plaats van wat er stond.
 *
 * De geschiedenis gaat leeg: stap voor stap terugdraaien naar een half
 * openstaand bouwsel helpt niemand. De oordelen blijven staan — die horen bij
 * de combinaties, niet bij wat er toevallig op het raster staat.
 */
async function openBouwsel(voorbeeld) {
  for (const id of [...bouwsel.stukken.keys()]) verwijderStuk(id);
  geschiedenis.length = 0;
  teruggedraaid.length = 0;

  for (const stuk of voorbeeld.stukken) await plaatsStuk(stuk);

  /* De wijzer en de camera naar het bouwsel toe, en ver genoeg naar achteren om
   * het hele ding te zien. Een vaste afstand werkt niet: een grasvlakte van
   * twaalf tegels en een klifwand van drie lagen vragen een ander standpunt. */
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

  sluitBlad();
  werkBijAlles();
}

zoekVeld.addEventListener('input', vulPalet);
document.getElementById('stuk-knop').addEventListener('click', () => toonPalet('stukken'));

/* -- controle en verkenner ------------------------------------------------- */

function toonControleBlad(tab = 'meldingen') {
  openBlad('Controle');
  bladZoek.hidden = true;
  bladFilters.replaceChildren();
  bladInhoud.replaceChildren();

  const bewoner = opWijzer();
  bladTabs.replaceChildren();
  for (const [sleutel, label] of [['combos', 'Voegen'], ['meldingen', 'Meldingen'], ['past', 'Past hier']]) {
    const knop = document.createElement('button');
    knop.type = 'button';
    knop.textContent = label;
    knop.setAttribute('aria-pressed', String(sleutel === tab));
    knop.addEventListener('click', () => toonControleBlad(sleutel));
    bladTabs.append(knop);
  }

  if (tab === 'combos') return vulCombinaties();
  if (tab === 'meldingen') return vulMeldingen();
  return vulVerkenner(bewoner);
}

/**
 * Elke voeg in het bouwsel, met jouw oordeel erbij.
 *
 * Dit is waar het gereedschap voor is. De meting staat erbij als gegeven —
 * "sluit aan" of "stap" — maar het oordeel is van jou, en dat is wat bewaard
 * wordt. Waar de twee uiteenlopen staat het er met zoveel woorden bij; juist
 * die gevallen zijn het interessantst.
 */
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
  const kop = document.createElement('div');
  kop.className = 'uitleg';
  kop.innerHTML = `<p>${lijst.length} voegen, ${nogNiet} nog niet beoordeeld. `
    + 'Elke voeg staat op zichzelf: twee keer dezelfde stukken op een andere '
    + 'plek zijn twee oordelen.</p>';
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
    /* Alleen wáár de voeg zit. Wat de meting ervan vindt komt er pas bij nadat
     * jij iets gezegd hebt — zie werkKijkBalkBij(). */
    waar.textContent = `vak ${naad.plek.x},${naad.plek.z} · laag ${naad.plek.laag} · `
      + zijNaam[naad.plek.zijde]
      + (mijn ? ` — de meting zei: ${naad.sluit ? 'sluit aan' : 'stap of gat'}` : '');

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
      /* Vanuit de lijst blijf je in de lijst: doorspringen naar de volgende
       * voeg gebeurt in de kijkbalk, waar je er één tegelijk bekijkt. Wie in een
       * lijst staat te werken wil niet dat het scherm onder hem vandaan
       * verandert. */
      knop.addEventListener('click', () => {
        velOordeel(naad.sleutel, waarde, naad);
        toonControleBlad('combos');
      });
      knoppen.append(knop);
    }

    rij.append(toon, knoppen);

    if (mijn && (mijn === 'goed') !== naad.sluit) {
      const afwijking = document.createElement('div');
      afwijking.className = 'combo-afwijking';
      afwijking.textContent = mijn === 'goed'
        ? 'Jij keurt dit goed terwijl de randen niet samenvallen.'
        : 'Jij keurt dit af terwijl de randen wél samenvallen.';
      rij.append(afwijking);
    }

    const elders = vormElders(naad, naad.sleutel);
    if (mijn && ((mijn === 'goed' && elders.niet) || (mijn === 'niet' && elders.goed))) {
      const let_ = document.createElement('div');
      let_.className = 'combo-afwijking';
      let_.textContent = `Dezelfde twee stukken heb je elders ${elders.goed}× goed `
        + `en ${elders.niet}× niet genoemd — het hangt dus van de plek af.`;
      rij.append(let_);
    }

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
  voet.append(uit);
  bladInhoud.append(voet);
}

/** De oordelen als bestand, zodat ze de telefoon uit kunnen. */
function exporteerOordelen() {
  const inhoud = JSON.stringify({
    kit: 'modulair-terrein',
    gemaakt: 'tools/terreinbouwer/',
    toelichting: 'Per combinatie van twee randprofielen het oordeel van wie bouwt. '
      + '`meting` is wat aansluitingen.mjs erover zegt; `oordeel` gaat voor.',
    oordelen: Object.fromEntries(oordelen),
  }, null, 1);
  const blob = new Blob([inhoud], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'combinatie-oordelen.json';
  link.click();
  URL.revokeObjectURL(link.href);
}

function vulMeldingen() {
  if (laatsteMeldingen.length === 0) {
    const p = document.createElement('p');
    p.className = 'leeg';
    p.textContent = bouwsel.stukken.size === 0
      ? 'Nog niets geplaatst.'
      : 'Alles sluit aan.';
    bladInhoud.append(p);
    return;
  }

  for (const melding of laatsteMeldingen) {
    const knop = document.createElement('button');
    knop.type = 'button';
    knop.className = 'melding';
    knop.dataset.ernst = melding.ernst;
    const soort = document.createElement('small');
    soort.textContent = melding.soort;
    knop.append(soort, document.createTextNode(melding.tekst));
    knop.addEventListener('click', () => {
      stand.wijzer = [melding.plek.x, melding.plek.z];
      stand.laag = melding.plek.laag;
      zetLaagUit();
      stuur.target.set(melding.plek.x * VAK, melding.plek.laag * LAAG + 0.25, melding.plek.z * VAK);
      sluitBlad();
      werkBijAlles();
    });
    bladInhoud.append(knop);
  }
}

/**
 * Wat er tegen het stuk op de wijzer aan past.
 *
 * De vraag waar het pakket om draait, en met de gemeten profielen in één keer
 * te beantwoorden: zoek elk stuk in elke draaistand waarvan het profiel het
 * spiegelbeeld is. Tikken zet het meteen in het buurvak, zodat het antwoord ook
 * te zien is en niet alleen te lezen.
 */
function vulVerkenner(bewoner) {
  if (!bewoner) {
    const p = document.createElement('p');
    p.className = 'leeg';
    p.textContent = 'Richt de wijzer eerst op een stuk dat er al staat.';
    bladInhoud.append(p);
    return;
  }

  const vakken = kit.vakkenVan(bewoner.naam, bewoner.x, bewoner.z, bewoner.slagen);
  const hier = vakken.find((v) => v.wereld[0] === stand.wijzer[0] && v.wereld[1] === stand.wijzer[1]);

  const uitleg = document.createElement('div');
  uitleg.className = 'uitleg';
  uitleg.innerHTML = `<p><b>${bewoner.naam}</b></p>`;
  bladInhoud.append(uitleg);

  let iets = false;
  for (const zijde of ZIJDEN) {
    const rand = kit.randVan(bewoner.naam, hier.lokaal, zijde, bewoner.slagen);
    if (rand === null || kit.isOpen(rand)) continue;

    const [dx, dz] = STAP[zijde];
    const doel = [stand.wijzer[0] + dx, stand.wijzer[1] + dz];
    if (bouwsel.op(doel[0], doel[1], bewoner.laag).length) continue;

    const passend = watPast(kit, rand, TEGENOVER[zijde]);
    if (passend.length === 0) continue;
    iets = true;

    const kop = document.createElement('div');
    kop.className = 'uitleg';
    kop.innerHTML = `<p>${{ n: 'noord', o: 'oost', z: 'zuid', w: 'west' }[zijde]}`
      + ` — ${passend.length} stukken passen hier</p>`;
    bladInhoud.append(kop);

    for (const kandidaat of passend.slice(0, 25)) {
      bladInhoud.append(maakRij(kandidaat.naam, `${kandidaat.slagen * 90}°`, async () => {
        const [lu, lv] = kandidaat.lokaal.split(',').map(Number);
        const [du, dv] = draaiVak([lu, lv], kandidaat.slagen);
        await doeZet({
          naam: kandidaat.naam,
          x: doel[0] - du,
          z: doel[1] - dv,
          laag: bewoner.laag,
          slagen: kandidaat.slagen,
        });
        sluitBlad();
      }));
    }
  }

  if (!iets) {
    const p = document.createElement('p');
    p.className = 'leeg';
    p.textContent = 'Geen vrije zijde met een passend stuk.';
    bladInhoud.append(p);
  }
}

standKnop.addEventListener('click', () => toonControleBlad('meldingen'));

/* -- tikken op het raster -------------------------------------------------- */

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

/**
 * Hoeveel de vinger tussen neer en op mag verschuiven en het nog een tik heten.
 *
 * Vegen draait de camera; dat mag de wijzer niet meeslepen. Twaalf beeldpunten
 * is ruim voor een duim die niet stilstaat en ruim te weinig voor een bedoelde
 * veeg.
 */
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

/* -- knoppen --------------------------------------------------------------- */

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

/* -- draaien --------------------------------------------------------------- */

zetLaagUit();
werkBijAlles();

renderer.setAnimationLoop(() => {
  stuur.update();
  renderer.render(scene, camera);
});

/* Voor tools/toets-terreinbouwer.mjs, dat de pagina in een echte browser
 * nakijkt: zonder haak zou het alleen kunnen zien dát er iets tekent. */
window.TERREINBOUWER = {
  kit, bouwsel, stand, controleer, camera, renderer, scene, stukken, stuur,
  doeZet, doeWeg, ongedaan, opnieuw, kiesStuk, versie: VERSIE,
  naden, oordelen, velOordeel, naadSleutel, vormSleutel, voorbeelden, openBouwsel,
  beginKijken, kijkNaar, stopKijken,
};
window.KLAAR = true;
