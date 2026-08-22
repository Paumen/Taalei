const KIT_KLEUREN = {
  'survival-kit': '#6cb588',
  'pirate-kit': '#474a58',
  'modular-cave-kit': '#8a5d4b',
  'mini-forest': '#3da679',
  'fantasy-town-kit': '#995a41',
  'platformer-kit': '#ffb349',
  'mini-dungeon': '#6d738a',
  'onderwater-kit': '#2fa39b',
  nature: '#7f6a52',
  tropical: '#6d8d33',
  'modulair-terrein': '#4f7a3a',
  props: '#b7946e',
  rocks: '#8a91ae',
};

const GROEP_ALIASSEN = {
  bouw: 'bouwwerken',
  mechaniek: 'items',
  terrein: 'grond',
  reisgerei: 'items',
  kamp: 'huisraad',
};

const ZWAAR_VANAF = 5000;

const MAATKLASSEN = [
  { id: 'klein', teken: 'S', grens: 0.5, uitleg: 'klein — kleiner dan een halve unit' },
  { id: 'middel', teken: 'M', grens: 1.5, uitleg: 'middel — een halve tot anderhalve unit' },
  { id: 'groot', teken: 'L', grens: Infinity, uitleg: 'groot — meer dan anderhalve unit' },
];

function maatKlasse(wdh) {
  const langste = Math.max(...wdh);
  const klasse = MAATKLASSEN.find((k) => langste < k.grens) ?? MAATKLASSEN.at(-1);
  return { ...klasse, langste };
}

let budgetPerUnit = 1000;

const getal = new Intl.NumberFormat('nl-NL');

const paneel = document.querySelector('#paneel');
const leegmelding = document.querySelector('#leeg');
const samenvatting = document.querySelector('#samenvatting');
const detail = document.querySelector('#detail');

const kaarten = [];
const secties = [];

let huidigeWeergave = 'kits';

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

function demoClip(clips) {
  return clips.find((naam) => naam === 'open-close' || naam === 'toggle') ?? clips[0];
}

const VLAK_OMGEVING = 'catalog/effen-omgeving.png';
const vlakkeModus = { aan: false };

function zetBelichting(viewer, schaduw) {
  if (vlakkeModus.aan) {
    viewer.setAttribute('environment-image', VLAK_OMGEVING);
    viewer.setAttribute('shadow-intensity', '0');
    viewer.setAttribute('exposure', '1.3');
  } else {
    viewer.setAttribute('environment-image', 'neutral');
    viewer.setAttribute('shadow-intensity', schaduw);
    viewer.setAttribute('exposure', '1.05');
  }
}

function koppelViewer(vak) {
  if (vak.querySelector('model-viewer')) return;

  const viewer = document.createElement('model-viewer');
  viewer.src = vak.dataset.src;
  viewer.alt = vak.dataset.alt;
  viewer.setAttribute('camera-orbit', '35deg 68deg auto');
  viewer.setAttribute('shadow-softness', '0.9');
  zetBelichting(viewer, '0.6');
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

function glyf(soort, teken, uitleg) {
  const el = span(`glyf glyf-${soort}`, teken);
  el.title = uitleg;
  return el;
}

function maakKaart(model, kits, groepen, weergave, varianten = []) {
  const kit = kits.get(model.kit);
  const groep = groepen.get(model.groep);

  const kaart = document.createElement('button');
  kaart.type = 'button';
  kaart.className = 'kaart';
  kaart.style.setProperty('--merk-kleur', KIT_KLEUREN[model.kit] ?? 'currentColor');

  const vak = document.createElement('div');
  vak.className = 'kaart-viewer';
  vak.dataset.src = model.pad;
  vak.dataset.alt = `3D-model ${model.naam} uit ${kit?.naam ?? model.kit}`;

  const maat = maatKlasse(model.wdh);
  const glyfen = span('kaart-glyfen');
  glyfen.append(glyf('maat', maat.teken, `${maat.uitleg} (langste as ${maat.langste.toFixed(2)})`));
  if (model.animaties?.length) {
    glyfen.append(glyf('animatie', '▶', `${model.animaties.length} animatie${model.animaties.length > 1 ? 's' : ''} — af te spelen in het modelpaneel`));
  }
  if (varianten.length) {
    glyfen.append(glyf('variant', `⧉ ${varianten.length + 1}`,
      `${varianten.length + 1} varianten van hetzelfde model — te bekijken in het modelpaneel`));
  }

  const tekst = document.createElement('div');
  tekst.className = 'kaart-tekst';
  const meta = span('kaart-meta');
  meta.append(
    span('kaart-merk', kit?.naam ?? model.kit),
    span('kaart-grootte', bytesLeesbaar(model.bytes)),
  );
  tekst.append(span('kaart-naam', model.naam), meta);

  kaart.append(vak, glyfen, tekst);
  kaart.addEventListener('click', () => toonDetail(model));

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

  const familie = [model, ...varianten];

  const item = {
    element: houder,
    vinkje,
    pad: model.pad,
    weergave,
    palet: model.palet,
    kleuren: [...new Set(familie.flatMap((m) => m.kleuren.map((hex) => kleurSleutel(m.palet, hex))))],
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

const detailViewer = document.querySelector('#detail-viewer');
const detailKopieer = document.querySelector('#detail-kopieer');
const detailAnimatie = document.querySelector('#detail-animatie');
const detailAnimatieKeuze = document.querySelector('#detail-animatie-keuze');
const detailVariant = document.querySelector('#detail-variant');
const detailVariantKeuze = document.querySelector('#detail-variant-keuze');
let actiefPad = '';

const register = { modellen: new Map(), kits: new Map(), groepen: new Map(), varianten: new Map() };

function toonDetail(model) {
  const kit = register.kits.get(model.kit);
  const groep = register.groepen.get(model.groep);
  actiefPad = model.pad;
  document.querySelector('#detail-naam').textContent = model.naam;
  document.querySelector('#detail-herkomst').textContent =
    `${kit?.naam ?? model.kit} · ${groep?.naam ?? model.groep}`;

  const rijen = [
    ['Bestand', model.pad],
    ['Afmetingen (b × d × h)', afmeting(model.wdh)],
    ['Driehoeken', `${getal.format(model.driehoeken)}${model.driehoeken >= ZWAAR_VANAF ? ' (zwaar)' : ''}`],
    [
      'Driehoeken per unit',
      !Number.isFinite(model.driehoekenPerUnit)
        ? '—'
        : `${getal.format(model.driehoekenPerUnit)}${model.driehoekenPerUnit > budgetPerUnit ? ` (boven budget van ${getal.format(budgetPerUnit)})` : ''}`,
    ],
    ['Tekenopdrachten', model.calls === undefined ? '—' : getal.format(model.calls)],
    ['Materialen', getal.format(model.materialen)],
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
  viewer.setAttribute('shadow-softness', '0.9');
  zetBelichting(viewer, '0.7');

  const clips = model.animaties ?? [];
  viewer.setAttribute('auto-rotate', '');
  viewer.setAttribute('rotation-per-second', '18deg');

  detailAnimatie.hidden = clips.length === 0;
  detailAnimatieKeuze.replaceChildren(
    optie(UIT, 'uit (draaitafel)'),
    ...clips.map((naam) => optie(naam, naam === demoClip(clips) && clips.length > 1 ? `${naam} (rondloop)` : naam)),
  );
  detailAnimatieKeuze.value = UIT;

  const leden = (register.varianten.get(model.variant) ?? [])
    .map((id) => register.modellen.get(id))
    .filter(Boolean);
  detailVariant.hidden = leden.length < 2;
  detailVariantKeuze.replaceChildren(...leden.map((v) => optie(v.id, v.kit === model.kit ? v.naam : `${v.naam} (${v.kit})`)));
  detailVariantKeuze.value = model.id;

  detailViewer.replaceChildren(viewer);

  detail.showModal();
  werkSelectieBij();
}

const UIT = '';

function optie(waarde, tekst) {
  const el = document.createElement('option');
  el.value = waarde;
  el.textContent = tekst;
  return el;
}

detailAnimatieKeuze.addEventListener('change', () => {
  const viewer = detailViewer.querySelector('model-viewer');
  if (!viewer) return;
  const clip = detailAnimatieKeuze.value;
  if (clip === UIT) {
    viewer.pause();
    viewer.removeAttribute('animation-name');
    viewer.setAttribute('auto-rotate', '');
  } else {
    viewer.removeAttribute('auto-rotate');
    viewer.setAttribute('animation-name', clip);
    viewer.play();
  }
});

detailVariantKeuze.addEventListener('change', () => {
  const gekozen = register.modellen.get(detailVariantKeuze.value);
  if (gekozen) toonDetail(gekozen);
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
  let zichtbaar = 0;

  for (const kaart of kaarten) {
    const treffer =
      gekozenKleuren.size === 0 || kaart.kleuren.some((k) => gekozenKleuren.has(k));
    kaart.element.hidden = !treffer;
    if (treffer && kaart.weergave === huidigeWeergave) zichtbaar++;
  }

  for (const sectie of secties) {
    const inWeergave = sectie.element.dataset.weergave === huidigeWeergave;
    const aantal = sectie.kaarten.filter((k) => !k.element.hidden).length;

    sectie.element.hidden = !inWeergave || aantal === 0;
    sectie.aantalEl.textContent = `${aantal} model${aantal === 1 ? '' : 'len'}`;
  }

  leegmelding.hidden = zichtbaar > 0;
}

async function start() {
  const versie = document.querySelector('meta[name="catalogus-versie"]')?.content;
  const respons = await fetch(versie ? `catalog/catalog.json?v=${versie}` : 'catalog/catalog.json');
  if (!respons.ok) throw new Error(`catalog/catalog.json niet gevonden (${respons.status})`);
  const data = await respons.json();

  if (Number.isFinite(data.budgetPerUnit)) budgetPerUnit = data.budgetPerUnit;

  const kits = new Map(data.kits.map((k) => [k.slug, k]));
  const groepen = new Map(data.groepen.map((g) => [g.id, g]));

  register.kits = kits;
  register.groepen = groepen;
  register.modellen = new Map(data.modellen.map((m) => [m.id, m]));
  register.varianten = new Map((data.varianten ?? []).map((v) => [v.id, v.leden]));

  samenvatting.textContent =
    `${data.totaal} modellen · ${data.kits.length} kits · ` +
    `${data.groepen.filter((g) => g.aantal > 0).length} groepen · ` +
    `${data.paletten.length} kleurpaletten`;

  const hoofdVan = new Map((data.varianten ?? []).map((v) => [v.id, v.hoofd]));

  const vouwVarianten = (modellen) => {
    const perGroep = new Map();
    const uit = [];
    for (const model of modellen) {
      const bestaand = model.variant ? perGroep.get(model.variant) : null;
      if (bestaand) {
        if (model.id === hoofdVan.get(model.variant)) {
          bestaand.varianten.push(bestaand.model);
          bestaand.model = model;
        } else {
          bestaand.varianten.push(model);
        }
        continue;
      }
      const item = { model, varianten: [] };
      if (model.variant) perGroep.set(model.variant, item);
      uit.push(item);
    }
    return uit;
  };

  const registreer = (sectieDelen, modellen) => {
    const { sectie, rooster, aantalEl } = sectieDelen;
    const eigen = [];
    const gevouwen = vouwVarianten(modellen);
    for (const { model, varianten } of gevouwen) {
      const item = maakKaart(model, kits, groepen, sectie.dataset.weergave, varianten);
      rooster.append(item.element);
      eigen.push(item);
    }
    paneel.append(sectie);
    secties.push({ element: sectie, kaarten: eigen, aantalEl });
  };

  const opZichzelf = data.kits.filter((k) => k.tabblad);
  const eigenTabblad = new Set(opZichzelf.map((k) => k.slug));
  const kitGroep = new Map(opZichzelf.map((k) => [k.slug, k.kitGroep]));
  const inGroepsweergave = (model) =>
    !eigenTabblad.has(model.kit) || model.groep !== kitGroep.get(model.kit);

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
      modellen,
    );
  }

  for (const groep of data.groepen) {
    const modellen = data.modellen
      .filter((m) => m.groep === groep.id && inGroepsweergave(m))
      .sort((a, b) => a.naam.localeCompare(b.naam, 'nl') || a.kit.localeCompare(b.kit));
    if (modellen.length === 0) continue;
    registreer(
      maakSectie({
        id: `groep-${groep.id}`,
        weergave: groep.tabblad ?? 'objects',
        soort: 'groep',
        titel: groep.naam,
        aantal: modellen.length,
        kleur: groep.kleur,
      }),
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

  const lichtKnop = document.querySelector('#licht');
  lichtKnop.addEventListener('click', () => {
    vlakkeModus.aan = !vlakkeModus.aan;
    lichtKnop.setAttribute('aria-pressed', String(vlakkeModus.aan));

    for (const vak of document.querySelectorAll('.kaart-viewer')) {
      delete vak.dataset.momentopname;
      const viewer = vak.querySelector('model-viewer');
      if (viewer) zetBelichting(viewer, '0.6');
      else if (vak.querySelector('img')) koppelViewer(vak);
    }
    const detailViewerEl = detailViewer.querySelector('model-viewer');
    if (detailViewerEl) zetBelichting(detailViewerEl, '0.7');
  });

  const aliassen = new Map(
    Object.entries(GROEP_ALIASSEN).map(([oud, nieuw]) => [`groep-${oud}`, `groep-${nieuw}`]),
  );

  const groepenElders = new Set(data.modellen.filter(inGroepsweergave).map((m) => m.groep));
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
