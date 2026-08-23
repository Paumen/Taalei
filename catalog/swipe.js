const RICHTINGEN = [
  { id: 'links', teken: '←', naam: 'Links', standaard: 'Weg' },
  { id: 'rechts', teken: '→', naam: 'Rechts', standaard: 'Houden' },
  { id: 'omhoog', teken: '↑', naam: 'Omhoog', standaard: 'Tag' },
  { id: 'omlaag', teken: '↓', naam: 'Omlaag', standaard: 'Later' },
];

const RICHTING_IDS = RICHTINGEN.map((r) => r.id);
const OPSLAGSLEUTEL = 'taaleiland-swipe-v1';
const drempel = () => Math.max(48, Math.min(96, innerWidth * 0.2));
const VLAK_OMGEVING = 'effen-omgeving.png';

const getal = new Intl.NumberFormat('nl-NL');
const eenheid = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 2 });

const bytesLeesbaar = (bytes) =>
  bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} kB`;

const afmeting = (wdh) =>
  Array.isArray(wdh) ? `${wdh.map((v) => eenheid.format(v)).join(' × ')} units` : '—';

const el = (sel) => document.querySelector(sel);

const opzet = el('#opzet');
const dek = el('#dek');
const uitslag = el('#uitslag');
const stapel = el('#stapel');
const melding = el('#melding');
const samenvatting = el('#samenvatting');

const vlakkeModus = { aan: false };

const register = { modellen: [], perId: new Map(), kits: new Map(), groepen: new Map() };

const staat = {
  filters: { zoek: '', kits: [], groepen: [], schud: false },
  labels: Object.fromEntries(RICHTINGEN.map((r) => [r.id, r.standaard])),
  volgorde: [],
  keuzes: [],
  begonnen: false,
};

function bewaar() {
  try {
    localStorage.setItem(OPSLAGSLEUTEL, JSON.stringify(staat));
  } catch {}
}

function laad() {
  let opgeslagen;
  try {
    opgeslagen = JSON.parse(localStorage.getItem(OPSLAGSLEUTEL) ?? 'null');
  } catch {
    return;
  }
  if (!opgeslagen || typeof opgeslagen !== 'object') return;

  Object.assign(staat.filters, opgeslagen.filters ?? {});
  for (const richting of RICHTING_IDS) {
    if (typeof opgeslagen.labels?.[richting] === 'string') staat.labels[richting] = opgeslagen.labels[richting];
  }
  staat.volgorde = (opgeslagen.volgorde ?? []).filter((id) => register.perId.has(id));
  staat.keuzes = (opgeslagen.keuzes ?? []).filter(
    (k) => register.perId.has(k?.id) && RICHTING_IDS.includes(k?.richting),
  );
  staat.begonnen = Boolean(opgeslagen.begonnen) && staat.volgorde.length > 0;
}

const labelVan = (richting) => staat.labels[richting]?.trim() || RICHTINGEN.find((r) => r.id === richting).standaard;

const keuzePerId = () => new Map(staat.keuzes.map((k) => [k.id, k.richting]));

function resterend() {
  const beslist = keuzePerId();
  return staat.volgorde.filter((id) => !beslist.has(id));
}

function past(model) {
  const { zoek, kits, groepen } = staat.filters;
  if (kits.length && !kits.includes(model.kit)) return false;
  if (groepen.length && !groepen.includes(model.groep)) return false;
  if (zoek) {
    const naald = zoek.toLowerCase();
    if (!`${model.naam} ${model.kit} ${model.groep}`.toLowerCase().includes(naald)) return false;
  }
  return true;
}

function schud(lijst) {
  const uit = [...lijst];
  for (let i = uit.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [uit[i], uit[j]] = [uit[j], uit[i]];
  }
  return uit;
}

/* — schermen — */

function toon(scherm) {
  document.body.dataset.scherm = scherm;
  opzet.hidden = scherm !== 'opzet';
  dek.hidden = scherm !== 'dek';
  uitslag.hidden = scherm !== 'uitslag';
  if (scherm === 'dek') tekenDek();
  if (scherm === 'uitslag') tekenUitslag();
  werkSamenvattingBij();
}

function werkSamenvattingBij() {
  const totaal = staat.volgorde.length;
  if (!totaal) {
    samenvatting.textContent = 'Geen modellen in deze selectie — pas de instellingen aan.';
    return;
  }
  const gedaan = staat.keuzes.length;
  const delen = RICHTINGEN.map((r) => {
    const aantal = staat.keuzes.filter((k) => k.richting === r.id).length;
    return `${r.teken} ${labelVan(r.id)} ${aantal}`;
  });
  samenvatting.textContent = `${getal.format(gedaan)} van ${getal.format(totaal)} beoordeeld · ${delen.join(' · ')}`;
}

/* — opzet — */

function vinklijst(houder, items, gekozen) {
  houder.replaceChildren();
  for (const item of items) {
    const label = document.createElement('label');
    const vinkje = document.createElement('input');
    vinkje.type = 'checkbox';
    vinkje.value = item.id;
    vinkje.checked = gekozen.includes(item.id);
    const naam = document.createElement('span');
    naam.textContent = item.naam;
    const aantal = document.createElement('span');
    aantal.className = 'aantal-mee';
    aantal.textContent = getal.format(item.aantal);
    label.append(vinkje, naam, aantal);
    houder.append(label);
  }
}

function gekozenWaarden(houder) {
  return [...houder.querySelectorAll('input:checked')].map((v) => v.value);
}

function opzetFilters() {
  return {
    zoek: el('#zoek').value.trim(),
    kits: gekozenWaarden(el('#kitlijst')),
    groepen: gekozenWaarden(el('#groeplijst')),
    schud: el('#schud').checked,
  };
}

function opzetTelling() {
  const eerder = staat.filters;
  staat.filters = opzetFilters();
  const aantal = register.modellen.filter(past).length;
  staat.filters = eerder;
  el('#opzet-telling').textContent = `${getal.format(aantal)} model${aantal === 1 ? '' : 'len'} in deze selectie`;
  el('#opzet-start').disabled = aantal === 0;
}

function vulOpzet() {
  const kits = [...register.kits.values()]
    .map((k) => ({ id: k.slug, naam: k.naam, aantal: register.modellen.filter((m) => m.kit === k.slug).length }))
    .filter((k) => k.aantal > 0);
  const groepen = [...register.groepen.values()]
    .map((g) => ({ id: g.id, naam: g.naam, aantal: register.modellen.filter((m) => m.groep === g.id).length }))
    .filter((g) => g.aantal > 0);

  vinklijst(el('#kitlijst'), kits, staat.filters.kits);
  vinklijst(el('#groeplijst'), groepen, staat.filters.groepen);
  el('#zoek').value = staat.filters.zoek;
  el('#schud').checked = staat.filters.schud;
  for (const richting of RICHTINGEN) el(`#label-${richting.id}`).value = staat.labels[richting.id];
  opzetTelling();
}

/* — dek — */

function zetBelichting(viewer) {
  if (vlakkeModus.aan) {
    viewer.setAttribute('environment-image', VLAK_OMGEVING);
    viewer.setAttribute('shadow-intensity', '0');
    viewer.setAttribute('exposure', '1.3');
  } else {
    viewer.setAttribute('environment-image', 'neutral');
    viewer.setAttribute('shadow-intensity', '0.7');
    viewer.setAttribute('exposure', '1.05');
  }
}

function maakKaart(model, diepte) {
  const kit = register.kits.get(model.kit);
  const groep = register.groepen.get(model.groep);

  const kaart = document.createElement('article');
  kaart.className = 'swipe-kaart';
  kaart.dataset.diepte = String(diepte);
  kaart.dataset.id = model.id;

  const vak = document.createElement('div');
  vak.className = 'swipe-viewer';
  const viewer = document.createElement('model-viewer');
  viewer.src = `../${model.pad}`;
  viewer.alt = `3D-model ${model.naam} uit ${kit?.naam ?? model.kit}`;
  viewer.setAttribute('camera-orbit', '35deg 68deg auto');
  viewer.setAttribute('shadow-softness', '0.9');
  viewer.setAttribute('interaction-prompt', 'none');
  viewer.setAttribute('loading', 'eager');
  zetBelichting(viewer);
  vak.append(viewer);

  const tekst = document.createElement('div');
  tekst.className = 'swipe-tekst';
  const naam = document.createElement('h2');
  naam.textContent = model.naam;
  const herkomst = document.createElement('p');
  herkomst.className = 'herkomst';
  herkomst.textContent = `${kit?.naam ?? model.kit} · ${groep?.naam ?? model.groep}`;
  const meta = document.createElement('p');
  meta.className = 'meta';
  meta.textContent = [
    afmeting(model.wdh),
    `${getal.format(model.driehoeken)} driehoeken`,
    `${getal.format(model.materialen)} materia${model.materialen === 1 ? 'al' : 'len'}`,
    bytesLeesbaar(model.bytes),
  ].join(' · ');
  const pad = document.createElement('p');
  pad.className = 'pad';
  pad.textContent = model.pad;
  tekst.append(naam, herkomst, meta, pad);

  const draai = document.createElement('button');
  draai.type = 'button';
  draai.className = 'knop draaiknop';
  draai.textContent = '⟲ Draaien';
  draai.title = 'Zet slepen even uit zodat je het model kunt ronddraaien';
  draai.setAttribute('aria-pressed', 'false');
  draai.addEventListener('click', () => {
    const aan = !viewer.hasAttribute('camera-controls');
    viewer.toggleAttribute('camera-controls', aan);
    kaart.toggleAttribute('data-draaien', aan);
    draai.setAttribute('aria-pressed', String(aan));
    draai.textContent = aan ? '⟲ Draaien aan' : '⟲ Draaien';
  });

  const stempel = document.createElement('span');
  stempel.className = 'stempel';

  kaart.append(vak, tekst, draai, stempel);
  if (diepte === 0) maakSleepbaar(kaart);
  return kaart;
}

function tekenDek() {
  const wachtrij = resterend();
  el('#voortgang-vulling').style.width =
    staat.volgorde.length ? `${(staat.keuzes.length / staat.volgorde.length) * 100}%` : '0';
  el('#voortgang-tekst').textContent = `${getal.format(staat.keuzes.length)} / ${getal.format(staat.volgorde.length)}`;
  el('#terug').disabled = staat.keuzes.length === 0;

  for (const richting of RICHTINGEN) {
    const label = labelVan(richting.id);
    el(`.dek-rand-${richting.id} span`).textContent = label;
    el(`.richtingknop[data-richting="${richting.id}"] span`).textContent = label;
  }

  if (wachtrij.length === 0) {
    stapel.replaceChildren();
    const klaar = document.createElement('p');
    klaar.className = 'bak-leeg';
    klaar.textContent = 'Alles beoordeeld — bekijk de uitslag.';
    stapel.append(klaar);
    if (staat.volgorde.length) toon('uitslag');
    return;
  }

  const gewenst = wachtrij.slice(0, 2);
  const levend = [...stapel.querySelectorAll('.swipe-kaart:not(.weg)')];
  const huidig = levend.map((k) => k.dataset.id).reverse();

  if (huidig.join() !== gewenst.join()) {
    const hergebruik = new Map(levend.map((k) => [k.dataset.id, k]));
    const kaarten = gewenst.map((id, i) => {
      const kaart = hergebruik.get(id) ?? maakKaart(register.perId.get(id), i);
      kaart.dataset.diepte = String(i);
      if (i === 0) {
        kaart.classList.remove('veert');
        kaart.style.transform = '';
        maakSleepbaar(kaart);
      }
      return kaart;
    });
    stapel.replaceChildren(...kaarten.reverse());
  }
  werkSamenvattingBij();
}

function markeerRand(richting) {
  for (const rand of document.querySelectorAll('.dek-rand')) {
    if (rand.dataset.richting === richting) rand.dataset.actief = '';
    else delete rand.dataset.actief;
  }
}

function richtingVan(dx, dy) {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < drempel()) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'links' : 'rechts';
  return dy < 0 ? 'omhoog' : 'omlaag';
}

function maakSleepbaar(kaart) {
  if (kaart.dataset.sleep) return;
  kaart.dataset.sleep = 'ja';
  const stempel = kaart.querySelector('.stempel');
  let start = null;

  const beweeg = (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    kaart.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 28}deg)`;
    const richting = richtingVan(dx, dy);
    markeerRand(richting);
    if (richting) {
      stempel.dataset.richting = richting;
      stempel.textContent = labelVan(richting);
      stempel.style.opacity = String(Math.min(1, Math.max(Math.abs(dx), Math.abs(dy)) / (drempel() * 1.6)));
    } else {
      stempel.style.opacity = '0';
    }
  };

  const stop = (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    kaart.releasePointerCapture?.(start.id);
    start = null;
    kaart.removeEventListener('pointermove', beweeg);
    markeerRand(null);
    const richting = richtingVan(dx, dy);
    if (richting) {
      kies(richting);
    } else {
      stempel.style.opacity = '0';
      kaart.classList.add('veert');
      kaart.style.transform = '';
      setTimeout(() => kaart.classList.remove('veert'), 220);
    }
  };

  kaart.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('button')) return;
    if (kaart.hasAttribute('data-draaien') && e.target.closest('model-viewer')) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    kaart.setPointerCapture(e.pointerId);
    kaart.addEventListener('pointermove', beweeg);
  });
  kaart.addEventListener('pointerup', stop);
  kaart.addEventListener('pointercancel', stop);
}

const VERPLAATSING = {
  links: 'translate(-120vw, 0) rotate(-18deg)',
  rechts: 'translate(120vw, 0) rotate(18deg)',
  omhoog: 'translate(0, -120vh)',
  omlaag: 'translate(0, 120vh)',
};

function kies(richting) {
  const wachtrij = resterend();
  const id = wachtrij[0];
  if (!id) return;

  const kaart = stapel.querySelector('.swipe-kaart[data-diepte="0"]:not(.weg)');
  staat.keuzes.push({ id, richting });
  bewaar();

  if (kaart) {
    kaart.classList.add('weg');
    kaart.style.transform = VERPLAATSING[richting];
    kaart.addEventListener('transitionend', () => kaart.remove(), { once: true });
    setTimeout(() => kaart.remove(), 400);
    setTimeout(tekenDek, 180);
  } else {
    tekenDek();
  }
  werkSamenvattingBij();
}

function draaiTerug(id) {
  const index = id ? staat.keuzes.findLastIndex((k) => k.id === id) : staat.keuzes.length - 1;
  if (index === -1) return;
  staat.keuzes.splice(index, 1);
  bewaar();
  stapel.replaceChildren();
  if (uitslag.hidden) tekenDek();
  else tekenUitslag();
  werkSamenvattingBij();
}

/* — uitslag — */

function regels() {
  return staat.keuzes.map(({ id, richting }) => {
    const model = register.perId.get(id);
    return {
      id,
      naam: model.naam,
      kit: model.kit,
      groep: model.groep,
      pad: model.pad,
      richting,
      label: labelVan(richting),
    };
  });
}

async function kopieer(tekst, knop) {
  const oud = knop.textContent;
  try {
    await navigator.clipboard.writeText(tekst);
    knop.textContent = 'Gekopieerd';
  } catch {
    knop.textContent = 'Kopiëren mislukt';
  }
  setTimeout(() => { knop.textContent = oud; }, 1400);
}

function kopieerknop(tekst, label, lijst) {
  const knop = document.createElement('button');
  knop.type = 'button';
  knop.className = 'knop';
  knop.textContent = label;
  knop.disabled = lijst.length === 0;
  knop.addEventListener('click', () => kopieer(tekst, knop));
  return knop;
}

function tekenUitslag() {
  const bakken = el('#uitslag-bakken');
  bakken.replaceChildren();
  const alle = regels();

  for (const richting of RICHTINGEN) {
    const lijst = alle.filter((r) => r.richting === richting.id);
    const bak = document.createElement('section');
    bak.className = 'bak';
    bak.dataset.richting = richting.id;

    const kop = document.createElement('div');
    kop.className = 'bak-kop';
    const titel = document.createElement('h3');
    titel.textContent = `${richting.teken} ${labelVan(richting.id)}`;
    const aantal = document.createElement('span');
    aantal.className = 'aantal';
    aantal.textContent = `${getal.format(lijst.length)}`;
    kop.append(titel, aantal);
    bak.append(kop);

    if (lijst.length === 0) {
      const leeg = document.createElement('p');
      leeg.className = 'bak-leeg';
      leeg.textContent = 'Nog niets in deze richting.';
      bak.append(leeg);
    } else {
      const ul = document.createElement('ul');
      ul.className = 'bak-lijst';
      for (const regel of lijst) {
        const li = document.createElement('li');
        const naam = document.createElement('span');
        naam.className = 'naam';
        naam.textContent = regel.naam;
        naam.title = regel.pad;
        const kit = document.createElement('span');
        kit.className = 'kit';
        kit.textContent = regel.kit;
        const terug = document.createElement('button');
        terug.type = 'button';
        terug.textContent = '↺';
        terug.title = 'Terug in de stapel';
        terug.addEventListener('click', () => draaiTerug(regel.id));
        li.append(naam, kit, terug);
        ul.append(li);
      }
      bak.append(ul);
    }

    const acties = document.createElement('div');
    acties.className = 'bak-acties';
    acties.append(
      kopieerknop(lijst.map((r) => r.pad).join('\n'), 'Kopieer paden', lijst),
      kopieerknop(lijst.map((r) => r.id).join('\n'), "Kopieer id's", lijst),
    );
    bak.append(acties);
    bakken.append(bak);
  }

  const open = resterend().length;
  const rest = document.createElement('section');
  rest.className = 'bak';
  const restKop = document.createElement('div');
  restKop.className = 'bak-kop';
  const restTitel = document.createElement('h3');
  restTitel.textContent = 'Nog te doen';
  const restAantal = document.createElement('span');
  restAantal.className = 'aantal';
  restAantal.textContent = getal.format(open);
  restKop.append(restTitel, restAantal);
  const restTekst = document.createElement('p');
  restTekst.className = 'bak-leeg';
  restTekst.textContent = open
    ? 'Ga verder met swipen om deze modellen te beoordelen.'
    : 'Alle modellen in deze selectie zijn beoordeeld.';
  rest.append(restKop, restTekst);
  bakken.append(rest);

  el('#verder').disabled = open === 0;
}

function bestand(naam, inhoud, type) {
  const blob = new Blob([inhoud], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = naam;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stempelTijd = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

function exporteerJson() {
  const alle = regels();
  const inhoud = {
    gereedschap: 'catalog/swipe.html',
    gemaakt: new Date().toISOString(),
    filters: staat.filters,
    richtingen: Object.fromEntries(
      RICHTINGEN.map((r) => [
        r.id,
        { label: labelVan(r.id), paden: alle.filter((x) => x.richting === r.id).map((x) => x.pad) },
      ]),
    ),
    keuzes: alle,
    nogTeDoen: resterend().map((id) => register.perId.get(id).pad),
  };
  bestand(`swipe-${stempelTijd()}.json`, JSON.stringify(inhoud, null, 1) + '\n', 'application/json');
}

function exporteerCsv() {
  const cel = (waarde) => `"${String(waarde).replaceAll('"', '""')}"`;
  const rijen = [
    ['richting', 'label', 'id', 'naam', 'kit', 'groep', 'pad'],
    ...regels().map((r) => [r.richting, r.label, r.id, r.naam, r.kit, r.groep, r.pad]),
  ];
  bestand(`swipe-${stempelTijd()}.csv`, rijen.map((rij) => rij.map(cel).join(',')).join('\n') + '\n', 'text/csv');
}

/* — start — */

async function start() {
  const respons = await fetch('catalog.json');
  if (!respons.ok) throw new Error(`catalog.json niet gevonden (${respons.status})`);
  const data = await respons.json();

  register.modellen = data.modellen;
  register.perId = new Map(data.modellen.map((m) => [m.id, m]));
  register.kits = new Map(data.kits.map((k) => [k.slug, k]));
  register.groepen = new Map(data.groepen.map((g) => [g.id, g]));

  laad();

  el('#opzet-formulier').addEventListener('submit', (e) => {
    e.preventDefault();
    staat.filters = opzetFilters();
    for (const richting of RICHTINGEN) staat.labels[richting.id] = el(`#label-${richting.id}`).value.trim() || richting.standaard;
    const selectie = register.modellen.filter(past).map((m) => m.id);
    staat.volgorde = staat.filters.schud ? schud(selectie) : selectie;
    const inSelectie = new Set(staat.volgorde);
    staat.keuzes = staat.keuzes.filter((k) => inSelectie.has(k.id));
    staat.begonnen = true;
    bewaar();
    stapel.replaceChildren();
    toon('dek');
  });

  el('#opzet-formulier').addEventListener('input', opzetTelling);
  el('#opzet-annuleer').addEventListener('click', () => toon('dek'));
  el('#instellingen').addEventListener('click', () => { vulOpzet(); toon('opzet'); });
  el('#naar-uitslag').addEventListener('click', () => toon('uitslag'));
  el('#verder').addEventListener('click', () => toon('dek'));
  el('#terug').addEventListener('click', () => draaiTerug());
  el('#download-json').addEventListener('click', exporteerJson);
  el('#download-csv').addEventListener('click', exporteerCsv);
  el('#wis-alles').addEventListener('click', () => {
    if (!confirm('Alle keuzes wissen?')) return;
    staat.keuzes = [];
    bewaar();
    tekenUitslag();
    werkSamenvattingBij();
  });

  for (const knop of document.querySelectorAll('.richtingknop')) {
    knop.addEventListener('click', () => kies(knop.dataset.richting));
  }

  const lichtKnop = el('#licht');
  lichtKnop.addEventListener('click', () => {
    vlakkeModus.aan = !vlakkeModus.aan;
    lichtKnop.setAttribute('aria-pressed', String(vlakkeModus.aan));
    for (const viewer of document.querySelectorAll('model-viewer')) zetBelichting(viewer);
  });

  addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) return;
    if (!dek.hidden) {
      const perToets = {
        ArrowLeft: 'links',
        ArrowRight: 'rechts',
        ArrowUp: 'omhoog',
        ArrowDown: 'omlaag',
      };
      if (perToets[e.key]) {
        e.preventDefault();
        kies(perToets[e.key]);
        return;
      }
      if (e.key === 'z' || e.key === 'Z') return draaiTerug();
    }
    if (e.key === 'Escape' && opzet.hidden) {
      e.preventDefault();
      toon(uitslag.hidden ? 'uitslag' : 'dek');
    }
  });

  if (!staat.begonnen) {
    staat.volgorde = register.modellen.map((m) => m.id);
    staat.begonnen = true;
    bewaar();
  }
  toon('dek');
}

start().catch((fout) => {
  melding.hidden = false;
  melding.className = 'leeg melding-fout';
  melding.textContent = `Catalogus kon niet worden geladen: ${fout.message}`;
  samenvatting.textContent = 'Catalogus kon niet worden geladen.';
  console.error(fout);
});
