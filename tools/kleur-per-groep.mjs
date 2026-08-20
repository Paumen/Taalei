/**
 * Bouwt docs/kleur_per_groep.html: hoe vaak elke kleur van een palet wordt
 * gebruikt, uitgesplitst naar de groepen van de catalogus.
 *
 * Draaien vanuit de repo-root:
 *   node tools/kleur-per-groep.mjs
 *
 * De telling komt uit kits/catalog.json, dus draai eerst tools/build-catalog.mjs
 * als er iets aan de kits of aan het palet is veranderd. Een model telt één keer
 * per kleur die het draagt, hoe groot dat vlak ook is — de catalogus weet niet
 * hoeveel oppervlak een kleur beslaat, alleen dat hij voorkomt.
 *
 * De pagina staat op zichzelf: alle cijfers zitten erin, er wordt niets
 * nagevraagd. Hij is gemaakt om op een telefoon te lezen.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogus = JSON.parse(readFileSync(join(ROOT, 'kits', 'catalog.json'), 'utf8'));

const groepNaam = new Map(catalogus.groepen.map((g) => [g.id, g.kort ?? g.naam]));
const groepVol = new Map(catalogus.groepen.map((g) => [g.id, g.naam]));

const paletten = catalogus.paletten.map((palet) => {
  const modellen = catalogus.modellen.filter((m) => m.palet === palet.id);
  const groepen = catalogus.groepen
    .map((g) => ({ id: g.id, kort: groepNaam.get(g.id), naam: groepVol.get(g.id), n: modellen.filter((m) => m.groep === g.id).length }))
    .filter((g) => g.n > 0)
    .sort((a, b) => b.n - a.n);

  const kleuren = palet.kleuren
    .map((k) => {
      const per = {};
      let totaal = 0;
      for (const m of modellen) {
        if (!m.kleuren.includes(k.hex)) continue;
        per[m.groep] = (per[m.groep] ?? 0) + 1;
        totaal++;
      }
      return { hex: k.hex, naam: k.naam, totaal, per };
    })
    .sort((a, b) => b.totaal - a.totaal);

  return { id: palet.id, naam: palet.naam, atlas: palet.atlas, modellen: modellen.length, groepen, kleuren };
});

const gegevens = { totaal: catalogus.totaal, paletten };

const html = String.raw`<title>Kleurregister</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700&family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;600&display=swap">
<style>
:root {
  --grond: #eaeef0;
  --kaart: #fbfcfd;
  --kaart-op: #f1f5f6;
  --inkt: #0f1618;
  --inkt-zacht: #4d5f64;
  --inkt-stil: #7b8c91;
  --lijn: #d3dcdf;
  --accent: #0d6470;
  --accent-op: #e2eef0;
  --heat: 13, 100, 112;
  --heat-inkt: #f4fbfc;
  --schaduw: 0 1px 2px rgba(15, 30, 34, .06), 0 8px 24px -18px rgba(15, 30, 34, .5);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --grond: #0b1113;
    --kaart: #141c1f;
    --kaart-op: #1b2528;
    --inkt: #e9eff1;
    --inkt-zacht: #a7bac0;
    --inkt-stil: #7d9198;
    --lijn: #263438;
    --accent: #58c6d6;
    --accent-op: #16323a;
    --heat: 88, 198, 214;
    --heat-inkt: #04181c;
    --schaduw: 0 1px 2px rgba(0, 0, 0, .5), 0 10px 30px -20px rgba(0, 0, 0, .9);
  }
}
:root[data-theme="dark"] {
  --grond: #0b1113;
  --kaart: #141c1f;
  --kaart-op: #1b2528;
  --inkt: #e9eff1;
  --inkt-zacht: #a7bac0;
  --inkt-stil: #7d9198;
  --lijn: #263438;
  --accent: #58c6d6;
  --accent-op: #16323a;
  --heat: 88, 198, 214;
  --heat-inkt: #04181c;
  --schaduw: 0 1px 2px rgba(0, 0, 0, .5), 0 10px 30px -20px rgba(0, 0, 0, .9);
}

* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--grond);
  color: var(--inkt);
  font: 400 16px/1.5 "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
  -webkit-text-size-adjust: 100%;
}
.wikkel { max-width: 1180px; margin: 0 auto; padding: 28px 16px 64px; }

/* -- kop ---------------------------------------------------------------- */
.kop { display: flex; flex-direction: column; gap: 10px; margin-bottom: 22px; }
.pad {
  font: 600 11px/1 "IBM Plex Mono", ui-monospace, monospace;
  letter-spacing: .14em; text-transform: uppercase; color: var(--inkt-stil);
}
h1 {
  margin: 0; font-family: "Bricolage Grotesque", "IBM Plex Sans", sans-serif;
  font-weight: 700; font-size: clamp(30px, 8vw, 46px); line-height: .98;
  letter-spacing: -.02em; text-wrap: balance;
}
.intro { margin: 0; max-width: 62ch; color: var(--inkt-zacht); font-size: 15px; }

.cijfers { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
.cijfer {
  background: var(--kaart); border: 1px solid var(--lijn); border-radius: 10px;
  padding: 8px 12px; display: flex; align-items: baseline; gap: 7px;
}
.cijfer b { font: 600 18px/1 "IBM Plex Mono", monospace; font-variant-numeric: tabular-nums; }
.cijfer span { font-size: 12px; color: var(--inkt-stil); }

/* -- knoppenrijen ------------------------------------------------------- */
.regelaars { display: flex; flex-direction: column; gap: 10px; margin: 22px 0 18px; }
.rij { display: flex; gap: 6px; flex-wrap: wrap; }
.rij > .etiket {
  font: 600 11px/28px "IBM Plex Mono", monospace; letter-spacing: .12em;
  text-transform: uppercase; color: var(--inkt-stil); margin-right: 2px;
}
button.chip {
  font: 400 14px/1 "IBM Plex Sans", sans-serif; color: var(--inkt-zacht);
  background: var(--kaart); border: 1px solid var(--lijn); border-radius: 999px;
  padding: 8px 14px; cursor: pointer; display: inline-flex; align-items: center; gap: 7px;
}
button.chip:hover { background: var(--kaart-op); color: var(--inkt); }
button.chip[aria-pressed="true"] {
  background: var(--accent); border-color: var(--accent); color: var(--kaart);
  font-weight: 600;
}
:root[data-theme="dark"] button.chip[aria-pressed="true"],
button.chip[aria-pressed="true"] { color: var(--heat-inkt); }
button.chip b { font: 600 12px/1 "IBM Plex Mono", monospace; font-variant-numeric: tabular-nums; opacity: .75; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 6px; }

/* -- ledger ------------------------------------------------------------- */
.ledger { display: flex; flex-direction: column; gap: 6px; }
.regel {
  background: var(--kaart); border: 1px solid var(--lijn); border-radius: 12px;
  box-shadow: var(--schaduw); overflow: hidden;
}
.regel > summary {
  list-style: none; cursor: pointer; padding: 12px 14px;
  display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; gap: 12px; align-items: center;
}
.regel > summary::-webkit-details-marker { display: none; }
.regel > summary:hover { background: var(--kaart-op); }
.staal {
  width: 30px; height: 30px; border-radius: 8px;
  border: 1px solid rgba(15, 30, 34, .18); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .25);
}
.naam { min-width: 0; }
.naam .hex {
  font: 600 13px/1.2 "IBM Plex Mono", monospace; letter-spacing: -.01em; display: block;
}
.naam .om { font-size: 12px; color: var(--inkt-stil); }
.telling { display: flex; align-items: center; gap: 10px; }
.telling .n {
  font: 600 16px/1 "IBM Plex Mono", monospace; font-variant-numeric: tabular-nums; min-width: 3.2ch; text-align: right;
}
.balk { width: 92px; height: 8px; border-radius: 999px; background: var(--kaart-op); overflow: hidden; }
.balk i { display: block; height: 100%; border-radius: 999px; }
@media (min-width: 620px) { .balk { width: 200px; } }

.uitklap { padding: 2px 14px 14px; display: flex; flex-direction: column; gap: 5px; border-top: 1px solid var(--lijn); }
.uitklap .kopje {
  font: 600 11px/1 "IBM Plex Mono", monospace; letter-spacing: .12em; text-transform: uppercase;
  color: var(--inkt-stil); padding: 12px 0 4px;
}
.deel { display: grid; grid-template-columns: minmax(0, 1fr) 3.4ch 5.4ch; gap: 10px; align-items: center; font-size: 14px; }
.deel .g { color: var(--inkt-zacht); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.deel .spoor { grid-column: 1 / -1; height: 6px; border-radius: 999px; background: var(--kaart-op); overflow: hidden; margin: -3px 0 3px; }
.deel .spoor i { display: block; height: 100%; background: rgba(var(--heat), .75); border-radius: 999px; }
.deel .n, .deel .p { font: 400 13px/1 "IBM Plex Mono", monospace; font-variant-numeric: tabular-nums; text-align: right; }
.deel .p { color: var(--inkt-stil); }

/* -- matrix ------------------------------------------------------------- */
.matrixdoos { overflow-x: auto; border: 1px solid var(--lijn); border-radius: 12px; background: var(--kaart); box-shadow: var(--schaduw); }
table { border-collapse: collapse; font-variant-numeric: tabular-nums; }
th, td { border-bottom: 1px solid var(--lijn); border-right: 1px solid var(--lijn); padding: 6px 8px; font-size: 13px; text-align: center; }
tr:last-child th, tr:last-child td { border-bottom: 0; }
th:last-child, td:last-child { border-right: 0; }
thead th { position: sticky; top: 0; background: var(--kaart); font-weight: 600; font-size: 12px; z-index: 2; vertical-align: bottom; }
thead th em { display: block; font-style: normal; font-weight: 400; color: var(--inkt-stil); font-size: 11px; }
th.eerste {
  position: sticky; left: 0; z-index: 3; background: var(--kaart); text-align: left; white-space: nowrap;
  font: 600 12px/1.2 "IBM Plex Mono", monospace;
}
td.leeg { color: var(--inkt-stil); }
td .cel { display: block; }

.voet { margin-top: 26px; color: var(--inkt-stil); font-size: 13px; max-width: 62ch; }
.voet code { font-family: "IBM Plex Mono", monospace; font-size: 12px; }
@media (prefers-reduced-motion: no-preference) {
  .regel > summary, button.chip { transition: background-color .14s ease, color .14s ease; }
}
</style>

<div class="wikkel">
  <header class="kop">
    <p class="pad" id="pad"></p>
    <h1>Kleurregister</h1>
    <p class="intro">Hoe vaak elke kleur van de gedeelde colormap wordt gedragen, en door welke groepen.
      Een model telt één keer per kleur — de catalogus weet dát een kleur voorkomt, niet hoeveel vlak hij beslaat.</p>
    <div class="cijfers" id="cijfers"></div>
  </header>

  <div class="regelaars">
    <div class="rij" id="paletrij"><span class="etiket">Palet</span></div>
    <div class="rij" id="weergaverij"><span class="etiket">Toon</span></div>
  </div>

  <main id="doek"></main>

  <p class="voet">Gebouwd uit <code>kits/catalog.json</code> met <code>tools/kleur-per-groep.mjs</code>.
    De stalen zijn de kleuren zoals ze in de atlas staan; de balken tellen modellen.</p>
</div>

<script>
const GEGEVENS = ${JSON.stringify(gegevens)};

const doek = document.getElementById('doek');
const paletrij = document.getElementById('paletrij');
const weergaverij = document.getElementById('weergaverij');
const WEERGAVEN = [['kleuren', 'Per kleur'], ['groepen', 'Per groep'], ['matrix', 'Matrix']];

let paletId = GEGEVENS.paletten[0].id;
let weergave = 'kleuren';

const palet = () => GEGEVENS.paletten.find((p) => p.id === paletId);
const tekst = (el, t) => { el.textContent = t; return el; };
const maak = (soort, klasse) => { const el = document.createElement(soort); if (klasse) el.className = klasse; return el; };

/** Vulling van een matrixvakje: één tint, donkerder naarmate het aandeel groter is. */
function hitte(deel) {
  if (!deel) return { achtergrond: 'transparent', donker: false };
  const t = Math.pow(deel, 0.55);
  return { achtergrond: 'rgba(var(--heat), ' + (0.1 + t * 0.8).toFixed(3) + ')', donker: t > 0.6 };
}

function knoppen() {
  for (const p of GEGEVENS.paletten) {
    const b = maak('button', 'chip');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(p.id === paletId));
    b.append(document.createTextNode(p.naam), Object.assign(maak('b'), { textContent: p.modellen }));
    b.addEventListener('click', () => { paletId = p.id; teken(); });
    paletrij.append(b);
  }
  for (const [id, naam] of WEERGAVEN) {
    const b = maak('button', 'chip');
    b.type = 'button';
    b.textContent = naam;
    b.setAttribute('aria-pressed', String(id === weergave));
    b.addEventListener('click', () => { weergave = id; teken(); });
    weergaverij.append(b);
  }
}

function kop() {
  const p = palet();
  document.getElementById('pad').textContent = p.atlas ?? 'eigen materiaalkleuren';
  const cijfers = document.getElementById('cijfers');
  cijfers.replaceChildren();
  const gedragen = p.kleuren.reduce((a, k) => a + k.totaal, 0);
  for (const [n, label] of [
    [p.modellen, 'modellen'],
    [p.kleuren.length, 'kleuren'],
    [p.groepen.length, 'groepen'],
    [(gedragen / p.modellen).toFixed(1), 'kleuren per model'],
  ]) {
    const d = maak('div', 'cijfer');
    d.append(Object.assign(maak('b'), { textContent: n }), Object.assign(maak('span'), { textContent: label }));
    cijfers.append(d);
  }
}

function regelKleur(kleur, p, hoogste) {
  const d = maak('details', 'regel');
  const s = maak('summary');

  const staal = maak('span', 'staal');
  staal.style.background = kleur.hex;

  const naam = maak('div', 'naam');
  naam.append(
    Object.assign(maak('span', 'hex'), { textContent: kleur.hex }),
    Object.assign(maak('span', 'om'), { textContent: kleur.naam }),
  );

  const telling = maak('div', 'telling');
  const balk = maak('span', 'balk');
  const vulling = maak('i');
  vulling.style.width = Math.max(3, (kleur.totaal / hoogste) * 100) + '%';
  vulling.style.background = kleur.hex;
  balk.append(vulling);
  telling.append(Object.assign(maak('span', 'n'), { textContent: kleur.totaal }), balk);

  s.append(staal, naam, telling);
  d.append(s);

  const uit = maak('div', 'uitklap');
  uit.append(Object.assign(maak('p', 'kopje'), { textContent: 'aandeel per groep' }));
  const delen = p.groepen
    .map((g) => ({ g, n: kleur.per[g.id] ?? 0 }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n / b.g.n - a.n / a.g.n);
  for (const { g, n } of delen) {
    const rij = maak('div', 'deel');
    const spoor = maak('span', 'spoor');
    const i = maak('i');
    i.style.width = (n / g.n) * 100 + '%';
    spoor.append(i);
    rij.append(
      Object.assign(maak('span', 'g'), { textContent: g.naam }),
      Object.assign(maak('span', 'n'), { textContent: n }),
      Object.assign(maak('span', 'p'), { textContent: Math.round((n / g.n) * 100) + '%' }),
      spoor,
    );
    uit.append(rij);
  }
  d.append(uit);
  return d;
}

function regelGroep(g, p) {
  const d = maak('details', 'regel');
  const s = maak('summary');

  const kleuren = p.kleuren
    .map((k) => ({ k, n: k.per[g.id] ?? 0 }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);

  /* de stalen zelf zijn de samenvatting van een groep */
  const stapel = maak('span', 'staal');
  stapel.style.background = 'linear-gradient(135deg, ' +
    kleuren.slice(0, 4).map((x, i, a) => x.k.hex + ' ' + (i / a.length * 100) + '% ' + ((i + 1) / a.length * 100) + '%').join(', ') + ')';

  const naam = maak('div', 'naam');
  naam.append(
    Object.assign(maak('span', 'hex'), { textContent: g.naam }),
    Object.assign(maak('span', 'om'), { textContent: kleuren.length + ' kleuren' }),
  );

  const telling = maak('div', 'telling');
  const balk = maak('span', 'balk');
  const vulling = maak('i');
  vulling.style.width = Math.max(3, (g.n / p.groepen[0].n) * 100) + '%';
  vulling.style.background = 'rgba(var(--heat), .8)';
  balk.append(vulling);
  telling.append(Object.assign(maak('span', 'n'), { textContent: g.n }), balk);

  s.append(stapel, naam, telling);
  d.append(s);

  const uit = maak('div', 'uitklap');
  uit.append(Object.assign(maak('p', 'kopje'), { textContent: 'kleuren in deze groep' }));
  for (const { k, n } of kleuren) {
    const rij = maak('div', 'deel');
    const spoor = maak('span', 'spoor');
    const i = maak('i');
    i.style.width = (n / g.n) * 100 + '%';
    i.style.background = k.hex;
    spoor.append(i);
    const label = maak('span', 'g');
    const punt = maak('span', 'staal');
    punt.style.cssText = 'width:12px;height:12px;border-radius:3px;display:inline-block;vertical-align:-1px;margin-right:7px;background:' + k.hex;
    label.append(punt, document.createTextNode(k.hex + '  ' + k.naam));
    rij.append(
      label,
      Object.assign(maak('span', 'n'), { textContent: n }),
      Object.assign(maak('span', 'p'), { textContent: Math.round((n / g.n) * 100) + '%' }),
      spoor,
    );
    uit.append(rij);
  }
  d.append(uit);
  return d;
}

function matrix(p) {
  const doos = maak('div', 'matrixdoos');
  const tabel = maak('table');
  const thead = maak('thead');
  const kopRij = maak('tr');
  kopRij.append(Object.assign(maak('th', 'eerste'), { textContent: 'kleur' }));
  kopRij.append(Object.assign(maak('th'), { textContent: 'totaal' }));
  for (const g of p.groepen) {
    const th = maak('th');
    th.append(document.createTextNode(g.kort), Object.assign(maak('em'), { textContent: g.n }));
    kopRij.append(th);
  }
  thead.append(kopRij);

  const tbody = maak('tbody');
  for (const k of p.kleuren) {
    const tr = maak('tr');
    const eerste = maak('th', 'eerste');
    const punt = maak('span');
    punt.style.cssText = 'display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:-1px;margin-right:8px;border:1px solid rgba(125,145,152,.5);background:' + k.hex;
    eerste.append(punt, document.createTextNode(k.hex));
    tr.append(eerste, Object.assign(maak('td'), { textContent: k.totaal }));
    for (const g of p.groepen) {
      const n = k.per[g.id] ?? 0;
      const td = maak('td');
      const { achtergrond, donker } = hitte(n / g.n);
      td.style.background = achtergrond;
      if (donker) td.style.color = 'var(--heat-inkt)';
      if (!n) td.className = 'leeg';
      td.textContent = n ? String(n) : '·';
      td.title = k.hex + ' · ' + g.naam + ': ' + n + ' van ' + g.n + ' modellen';
      tr.append(td);
    }
    tbody.append(tr);
  }
  tabel.append(thead, tbody);
  doos.append(tabel);
  return doos;
}

function teken() {
  for (const b of paletrij.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.textContent.startsWith(palet().naam)));
  for (const [i, b] of [...weergaverij.querySelectorAll('button')].entries()) b.setAttribute('aria-pressed', String(WEERGAVEN[i][0] === weergave));

  kop();
  const p = palet();
  doek.replaceChildren();

  if (weergave === 'matrix') { doek.append(matrix(p)); return; }

  const ledger = maak('div', 'ledger');
  if (weergave === 'kleuren') {
    const hoogste = p.kleuren[0].totaal;
    for (const k of p.kleuren) ledger.append(regelKleur(k, p, hoogste));
  } else {
    for (const g of p.groepen) ledger.append(regelGroep(g, p));
  }
  doek.append(ledger);
}

knoppen();
teken();
</script>`;

mkdirSync(join(ROOT, 'docs'), { recursive: true });
writeFileSync(join(ROOT, 'docs', 'kleur_per_groep.html'), html);
console.log('geschreven: docs/kleur_per_groep.html');
for (const p of paletten) {
  console.log(`  ${p.naam}: ${p.modellen} modellen, ${p.kleuren.length} kleuren, ${p.groepen.length} groepen`);
}
