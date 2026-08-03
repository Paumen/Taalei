const KIT_KLEUREN = {
  'survival-kit': '#6cb588',
  'pirate-kit': '#474a58',
  'modular-cave-kit': '#8a5d4b',
  'mini-forest': '#3da679',
  'fantasy-town-kit': '#995a41',
  'platformer-kit': '#ffb349',
  'mini-dungeon': '#6d738a',
};

const GROEP_ALIASSEN = {
  bouw: 'bouwwerken',
  mechaniek: 'items',
};

const ZWAAR_VANAF = 1500;

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

function koppelViewer(vak) {
  if (vak.querySelector('model-viewer')) return;

  const viewer = document.createElement('model-viewer');
  viewer.src = vak.dataset.src;
  viewer.alt = vak.dataset.alt;
  viewer.setAttribute('camera-orbit', '35deg 68deg auto');
  viewer.setAttribute('environment-image', 'neutral');
  viewer.setAttribute('shadow-intensity', '0.6');
  viewer.setAttribute('shadow-softness', '0.9');
  viewer.setAttribute('exposure', '1.05');
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
  const zwaar = model.driehoeken >= ZWAAR_VANAF;

  const kaart = document.createElement('button');
  kaart.type = 'button';
  kaart.className = 'kaart';
  kaart.style.setProperty('--merk-kleur', KIT_KLEUREN[model.kit] ?? 'currentColor');

  const vak = document.createElement('div');
  vak.className = 'kaart-viewer';
  vak.dataset.src = model.pad;
  vak.dataset.alt = `3D-model ${model.naam} uit ${kit?.naam ?? model.kit}`;

  const tekst = document.createElement('div');
  tekst.className = 'kaart-tekst';
  const meta = span('kaart-meta');
  meta.append(
    span('kaart-merk', kit?.naam ?? model.kit),
    span(`kaart-tri${zwaar ? ' zwaar' : ''}`, `${getal.format(model.driehoeken)} tri`),
    span('kaart-grootte', bytesLeesbaar(model.bytes)),
  );
  tekst.append(span('kaart-naam', model.naam), meta);

  kaart.append(vak, tekst);
  kaart.addEventListener('click', () => toonDetail(model, kit, groep));

  const item = {
    element: kaart,
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
    ['Tekenopdrachten', model.calls === undefined ? '—' : getal.format(model.calls)],
    ['Materialen', getal.format(model.materialen)],
    ['Grootte', bytesLeesbaar(model.bytes)],
    ['Licentie', `CC0 — ${kit?.licentie ?? 'zie kitmap'}`],
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
  viewer.setAttribute('auto-rotate', '');
  viewer.setAttribute('rotation-per-second', '18deg');
  viewer.setAttribute('camera-orbit', '35deg 68deg auto');
  viewer.setAttribute('environment-image', 'neutral');
  viewer.setAttribute('shadow-intensity', '0.7');
  viewer.setAttribute('shadow-softness', '0.9');
  detailViewer.replaceChildren(viewer);

  detail.showModal();
}

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
    label.title = `Kleuren uit ${palet.atlas}`;

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
      knop.title = `${kleur.naam} ${kleur.hex} — ${kleur.aantal} modellen · ${palet.naam}${kleur.textuur ? ` · ${kleur.textuur}` : ''}`;
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
  const respons = await fetch(versie ? `catalog.json?v=${versie}` : 'catalog.json');
  if (!respons.ok) throw new Error(`catalog.json niet gevonden (${respons.status})`);
  const data = await respons.json();

  const kits = new Map(data.kits.map((k) => [k.slug, k]));
  const groepen = new Map(data.groepen.map((g) => [g.id, g]));

  samenvatting.textContent =
    `${data.totaal} modellen · ${data.kits.length} kits · ` +
    `${data.groepen.filter((g) => g.aantal > 0).length} semantische groepen · ` +
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

  const kitsPerPalet = new Map();
  for (const kit of data.kits) {
    if (kit.palet) kitsPerPalet.set(kit.palet, (kitsPerPalet.get(kit.palet) ?? 0) + 1);
  }
  const paletten = new Map((data.paletten ?? []).map((p) => [p.id, p]));

  const opZichzelf = data.kits.filter((k) => k.palet && kitsPerPalet.get(k.palet) === 1);
  const eigenTabblad = new Set(opZichzelf.map((k) => k.slug));

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
        bron: kit.url ? { href: kit.url, tekst: 'kenney.nl ↗' } : null,
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
        weergave: 'grot',
        soort: 'kit',
        titel: kit.naam,
        aantal: modellen.length,
        kleur,
        uitleg: `Staat op zichzelf: eigen texture-atlas (${paletten.get(kit.palet)?.atlas}) en eigen kleuren, gedeeld met geen enkele andere kit. Daarom een eigen tabblad — deze modellen zijn niet uitwisselbaar met die van de andere kits.`,
        bron: kit.url ? { href: kit.url, tekst: 'kenney.nl ↗' } : null,
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

  for (const kit of opZichzelf) {
    for (const model of data.modellen) {
      if (model.kit === kit.slug) aliassen.set(`groep-${model.groep}`, `kit-${kit.slug}`);
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
