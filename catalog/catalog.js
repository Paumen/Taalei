const KIT_KLEUREN = {
  'survival-kit': '#6cb588',
  'pirate-kit': '#474a58',
  'modular-cave-kit': '#8a5d4b',
  'mini-forest': '#3da679',
  'fantasy-town-kit': '#995a41',
  'platformer-kit': '#ffb349',
  'onderwater-kit': '#2fa39b',
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
  { id: 'klein', teken: 'S', kort: 'Small', grens: 0.5, uitleg: 'small — under half a unit' },
  { id: 'middel', teken: 'M', kort: 'Medium', grens: 1.5, uitleg: 'medium — half to one and a half units' },
  { id: 'groot', teken: 'L', kort: 'Large', grens: Infinity, uitleg: 'large — over one and a half units' },
];

function maatKlasse(wdh) {
  const langste = Math.max(...wdh);
  const klasse = MAATKLASSEN.find((k) => langste < k.grens) ?? MAATKLASSEN.at(-1);
  return { ...klasse, langste };
}

let budgetPerUnit = 1000;

const getal = new Intl.NumberFormat('en-GB');

const paneel = document.querySelector('#paneel');
const leegmelding = document.querySelector('#leeg');
const samenvatting = document.querySelector('#samenvatting');
const detail = document.querySelector('#detail');

const kaarten = [];
const secties = [];

let groepering = 'standaard';
let sortering = 'naam';

const gekozenPaden = new Set();
const kaartenPerPad = new Map();

let laatsteKeuze = null;
let kiesModus = false;
let veeg = null;

const kleurStaat = new Map();
const maatStaat = new Map();

const tagStaat = new Map([['assembly', 'niet']]);

const VOLGENDE = { undefined: 'alleen', alleen: 'niet', niet: undefined };

function draaiStaat(kaartStaat, sleutel, knop) {
  const nieuw = VOLGENDE[kaartStaat.get(sleutel)];
  if (nieuw) kaartStaat.set(sleutel, nieuw);
  else kaartStaat.delete(sleutel);
  toonStaat(knop, nieuw);
  return nieuw;
}

function toonStaat(knop, staat) {
  knop.setAttribute('aria-pressed', String(staat === 'alleen'));
  if (staat === 'niet') knop.dataset.uit = '';
  else delete knop.dataset.uit;
}

const sleutelsMet = (kaartStaat, waarde) =>
  [...kaartStaat].filter(([, v]) => v === waarde).map(([k]) => k);

function past(eigen, kaartStaat) {
  const alleen = sleutelsMet(kaartStaat, 'alleen');
  if (alleen.length && !eigen.some((e) => alleen.includes(e))) return false;
  const niet = sleutelsMet(kaartStaat, 'niet');
  return !eigen.some((e) => niet.includes(e));
}

const kleurSleutel = (palet, hex) => `${palet}|${hex}`;

const kleurgroepen = [];
const chipknoppen = [];

let catalogus = null;

const bytesLeesbaar = (bytes) =>
  bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} kB`;

const eenheid = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });

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

const straks = globalThis.requestIdleCallback ?? ((f) => setTimeout(f, 1));

function ontkoppelViewer(vak) {
  const viewer = vak.querySelector('model-viewer');
  if (!viewer) return;

  if (viewer.loaded && !vak.dataset.momentopname) {
    straks(() => {
      if (vak.dataset.momentopname || !viewer.loaded) return;
      try {
        vak.dataset.momentopname = viewer.toDataURL('image/webp', 0.72);
        if (!vak.contains(viewer)) toonMomentopname(vak);
      } catch {}
    });
  }

  if (vak.dataset.momentopname) toonMomentopname(vak);
  else vak.replaceChildren();
}

function toonMomentopname(vak) {
  const plaatje = document.createElement('img');
  plaatje.src = vak.dataset.momentopname;
  plaatje.alt = vak.dataset.alt;
  plaatje.loading = 'lazy';
  vak.replaceChildren(plaatje);
}

function glyf(soort, teken, uitleg) {
  const el = span(`glyf glyf-${soort}`, teken);
  el.title = uitleg;
  return el;
}

function maakKaart(model, kits, groepen, varianten = []) {
  const kit = kits.get(model.kit);
  const groep = groepen.get(model.groep);

  const kaart = document.createElement('button');
  kaart.type = 'button';
  kaart.className = 'kaart';
  kaart.style.setProperty('--merk-kleur', KIT_KLEUREN[model.kit] ?? 'currentColor');

  const vak = document.createElement('div');
  vak.className = 'kaart-viewer';
  vak.dataset.src = model.pad;
  vak.dataset.alt = `3D model ${model.naam} from ${kit?.naam ?? model.kit}`;

  const maat = maatKlasse(model.wdh);
  const glyfen = span('kaart-glyfen');
  glyfen.append(glyf('maat', maat.teken, `${maat.uitleg} (langste as ${maat.langste.toFixed(2)})`));
  if (model.animaties?.length) {
    glyfen.append(glyf('animatie', '▶', `${model.animaties.length} animation${model.animaties.length > 1 ? 's' : ''} — playable in the model panel`));
  }
  if (varianten.length) {
    glyfen.append(glyf('variant', `⧉ ${varianten.length + 1}`,
      `${varianten.length + 1} variants of the same model — viewable in the model panel`));
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
  kaart.addEventListener('click', () => {
    if (kiesModus) zetSelectie([model.pad], !gekozenPaden.has(model.pad));
    else toonDetail(model);
  });

  const kies = document.createElement('label');
  kies.className = 'kaart-kies';
  const vinkje = document.createElement('input');
  vinkje.type = 'checkbox';
  vinkje.checked = gekozenPaden.has(model.pad);
  vinkje.setAttribute('aria-label', `Select ${model.naam}`);
  kies.append(vinkje);

  const houder = document.createElement('div');
  houder.className = 'kaart-houder';
  houder.append(kaart, kies);

  const familie = [model, ...varianten];

  const item = {
    element: houder,
    vinkje,
    pad: model.pad,
    palet: model.palet,
    kleuren: [...new Set(familie.flatMap((m) => m.kleuren.map((hex) => kleurSleutel(m.palet, hex))))],
    tags: [...new Set(familie.flatMap((m) => m.tags ?? []))],
    maten: [...new Set(familie.map((m) => maatKlasse(m.wdh).id))],
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

  houder.dataset.pad = model.pad;
  waarnemer.observe(vak);
  return item;
}

function kaartOnder(x, y) {
  return document.elementFromPoint(x, y)?.closest('.kaart-houder[data-pad]');
}

paneel.addEventListener('pointerdown', (e) => {
  if (!kiesModus || e.button !== 0) return;
  const houder = e.target.closest('.kaart-houder[data-pad]');
  if (!houder) return;
  veeg = { aan: !gekozenPaden.has(houder.dataset.pad), gedaan: new Set() };
  paneel.setPointerCapture(e.pointerId);
});

paneel.addEventListener('pointermove', (e) => {
  if (!veeg) return;
  const houder = kaartOnder(e.clientX, e.clientY);
  if (!houder || veeg.gedaan.has(houder.dataset.pad)) return;
  veeg.gedaan.add(houder.dataset.pad);
  zetSelectie([houder.dataset.pad], veeg.aan);
});

for (const naam of ['pointerup', 'pointercancel']) {
  paneel.addEventListener(naam, () => { veeg = null; });
}

function maakSectie({ id, soort, titel, aantal, kleur, uitleg, bron }) {
  const sectie = document.createElement('section');
  sectie.className = 'sectie';
  sectie.id = id;
  sectie.dataset.soort = soort;
  if (kleur) sectie.style.setProperty('--sectie-kleur', kleur);

  const kop = document.createElement('div');
  kop.className = 'sectie-kop';

  const titelEl = document.createElement('h2');
  titelEl.textContent = titel;

  const aantalEl = document.createElement('span');
  aantalEl.className = 'aantal';
  aantalEl.textContent = getal.format(aantal);

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

  const alles = document.createElement('button');
  alles.type = 'button';
  alles.className = 'sectie-alles';
  alles.textContent = 'Select all';
  alles.addEventListener('click', () => {
    const eigen = secties.find((s) => s.element === sectie);
    if (!eigen) return;
    const zichtbaar = eigen.kaarten.filter((k) => !k.element.hidden);
    const aan = !zichtbaar.every((k) => gekozenPaden.has(k.pad));
    zetSelectie(zichtbaar.map((k) => k.pad), aan);
  });
  kop.append(alles);

  const rooster = document.createElement('div');
  rooster.className = 'rooster';
  sectie.append(kop, rooster);
  return { sectie, rooster, aantalEl };
}

const langste = (m) => Math.max(...m.wdh);

const SORTERINGEN = {
  naam: (a, b) => a.naam.localeCompare(b.naam, 'en') || a.kit.localeCompare(b.kit),
  groot: (a, b) => langste(b) - langste(a),
  klein: (a, b) => langste(a) - langste(b),
  zwaar: (a, b) => b.driehoeken - a.driehoeken,
  licht: (a, b) => a.driehoeken - b.driehoeken,
  bestand: (a, b) => b.bytes - a.bytes,
  bestandKlein: (a, b) => a.bytes - b.bytes,
};

const ZONDER = '_zonder';

const groeperingSoort = () => (groepering === 'standaard' ? 'kit' : groepering);

function sectiesVan(modellen) {
  const inBeeld = modellen;

  const bronVan = (url) =>
    url ? { href: url, tekst: `${new URL(url).host.replace(/^www\./, '')} ↗` } : null;

  const perSleutel = (sleutels, volgorde) => {
    const bak = new Map(volgorde.map((v) => [v.id, []]));
    for (const model of inBeeld) {
      for (const sleutel of sleutels(model)) {
        if (!bak.has(sleutel)) bak.set(sleutel, []);
        bak.get(sleutel).push(model);
      }
    }
    return volgorde
      .map((v) => ({ ...v, modellen: bak.get(v.id) ?? [] }))
      .filter((v) => v.modellen.length);
  };

  const soort = groeperingSoort();

  if (soort === 'kit') {
    return perSleutel(
      (m) => [m.kit],
      catalogus.kits.map((k) => ({
        id: k.slug,
        titel: k.naam,
        kleur: KIT_KLEUREN[k.slug],
        uitleg: k.toelichting,
        bron: bronVan(k.url),
      })),
    );
  }

  if (soort === 'groep') {
    return perSleutel(
      (m) => [m.groep],
      catalogus.groepen.map((g) => ({ id: g.id, titel: g.naam, kleur: g.kleur })),
    );
  }

  if (soort === 'tag') {
    const eigen = catalogus.tags;
    const ids = new Set(eigen.map((t) => t.id));
    return perSleutel(
      (m) => {
        const raak = (m.tags ?? []).filter((id) => ids.has(id));
        return raak.length ? raak : [ZONDER];
      },
      [
        ...eigen.map((t) => ({ id: t.id, titel: t.naam, uitleg: t.beschrijving })),
        { id: ZONDER, titel: 'No tag' },
      ],
    );
  }

  return perSleutel(
    (m) => [maatKlasse(m.wdh).id],
    MAATKLASSEN.map((k) => ({ id: k.id, titel: k.kort, uitleg: k.uitleg })),
  );
}

let variantHoofd = new Map();

function vouwVarianten(modellen) {
  const perGroep = new Map();
  const uit = [];
  for (const model of modellen) {
    const bestaand = model.variant ? perGroep.get(model.variant) : null;
    if (bestaand) {
      if (model.id === variantHoofd.get(model.variant)) {
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
}

function bouwPaneel() {
  waarnemer.disconnect();
  kaarten.length = 0;
  secties.length = 0;
  kaartenPerPad.clear();
  laatsteKeuze = null;
  paneel.replaceChildren();

  const orde = SORTERINGEN[sortering] ?? SORTERINGEN.naam;

  for (const deel of sectiesVan(catalogus.modellen)) {
    const gesorteerd = [...deel.modellen].sort(orde);
    const { sectie, rooster, aantalEl } = maakSectie({
      id: `${groeperingSoort()}-${deel.id}`,
      soort: groeperingSoort(),
      titel: deel.titel,
      aantal: gesorteerd.length,
      kleur: deel.kleur,
      uitleg: deel.uitleg,
      bron: deel.bron,
    });

    const eigen = [];
    for (const { model, varianten } of vouwVarianten(gesorteerd)) {
      const item = maakKaart(model, register.kits, register.groepen, varianten);
      rooster.append(item.element);
      eigen.push(item);
    }
    paneel.append(sectie);
    secties.push({ element: sectie, kaarten: eigen, aantalEl });
  }
}

const detailViewer = document.querySelector('#detail-viewer');
const detailKopieer = document.querySelector('#detail-kopieer');
const detailAnimatie = document.querySelector('#detail-animatie');
const detailAnimatieKeuze = document.querySelector('#detail-animatie-keuze');
const detailVariant = document.querySelector('#detail-variant');
const detailVariantKeuze = document.querySelector('#detail-variant-keuze');
let actiefPad = '';

const register = { modellen: new Map(), kits: new Map(), groepen: new Map(), varianten: new Map(), tags: new Map() };

const TYPETAGS = ['object', 'structure', 'nature'];

const KORTE_NAAM = {
  'precious-metal': 'Precious',
  animation: 'Anim',
  structure: 'Struct',
  quaternius: 'Quat',
  assembly: 'Asmbly',
  ceramic: 'Cerm',
  textile: 'Textil',
  foliage: 'Foliag',
};

const chipNaam = (tag) => KORTE_NAAM[tag.id] ?? tag.naam;

const TAGSOORTEN = [
  { soort: 'materiaal', kop: 'Material' },
  { soort: 'tag', kop: 'Tags' },
];

function tagRijen(model) {
  if (!model.tags?.length) return [];
  const namen = (soort) =>
    model.tags
      .filter((id) => (register.tags.get(id)?.soort ?? 'tag') === soort)
      .map((id) => register.tags.get(id)?.naam ?? id);

  return TAGSOORTEN.map(({ soort, kop }) => [kop, namen(soort).join(', ')]).filter(
    ([, waarde]) => waarde,
  );
}

function toonDetail(model) {
  const kit = register.kits.get(model.kit);
  const groep = register.groepen.get(model.groep);
  actiefPad = model.pad;
  document.querySelector('#detail-naam').textContent = model.naam;
  document.querySelector('#detail-herkomst').textContent =
    `${kit?.naam ?? model.kit} · ${groep?.naam ?? model.groep}`;

  const rijen = [
    ['Size (w × d × h)', afmeting(model.wdh)],
    ['Triangles', `${getal.format(model.driehoeken)}${model.driehoeken >= ZWAAR_VANAF ? ' (heavy)' : ''}`],
    [
      'Triangles per unit',
      !Number.isFinite(model.driehoekenPerUnit)
        ? '—'
        : `${getal.format(model.driehoekenPerUnit)}${model.driehoekenPerUnit > budgetPerUnit ? ` (over budget of ${getal.format(budgetPerUnit)})` : ''}`,
    ],
    ['Draw calls', model.calls === undefined ? '—' : getal.format(model.calls)],
    ['Materials', getal.format(model.materialen)],
    ...(model.animaties?.length
      ? [[`Animations (${model.animaties.length})`, model.animaties.join(', ')]]
      : []),
    ...tagRijen(model),
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
  viewer.alt = `3D model ${model.naam}`;
  viewer.setAttribute('camera-controls', '');
  viewer.setAttribute('camera-orbit', '35deg 68deg auto');
  viewer.setAttribute('shadow-softness', '0.9');
  zetBelichting(viewer, '0.7');

  const clips = model.animaties ?? [];
  viewer.setAttribute('auto-rotate', '');
  viewer.setAttribute('rotation-per-second', '18deg');

  detailAnimatie.hidden = clips.length === 0;
  detailAnimatieKeuze.replaceChildren(
    ...[[UIT, 'off'], ...clips.map((naam) => [naam, naam])].map(([waarde, tekst]) =>
      keuzeChip(tekst, waarde === UIT, () => zetAnimatie(waarde), detailAnimatieKeuze),
    ),
  );

  const leden = (register.varianten.get(model.variant) ?? [])
    .map((id) => register.modellen.get(id))
    .filter(Boolean);
  detailVariant.hidden = leden.length < 2;
  detailVariantKeuze.replaceChildren(
    ...leden.map((v) =>
      keuzeChip(
        v.kit === model.kit ? v.naam : `${v.naam} (${v.kit})`,
        v.id === model.id,
        () => toonDetail(v),
        detailVariantKeuze,
        v.pad,
      ),
    ),
  );

  detailViewer.replaceChildren(viewer);

  detail.showModal();
  werkSelectieBij();
}

const UIT = '';

function keuzeChip(tekst, actief, doe, houder, pad) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'keuzechip';
  chip.textContent = tekst;
  chip.setAttribute('aria-pressed', String(actief));
  chip.addEventListener('click', () => {
    for (const zusje of houder.querySelectorAll('.keuzechip')) zusje.setAttribute('aria-pressed', 'false');
    chip.setAttribute('aria-pressed', 'true');
    doe();
  });
  if (pad) {
    const kies = document.createElement('input');
    kies.type = 'checkbox';
    kies.className = 'keuzechip-kies';
    kies.checked = gekozenPaden.has(pad);
    kies.setAttribute('aria-label', `Select ${tekst}`);
    kies.addEventListener('click', (e) => {
      e.stopPropagation();
      zetSelectie([pad], kies.checked);
    });
    chip.prepend(kies);
  }
  return chip;
}

function zetAnimatie(clip) {
  const viewer = detailViewer.querySelector('model-viewer');
  if (!viewer) return;
  if (clip === UIT) {
    viewer.pause();
    viewer.removeAttribute('animation-name');
    viewer.setAttribute('auto-rotate', '');
  } else {
    viewer.removeAttribute('auto-rotate');
    viewer.setAttribute('animation-name', clip);
    viewer.play();
  }
}

detail.addEventListener('close', () => detailViewer.replaceChildren());
document.querySelector('#detail-sluit').addEventListener('click', () => detail.close());
detail.addEventListener('click', (e) => { if (e.target === detail) detail.close(); });

detailKopieer.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(actiefPad);
    detailKopieer.textContent = 'Copied';
  } catch {
    detailKopieer.textContent = actiefPad;
  }
  setTimeout(() => { detailKopieer.textContent = 'Copy path'; }, 1600);
});

const selectiebalk = document.querySelector('#selectiebalk');
const selectieTelling = document.querySelector('#selectiebalk-telling');
const selectieKopieer = document.querySelector('#selectie-kopieer');
const detailSelecteer = document.querySelector('#detail-selecteer');

const zichtbareKaarten = () => kaarten.filter((k) => !k.element.hidden);

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
  selectieTelling.textContent = `${aantal} selected`;
  if (detail.open) {
    const aan = gekozenPaden.has(actiefPad);
    detailSelecteer.textContent = aan ? 'Remove from selection' : 'Add to selection';
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
    ? `${aantal} path${aantal === 1 ? '' : 's'} copied`
    : 'Copy failed';
  setTimeout(() => { selectieKopieer.textContent = 'Copy paths'; }, 1600);
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

  for (const palet of paletten) {
    if (palet.kleuren.length === 0) continue;

    const groep = document.createElement('div');
    groep.className = 'kleurgroep';

    const stalen = document.createElement('div');
    stalen.className = 'kleurgroep-stalen';
    stalen.setAttribute('role', 'group');
    stalen.setAttribute('aria-label', `Filter by colour — ${palet.naam}`);

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
      knop.title = `${kleur.naam} ${kleur.hex} — ${kleur.aantal} models · ${palet.naam}${herkomst ? ` · ${herkomst}` : ''}`;
      knop.setAttribute('aria-label', `${kleur.naam} ${kleur.hex}, ${kleur.aantal} models, ${palet.naam}`);

      knop.addEventListener('click', () => {
        draaiStaat(kleurStaat, sleutel, knop);
        filter();
      });

      stalen.append(knop);
    }

    groep.append(stalen);
    houder.append(groep);
    kleurgroepen.push({ palet: palet.id, element: groep });
  }
}

function herschik() {
  for (const strip of new Set(chipknoppen.map((c) => c.strip))) {
    const eigen = chipknoppen
      .filter((c) => c.strip === strip)
      .sort((a, b) => Number(b.staat.has(b.id)) - Number(a.staat.has(a.id)) || a.volgorde - b.volgorde);
    for (const chip of eigen) strip.append(chip.element);
  }
}

function bouwChiprij(houder, kop, items, staat, veld) {
  const rij = document.createElement('div');
  rij.className = 'kleurbalk tagrij';
  const strip = document.createElement('div');
  strip.className = 'tagbalk-knoppen';
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', `Filter by ${kop.toLowerCase()}`);

  const eigenIds = items.map((i) => i.id);

  for (const item of items) {
    const knop = document.createElement('button');
    knop.type = 'button';
    knop.className = 'tagknop';
    knop.dataset.tag = item.id;
    knop.title = item.uitleg ?? item.naam;
    toonStaat(knop, staat.get(item.id));
    const aantalEl = span('tagknop-aantal');
    knop.append(document.createTextNode(item.naam), aantalEl);

    knop.addEventListener('click', () => {
      draaiStaat(staat, item.id, knop);
      herschik();
      filter();
    });

    strip.append(knop);
    chipknoppen.push({ id: item.id, element: knop, aantalEl, rij, eigenIds, staat, veld, strip, volgorde: chipknoppen.length });
  }

  rij.append(strip);
  houder.append(rij);
}

function bouwTagbalk(tags) {
  const houder = document.querySelector('#tagbalk');

  bouwChiprij(
    houder,
    'Size',
    MAATKLASSEN.map((k) => ({ id: k.id, naam: k.kort, uitleg: k.uitleg })),
    maatStaat,
    'maten',
  );

  const typen = TYPETAGS.map((id) => tags.find((t) => t.id === id)).filter(Boolean);
  if (typen.length) {
    bouwChiprij(houder, 'Type', typen.map((t) => ({ id: t.id, naam: chipNaam(t), uitleg: t.beschrijving })), tagStaat, 'tags');
  }

  for (const { soort, kop } of TAGSOORTEN) {
    const eigen = tags.filter((t) => (t.soort ?? 'tag') === soort && !TYPETAGS.includes(t.id));
    if (eigen.length === 0) continue;
    bouwChiprij(
      houder,
      kop,
      eigen.map((t) => ({ id: t.id, naam: chipNaam(t), uitleg: t.beschrijving })),
      tagStaat,
      'tags',
    );
  }
}

function ververs() {
  bouwPaneel();

  const paletten = new Set(kaarten.map((k) => k.palet));
  for (const groep of kleurgroepen) {
    groep.element.hidden = !paletten.has(groep.palet);
    if (!groep.element.hidden) continue;
    for (const knop of groep.element.querySelectorAll('.staal')) {
      kleurStaat.delete(knop.dataset.sleutel);
      toonStaat(knop, undefined);
    }
  }
  const tellingen = new Map();
  for (const kaart of kaarten) {
    for (const veld of ['tags', 'maten']) {
      for (const id of kaart[veld]) tellingen.set(`${veld}|${id}`, (tellingen.get(`${veld}|${id}`) ?? 0) + 1);
    }
  }
  for (const { id, element, aantalEl, staat, veld } of chipknoppen) {
    const aantal = tellingen.get(`${veld}|${id}`) ?? 0;
    element.hidden = aantal === 0;
    aantalEl.textContent = aantal;
    if (aantal === 0 && staat.get(id) === 'alleen') {
      staat.delete(id);
      toonStaat(element, undefined);
    }
  }
  herschik();
  for (const { rij } of chipknoppen) {
    rij.hidden = !chipknoppen.some((c) => c.rij === rij && !c.element.hidden);
  }
  document.querySelector('#alles-wis').hidden = kleurStaat.size + tagStaat.size + maatStaat.size === 0;

  filter();
}

function alsGewist() {
  kleurStaat.clear();
  tagStaat.clear();
  maatStaat.clear();
  for (const knop of document.querySelectorAll('.staal')) toonStaat(knop, undefined);
  for (const { element } of chipknoppen) toonStaat(element, undefined);
  herschik();
  filter();
}

function filter() {
  document.querySelector('#alles-wis').hidden =
    kleurStaat.size + tagStaat.size + maatStaat.size === 0;
  let zichtbaar = 0;

  for (const kaart of kaarten) {
    const treffer =
      past(kaart.kleuren, kleurStaat) && past(kaart.tags, tagStaat) && past(kaart.maten, maatStaat);
    kaart.element.hidden = !treffer;
    if (treffer) zichtbaar++;
  }

  for (const sectie of secties) {
    const aantal = sectie.kaarten.filter((k) => !k.element.hidden).length;

    sectie.element.hidden = aantal === 0;
    sectie.aantalEl.textContent = getal.format(aantal);
  }

  leegmelding.hidden = zichtbaar > 0;
}

async function start() {
  const versie = document.querySelector('meta[name="catalogus-versie"]')?.content;
  const respons = await fetch(versie ? `catalog/catalog.json?v=${versie}` : 'catalog/catalog.json');
  if (!respons.ok) throw new Error(`catalog/catalog.json not found (${respons.status})`);
  const data = await respons.json();

  if (Number.isFinite(data.budgetPerUnit)) budgetPerUnit = data.budgetPerUnit;

  const kits = new Map(data.kits.map((k) => [k.slug, k]));
  const groepen = new Map(data.groepen.map((g) => [g.id, g]));

  register.kits = kits;
  register.groepen = groepen;
  register.modellen = new Map(data.modellen.map((m) => [m.id, m]));
  register.varianten = new Map((data.varianten ?? []).map((v) => [v.id, v.leden]));

  samenvatting.textContent =
    `${data.totaal} models · ${data.kits.length} kits · ` +
    `${data.groepen.filter((g) => g.aantal > 0).length} groups`;

  variantHoofd = new Map((data.varianten ?? []).map((v) => [v.id, v.hoofd]));
  catalogus = data;

  register.tags = new Map((data.tags ?? []).map((t) => [t.id, t]));

  bouwKleurbalk(data.paletten ?? []);
  bouwTagbalk(data.tags ?? []);

  document.querySelector('#alles-wis').addEventListener('click', alsGewist);

  const kiesKnop = document.querySelector('#kiesmodus');
  kiesKnop.addEventListener('click', () => {
    kiesModus = !kiesModus;
    kiesKnop.setAttribute('aria-pressed', String(kiesModus));
    document.body.classList.toggle('kiesmodus', kiesModus);
  });

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

  const keuzeGroepering = document.querySelector('#groepering');
  const keuzeSortering = document.querySelector('#sortering');
  keuzeGroepering.value = groepering;
  keuzeSortering.value = sortering;
  keuzeGroepering.addEventListener('change', () => {
    groepering = keuzeGroepering.value;
    ververs();
  });
  keuzeSortering.addEventListener('change', () => {
    sortering = keuzeSortering.value;
    ververs();
  });

  const ruw = location.hash.slice(1);
  const anker = aliassen.get(ruw) ?? ruw;
  ververs();
  document.getElementById(anker)?.scrollIntoView();
}

start().catch((fout) => {
  samenvatting.textContent = `Could not load the catalogue: ${fout.message}`;
  console.error(fout);
});
