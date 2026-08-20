const KIT_KLEUREN = {
  'survival-kit': '#6cb588',
  'pirate-kit': '#474a58',
  'modular-cave-kit': '#8a5d4b',
  'mini-forest': '#3da679',
  'fantasy-town-kit': '#995a41',
  'platformer-kit': '#ffb349',
  'mini-dungeon': '#6d738a',
  'onderwater-kit': '#2fa39b',
  // Twee geïmporteerde packs: verweerd bruingrijs voor de tak, de dode boom en
  // de berg, en het olijfgroen dat met de palm en de plant aan de gedeelde
  // colormap is toegevoegd.
  nature: '#7f6a52',
  tropical: '#6d8d33',
  // De derde geïmporteerde pack: het grasgroen dat ermee aan de gedeelde
  // colormap is toegevoegd, iets gedempt zodat het niet met tropical's olijf
  // en mini-forest's blauwgroen verwisseld wordt.
  'modulair-terrein': '#4f7a3a',
  // De props-kit is hout, aardewerk en ijzer; de rocks-kit is steen.
  props: '#b7946e',
  rocks: '#8a91ae',
};

const GROEP_ALIASSEN = {
  bouw: 'bouwwerken',
  mechaniek: 'items',
};

const ZWAAR_VANAF = 5000;

/**
 * Driehoeken per 1×1×1 unit waarboven een model uit de pas loopt met de
 * stijlgids (§4). Los van ZWAAR_VANAF, want dat is een absolute telling: een
 * schip van 5000 driehoeken is groot, een kruk van 1500 is te fijn gemodelleerd
 * — twee verschillende soorten zwaar, allebei het aankijken waard.
 *
 * De grens zelf staat in tools/glb.mjs en komt via catalog.json mee; start()
 * zet hem zodra de catalogus binnen is. Het getal hier is alleen het antwoord
 * op een catalogus van vóór dat veld.
 */
let budgetPerUnit = 1000;

const getal = new Intl.NumberFormat('nl-NL');

const paneel = document.querySelector('#paneel');
const springlijst = document.querySelector('#springlijst');
const zoekveld = document.querySelector('#zoek');
const zoekTelling = document.querySelector('#zoek-telling');
const leegmelding = document.querySelector('#leeg');
const samenvatting = document.querySelector('#samenvatting');
const detail = document.querySelector('#detail');

const kaarten = [];
const secties = [];

let huidigeWeergave = 'kits';

/**
 * Selectie hangt aan het pad, niet aan de kaart. Eén model heeft namelijk
 * meerdere kaarten — hetzelfde vat staat zowel in de kitweergave als in zijn
 * semantische groep — en die moeten hetzelfde vinkje tonen. Meteen ook de
 * ontdubbeling: wie in beide tabbladen hetzelfde model aanvinkt, krijgt het
 * pad één keer op het klembord.
 */
const gekozenPaden = new Set();
const kaartenPerPad = new Map();

let laatsteKeuze = null;

const gekozenKleuren = new Set();

const kleurSleutel = (palet, hex) => `${palet}|${hex}`;

const kleurgroepen = [];

const bytesLeesbaar = (bytes) =>
  bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} kB`;

const eenheid = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 2 });

const afmeting = (wdh) =>
  Array.isArray(wdh) ? `${wdh.map((v) => eenheid.format(v)).join(' × ')} units` : '—';

function span(klasse, tekst = '') {
  const element = document.createElement('span');
  element.className = klasse;
  element.textContent = tekst;
  return element;
}

const waarnemer = new IntersectionObserver(
  (waarnemingen) => {
    for (const { target, isIntersecting } of waarnemingen) {
      if (isIntersecting) koppelViewer(target);
      else ontkoppelViewer(target);
    }
  },
  { rootMargin: '800px 0px' },
);

/**
 * Het licht van elke kaart. model-viewer haalt zijn licht uit een
 * omgevingsplaat, en kits/omgeving.hdr is gebouwd uit dezelfde
 * tools/webgpu-scene/licht.json als de WebGPU-scène: overal de omgevingskleur,
 * plus een zonneschijf op de elevatie en azimut daaruit. Een model ziet er in de
 * catalogus dus uit als in de scène. `exposure` komt uit hetzelfde bestand.
 *
 * De tonemapping blijft die van model-viewer zelf; uitzetten kan niet via een
 * attribuut. De scène klemt alleen, dus heel lichte vlakken lopen daar iets
 * eerder vast dan hier.
 */
function zetLicht(viewer) {
  viewer.setAttribute('environment-image', 'kits/omgeving.hdr');
  viewer.setAttribute('exposure', '1.25');
}

function koppelViewer(vak) {
  if (vak.querySelector('model-viewer')) return;

  const viewer = document.createElement('model-viewer');
  viewer.src = vak.dataset.src;
  viewer.alt = vak.dataset.alt;
  // De onderwater-kit is gerigd: laat de vissen zwemmen zolang de kaart in
  // beeld is. Zonder animatie staat `autoplay` er niet, want dan zet het alleen
  // een renderlus aan die niets te tekenen heeft.
  if (vak.dataset.animatie) viewer.setAttribute('autoplay', '');
  viewer.setAttribute('camera-orbit', '35deg 68deg auto');
  zetLicht(viewer);
  viewer.setAttribute('shadow-intensity', '0.6');
  viewer.setAttribute('shadow-softness', '0.9');
  viewer.setAttribute('interaction-prompt', 'none');
  viewer.setAttribute('disable-zoom', '');
  viewer.setAttribute('loading', 'eager');
  vak.replaceChildren(viewer);
}

function ontkoppelViewer(vak) {
  const viewer = vak.querySelector('model-viewer');
  if (!viewer) return;

  if (viewer.loaded && !vak.dataset.momentopname) {
    try {
      vak.dataset.momentopname = viewer.toDataURL('image/webp', 0.72);
    } catch {}
  }

  if (vak.dataset.momentopname) {
    const plaatje = document.createElement('img');
    plaatje.src = vak.dataset.momentopname;
    plaatje.alt = vak.dataset.alt;
    plaatje.loading = 'lazy';
    vak.replaceChildren(plaatje);
  } else {
    vak.replaceChildren();
  }
}

function maakKaart(model, kits, groepen, weergave) {
  const kit = kits.get(model.kit);
  const groep = groepen.get(model.groep);
  // Een catalogus zonder dit veld is er niet meer, maar hij is er wel geweest;
  // zonder getal blijft de kaart bij wat hij altijd toonde.
  const dichtheid = Number.isFinite(model.driehoekenPerUnit) ? model.driehoekenPerUnit : null;
  const bovenBudget = dichtheid !== null && dichtheid > budgetPerUnit;
  // Eén rood label voor twee redenen: veel driehoeken, of veel driehoeken op
  // weinig ruimte. Wat er precies aan de hand is, staat in de tooltip en in het
  // detailpaneel; op de kaart is het genoeg dat het opvalt.
  const zwaar = model.driehoeken >= ZWAAR_VANAF || bovenBudget;

  const kaart = document.createElement('button');
  kaart.type = 'button';
  kaart.className = 'kaart';
  kaart.style.setProperty('--merk-kleur', KIT_KLEUREN[model.kit] ?? 'currentColor');

  const vak = document.createElement('div');
  vak.className = 'kaart-viewer';
  vak.dataset.src = model.pad;
  vak.dataset.alt = `3D-model ${model.naam} uit ${kit?.naam ?? model.kit}`;
  if (model.animaties?.length) vak.dataset.animatie = '1';

  const tekst = document.createElement('div');
  tekst.className = 'kaart-tekst';
  const meta = span('kaart-meta');
  const tri = span(`kaart-tri${zwaar ? ' zwaar' : ''}`, `${getal.format(model.driehoeken)} tri`);
  if (dichtheid !== null) {
    tri.title = `${getal.format(dichtheid)} driehoeken per unit${bovenBudget ? ` — boven het budget van ${getal.format(budgetPerUnit)}` : ''}`;
  }
  meta.append(
    span('kaart-merk', kit?.naam ?? model.kit),
    tri,
    span('kaart-grootte', bytesLeesbaar(model.bytes)),
  );
  tekst.append(span('kaart-naam', model.naam), meta);

  kaart.append(vak, tekst);
  kaart.addEventListener('click', () => toonDetail(model, kit, groep));

  // Het vinkje is een broer van de kaart, geen kind: een knop in een knop mag
  // niet, en zo blijft de kaart zelf onveranderd klikbaar naar het detail.
  const kies = document.createElement('label');
  kies.className = 'kaart-kies';
  const vinkje = document.createElement('input');
  vinkje.type = 'checkbox';
  vinkje.checked = gekozenPaden.has(model.pad);
  vinkje.setAttribute('aria-label', `${model.naam} selecteren`);
  kies.append(vinkje);

  const houder = document.createElement('div');
  houder.className = 'kaart-houder';
  houder.append(kaart, kies);

  const item = {
    element: houder,
    vinkje,
    pad: model.pad,
    weergave,
    palet: model.palet,
    kleuren: model.kleuren.map((hex) => kleurSleutel(model.palet, hex)),
    zoektekst: [
      model.naam,
      model.kit,
      kit?.naam ?? '',
      groep?.naam ?? '',
    ].join(' ').toLowerCase(),
  };
  kaarten.push(item);

  const zusjes = kaartenPerPad.get(model.pad);
  if (zusjes) zusjes.push(item);
  else kaartenPerPad.set(model.pad, [item]);

  vinkje.addEventListener('click', (e) => {
    if (e.shiftKey && laatsteKeuze && laatsteKeuze !== item) kiesBereik(item, vinkje.checked);
    else zetSelectie([model.pad], vinkje.checked);
    laatsteKeuze = item;
  });

  waarnemer.observe(vak);
  return item;
}

function maakSectie({ id, weergave, soort, titel, aantal, kleur, uitleg, bron }) {
  const sectie = document.createElement('section');
  sectie.className = 'sectie';
  sectie.id = id;
  sectie.dataset.weergave = weergave;
  sectie.dataset.soort = soort;
  if (kleur) sectie.style.setProperty('--sectie-kleur', kleur);

  const kop = document.createElement('div');
  kop.className = 'sectie-kop';

  const titelEl = document.createElement('h2');
  titelEl.textContent = titel;

  const aantalEl = document.createElement('span');
  aantalEl.className = 'aantal';
  aantalEl.textContent = `${aantal} modellen`;

  kop.append(titelEl, aantalEl);

  if (uitleg) {
    const p = document.createElement('p');
    p.className = 'uitleg';
    p.textContent = uitleg;
    kop.append(p);
  }

  if (bron) {
    const link = document.createElement('a');
    link.className = 'bron';
    link.href = bron.href;
    link.textContent = bron.tekst;
    link.rel = 'noopener';
    kop.append(link);
  }

  const rooster = document.createElement('div');
  rooster.className = 'rooster';
  sectie.append(kop, rooster);
  return { sectie, rooster, aantalEl };
}

function maakSpringitem(sectie, titel, aantal, kleur) {
  const link = document.createElement('a');
  link.href = `#${sectie.id}`;
  link.dataset.weergave = sectie.dataset.weergave;
  const stip = span('stip');
  if (kleur) stip.style.background = kleur;
  link.append(stip, document.createTextNode(`${titel} `), span('telling', String(aantal)));
  springlijst.append(link);
  return link;
}

const detailViewer = document.querySelector('#detail-viewer');
const detailKopieer = document.querySelector('#detail-kopieer');
const detailAnimatie = document.querySelector('#detail-animatie');
const detailAnimatieKeuze = document.querySelector('#detail-animatie-keuze');
let actiefPad = '';

function toonDetail(model, kit, groep) {
  actiefPad = model.pad;
  document.querySelector('#detail-naam').textContent = model.naam;
  document.querySelector('#detail-herkomst').textContent =
    `${kit?.naam ?? model.kit} · ${groep?.naam ?? model.groep}`;

  const rijen = [
    ['Bestand', model.pad],
    ['Afmetingen (b × d × h)', afmeting(model.wdh)],
    ['Driehoeken', `${getal.format(model.driehoeken)}${model.driehoeken >= ZWAAR_VANAF ? ' (zwaar)' : ''}`],
    // Het budget uit de stijlgids: elke as telt voor minstens één unit mee, dus
    // een model dat binnen één rastercel blijft wordt niet afgerekend op hoe
    // klein het is (tools/glb.mjs).
    [
      'Driehoeken per unit',
      !Number.isFinite(model.driehoekenPerUnit)
        ? '—'
        : `${getal.format(model.driehoekenPerUnit)}${model.driehoekenPerUnit > budgetPerUnit ? ` (boven budget van ${getal.format(budgetPerUnit)})` : ''}`,
    ],
    ['Tekenopdrachten', model.calls === undefined ? '—' : getal.format(model.calls)],
    ['Materialen', getal.format(model.materialen)],
    // Alleen de onderwater-kit is gerigd; bij de rest heeft de rij niets te melden.
    ...(model.animaties?.length
      ? [[`Animaties (${model.animaties.length})`, model.animaties.join(', ')]]
      : []),
    ['Grootte', bytesLeesbaar(model.bytes)],
    ['Licentie', `${kit?.licentieLabel ?? 'CC0'} — ${kit?.licentie ?? 'zie kitmap'}`],
  ];
  const gegevens = document.querySelector('#detail-gegevens');
  gegevens.replaceChildren();
  for (const [sleutel, waarde] of rijen) {
    const naam = document.createElement('dt');
    naam.textContent = sleutel;
    const waardeEl = document.createElement('dd');
    waardeEl.textContent = waarde;
    gegevens.append(naam, waardeEl);
  }

  const download = document.querySelector('#detail-download');
  download.href = model.pad;
  download.setAttribute('download', `${model.naam}.glb`);

  const viewer = document.createElement('model-viewer');
  viewer.src = model.pad;
  viewer.alt = `3D-model ${model.naam}`;
  viewer.setAttribute('camera-controls', '');
  viewer.setAttribute('camera-orbit', '35deg 68deg auto');
  zetLicht(viewer);
  viewer.setAttribute('shadow-intensity', '0.7');
  viewer.setAttribute('shadow-softness', '0.9');

  /**
   * Een gerigd model speelt zijn eerste clip; bij meer clips kun je kiezen.
   * De draaitafel gaat dan uit: een schildpad die zwemt én ronddraait laat
   * geen van beide goed zien. Bij een stilstaand model is dat rondje juist de
   * enige manier om de achterkant te zien zonder te slepen.
   */
  const clips = model.animaties ?? [];
  if (clips.length) {
    viewer.setAttribute('autoplay', '');
    viewer.setAttribute('animation-name', clips[0]);
  } else {
    viewer.setAttribute('auto-rotate', '');
    viewer.setAttribute('rotation-per-second', '18deg');
  }

  detailAnimatie.hidden = clips.length < 2;
  detailAnimatieKeuze.replaceChildren(
    ...clips.map((naam) => {
      const optie = document.createElement('option');
      optie.value = naam;
      optie.textContent = naam;
      return optie;
    }),
  );

  detailViewer.replaceChildren(viewer);

  detail.showModal();
  werkSelectieBij();
}

detailAnimatieKeuze.addEventListener('change', () => {
  detailViewer.querySelector('model-viewer')?.setAttribute('animation-name', detailAnimatieKeuze.value);
});

detail.addEventListener('close', () => detailViewer.replaceChildren());
document.querySelector('#detail-sluit').addEventListener('click', () => detail.close());
detail.addEventListener('click', (e) => { if (e.target === detail) detail.close(); });

detailKopieer.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(actiefPad);
    detailKopieer.textContent = 'Gekopieerd';
  } catch {
    detailKopieer.textContent = actiefPad;
  }
  setTimeout(() => { detailKopieer.textContent = 'Kopieer pad'; }, 1600);
});

/* ---------- selectie ---------- */

const selectiebalk = document.querySelector('#selectiebalk');
const selectieTelling = document.querySelector('#selectiebalk-telling');
const selectieKopieer = document.querySelector('#selectie-kopieer');
const detailSelecteer = document.querySelector('#detail-selecteer');

const zichtbareKaarten = () =>
  kaarten.filter((k) => k.weergave === huidigeWeergave && !k.element.hidden);

function zetSelectie(paden, aan) {
  for (const pad of paden) {
    if (aan) gekozenPaden.add(pad);
    else gekozenPaden.delete(pad);
    for (const zusje of kaartenPerPad.get(pad) ?? []) zusje.vinkje.checked = aan;
  }
  werkSelectieBij();
}

/**
 * Shift-klik trekt de selectie door van de vorige klik tot deze, over de
 * kaarten die nú in beeld staan. Dus na filteren op "chest" pakt shift precies
 * de kisten, en niet alles wat er in de ongefilterde catalogus tussen zat.
 */
function kiesBereik(tot, aan) {
  const lijst = zichtbareKaarten();
  const van = lijst.indexOf(laatsteKeuze);
  const naar = lijst.indexOf(tot);
  if (van === -1 || naar === -1) return zetSelectie([tot.pad], aan);
  const bereik = lijst.slice(Math.min(van, naar), Math.max(van, naar) + 1);
  zetSelectie(bereik.map((k) => k.pad), aan);
}

function werkSelectieBij() {
  const aantal = gekozenPaden.size;
  selectiebalk.hidden = aantal === 0;
  selectieTelling.textContent = `${aantal} geselecteerd`;
  if (detail.open) {
    const aan = gekozenPaden.has(actiefPad);
    detailSelecteer.textContent = aan ? 'Uit selectie halen' : 'Aan selectie toevoegen';
    detailSelecteer.setAttribute('aria-pressed', String(aan));
  }
}

/**
 * Zonder klembordrechten — een pagina die niet over https draait, bijvoorbeeld
 * vanaf het bestandssysteem — valt de browser terug op een veld dat je met
 * ctrl-C leegt. Bij één pad past dat nog in het knoplabel, bij zeventig niet.
 */
async function naarKlembord(tekst) {
  try {
    await navigator.clipboard.writeText(tekst);
    return true;
  } catch {}

  const veld = document.createElement('textarea');
  veld.value = tekst;
  veld.setAttribute('readonly', '');
  veld.style.cssText = 'position:fixed;top:0;left:-9999px';
  document.body.append(veld);
  veld.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    veld.remove();
  }
}

selectieKopieer.addEventListener('click', async () => {
  const aantal = gekozenPaden.size;
  // Set houdt invoegvolgorde aan: de paden komen eruit in de volgorde waarin ze
  // zijn aangevinkt, en bij "Alles in beeld" is dat de volgorde op het scherm.
  const gelukt = await naarKlembord([...gekozenPaden].join('\n'));
  selectieKopieer.textContent = gelukt
    ? `${aantal} pad${aantal === 1 ? '' : 'en'} gekopieerd`
    : 'Kopiëren mislukt';
  setTimeout(() => { selectieKopieer.textContent = 'Kopieer paden'; }, 1600);
});

document.querySelector('#selectie-alles').addEventListener('click', () => {
  zetSelectie(zichtbareKaarten().map((k) => k.pad), true);
});

document.querySelector('#selectie-wis').addEventListener('click', () => {
  zetSelectie([...gekozenPaden], false);
  laatsteKeuze = null;
});

detailSelecteer.addEventListener('click', () => {
  zetSelectie([actiefPad], !gekozenPaden.has(actiefPad));
});

function vinkKleur(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? '#2f2a26' : '#ffffff';
}

function bouwKleurbalk(paletten) {
  const houder = document.querySelector('#kleurbalk-stalen');
  const wisknop = document.querySelector('#kleurbalk-wis');

  for (const palet of paletten) {
    if (palet.kleuren.length === 0) continue;

    const groep = document.createElement('div');
    groep.className = 'kleurgroep';

    const label = span('kleurgroep-label', palet.naam);
    label.title = palet.atlas ? `Kleuren uit ${palet.atlas}` : palet.toelichting ?? palet.naam;

    const stalen = document.createElement('div');
    stalen.className = 'kleurgroep-stalen';
    stalen.setAttribute('role', 'group');
    stalen.setAttribute('aria-label', `Filter op kleur — ${palet.naam}`);

    for (const kleur of palet.kleuren) {
      const sleutel = kleurSleutel(palet.id, kleur.hex);
      const knop = document.createElement('button');
      knop.type = 'button';
      knop.className = 'staal';
      knop.dataset.sleutel = sleutel;
      knop.style.setProperty('--staal-kleur', kleur.hex);
      knop.style.setProperty('--vink', vinkKleur(kleur.hex));
      knop.setAttribute('aria-pressed', 'false');
      const herkomst = kleur.textuur ?? kleur.materiaal;
      knop.title = `${kleur.naam} ${kleur.hex} — ${kleur.aantal} modellen · ${palet.naam}${herkomst ? ` · ${herkomst}` : ''}`;
      knop.setAttribute('aria-label', `${kleur.naam} ${kleur.hex}, ${kleur.aantal} modellen, ${palet.naam}`);

      knop.addEventListener('click', () => {
        const aan = !gekozenKleuren.has(sleutel);
        if (aan) gekozenKleuren.add(sleutel);
        else gekozenKleuren.delete(sleutel);
        knop.setAttribute('aria-pressed', String(aan));
        wisknop.hidden = gekozenKleuren.size === 0;
        filter();
      });

      stalen.append(knop);
    }

    groep.append(label, stalen);
    houder.append(groep);
    kleurgroepen.push({ palet: palet.id, element: groep });
  }

  wisknop.addEventListener('click', () => {
    gekozenKleuren.clear();
    for (const knop of houder.querySelectorAll('.staal')) knop.setAttribute('aria-pressed', 'false');
    wisknop.hidden = true;
    filter();
  });
}

function pasWeergaveToe(weergave) {
  huidigeWeergave = weergave;
  for (const knop of document.querySelectorAll('.schakelaar button')) {
    knop.setAttribute('aria-selected', String(knop.dataset.weergave === weergave));
  }
  paneel.setAttribute('aria-labelledby', `tab-${weergave}`);

  const aanwezig = new Set(kaarten.filter((k) => k.weergave === weergave).map((k) => k.palet));
  for (const groep of kleurgroepen) {
    groep.element.hidden = !aanwezig.has(groep.palet);
    if (!groep.element.hidden) continue;
    for (const knop of groep.element.querySelectorAll('.staal')) {
      gekozenKleuren.delete(knop.dataset.sleutel);
      knop.setAttribute('aria-pressed', 'false');
    }
  }
  document.querySelector('#kleurbalk-wis').hidden = gekozenKleuren.size === 0;

  filter();
}

function filter() {
  const term = zoekveld.value.trim().toLowerCase();
  let zichtbaar = 0;

  for (const kaart of kaarten) {
    const treffer =
      (!term || kaart.zoektekst.includes(term)) &&
      (gekozenKleuren.size === 0 || kaart.kleuren.some((k) => gekozenKleuren.has(k)));
    kaart.element.hidden = !treffer;
    if (treffer && kaart.weergave === huidigeWeergave) zichtbaar++;
  }

  for (const sectie of secties) {
    const inWeergave = sectie.element.dataset.weergave === huidigeWeergave;
    const aantal = sectie.kaarten.filter((k) => !k.element.hidden).length;

    sectie.element.hidden = !inWeergave || aantal === 0;
    sectie.springitem.hidden = sectie.element.hidden;
    sectie.aantalEl.textContent = `${aantal} model${aantal === 1 ? '' : 'len'}`;
    sectie.springitem.querySelector('.telling').textContent = aantal;
  }

  zoekTelling.textContent = term ? `${zichtbaar}` : '';
  leegmelding.hidden = zichtbaar > 0;
}

async function start() {
  const versie = document.querySelector('meta[name="catalogus-versie"]')?.content;
  const respons = await fetch(versie ? `kits/catalog.json?v=${versie}` : 'kits/catalog.json');
  if (!respons.ok) throw new Error(`kits/catalog.json niet gevonden (${respons.status})`);
  const data = await respons.json();

  if (Number.isFinite(data.budgetPerUnit)) budgetPerUnit = data.budgetPerUnit;

  const kits = new Map(data.kits.map((k) => [k.slug, k]));
  const groepen = new Map(data.groepen.map((g) => [g.id, g]));

  samenvatting.textContent =
    `${data.totaal} modellen · ${data.kits.length} kits · ` +
    `${data.groepen.filter((g) => g.aantal > 0).length} groepen · ` +
    `${data.paletten.length} kleurpaletten`;

  const registreer = (sectieDelen, titel, kleur, modellen) => {
    const { sectie, rooster, aantalEl } = sectieDelen;
    const eigen = [];
    for (const model of modellen) {
      const item = maakKaart(model, kits, groepen, sectie.dataset.weergave);
      rooster.append(item.element);
      eigen.push(item);
    }
    paneel.append(sectie);
    secties.push({
      element: sectie,
      kaarten: eigen,
      aantalEl,
      springitem: maakSpringitem(sectie, titel, modellen.length, kleur),
    });
  };

  // Kits die niet met de andere kits te mengen zijn, staan in een eigen tabblad:
  // de grot met zijn eigen atlas, de onderwater-kit met zijn eigen
  // materiaalkleuren. Welke dat zijn zegt de kit zelf (manifest.js → catalog.json),
  // niet een gok hier — hun modellen zitten immers in geen enkel ander tabblad.
  const opZichzelf = data.kits.filter((k) => k.tabblad);
  const eigenTabblad = new Set(opZichzelf.map((k) => k.slug));

  const bronVan = (url) =>
    url ? { href: url, tekst: `${new URL(url).host.replace(/^www\./, '')} ↗` } : null;

  for (const kit of data.kits) {
    if (eigenTabblad.has(kit.slug)) continue;
    const modellen = data.modellen.filter((m) => m.kit === kit.slug);
    const kleur = KIT_KLEUREN[kit.slug];
    registreer(
      maakSectie({
        id: `kit-${kit.slug}`,
        weergave: 'kits',
        soort: 'kit',
        titel: kit.naam,
        aantal: modellen.length,
        kleur,
        bron: bronVan(kit.url),
      }),
      kit.kort ?? kit.naam,
      kleur,
      modellen,
    );
  }

  for (const groep of data.groepen) {
    const modellen = data.modellen
      .filter((m) => m.groep === groep.id && !eigenTabblad.has(m.kit))
      .sort((a, b) => a.naam.localeCompare(b.naam, 'nl') || a.kit.localeCompare(b.kit));
    if (modellen.length === 0) continue;
    registreer(
      maakSectie({
        id: `groep-${groep.id}`,
        weergave: groep.tabblad ?? 'groepen',
        soort: 'groep',
        titel: groep.naam,
        aantal: modellen.length,
        kleur: groep.kleur,
      }),
      groep.kort ?? groep.naam,
      groep.kleur,
      modellen,
    );
  }

  for (const kit of opZichzelf) {
    const modellen = data.modellen.filter((m) => m.kit === kit.slug);
    const kleur = KIT_KLEUREN[kit.slug];
    registreer(
      maakSectie({
        id: `kit-${kit.slug}`,
        weergave: kit.tabblad,
        soort: 'kit',
        titel: kit.naam,
        aantal: modellen.length,
        kleur,
        uitleg: kit.toelichting,
        bron: bronVan(kit.url),
      }),
      kit.kort ?? kit.naam,
      kleur,
      modellen,
    );
  }

  bouwKleurbalk(data.paletten ?? []);

  for (const knop of document.querySelectorAll('.schakelaar button')) {
    knop.addEventListener('click', () => {
      pasWeergaveToe(knop.dataset.weergave);
      history.replaceState(null, '', `#${knop.dataset.weergave}`);
      window.scrollTo({ top: 0 });
    });
  }

  zoekveld.addEventListener('input', filter);

  const aliassen = new Map(
    Object.entries(GROEP_ALIASSEN).map(([oud, nieuw]) => [`groep-${oud}`, `groep-${nieuw}`]),
  );

  /**
   * De grot heeft geen sectie in de groepsweergave, dus #groep-grot bestaat niet;
   * die link hoort naar de kit zelf te wijzen. Dat mag alleen als de groep
   * nergens anders voorkomt: de onderwater-kit vult ook `dieren` en `rotsen`, en
   * daar wonen de vissen van de survival-kit en de keien van alle andere kits —
   * #groep-dieren moet dus gewoon naar de groepsweergave blijven gaan.
   */
  const groepenElders = new Set(
    data.modellen.filter((m) => !eigenTabblad.has(m.kit)).map((m) => m.groep),
  );
  for (const kit of opZichzelf) {
    for (const model of data.modellen) {
      if (model.kit === kit.slug && !groepenElders.has(model.groep)) {
        aliassen.set(`groep-${model.groep}`, `kit-${kit.slug}`);
      }
    }
  }

  const anker = location.hash.slice(1);
  const doelSectie = anker
    ? document.getElementById(anker) ?? document.getElementById(aliassen.get(anker) ?? '')
    : null;
  const weergaven = new Set([...document.querySelectorAll('.schakelaar button')].map((k) => k.dataset.weergave));
  pasWeergaveToe(doelSectie?.dataset.weergave ?? (weergaven.has(anker) ? anker : 'kits'));
  doelSectie?.scrollIntoView();
}

start().catch((fout) => {
  samenvatting.textContent = `Catalogus kon niet worden geladen: ${fout.message}`;
  console.error(fout);
});
