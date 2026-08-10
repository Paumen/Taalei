/**
 * Leidt aansluitregels voor de modulair-terrein-kit af uit de
 * combinatieoordelen van de terreinbouwer. Draaien vanuit de repo-root:
 *
 *   node tools/leid-aansluitregels-af.mjs [pad-naar-oordelen.json]
 *
 * Zonder argument leest het data/combinatieoordelen_16.json en schrijft het
 * data/aansluitregels_modulair-terrein.json. De oordelen zijn per voeg
 * uitgesproken; dit script vat ze samen tot regels per combinatie en spreekt
 * daar zelf géén oordeel over uit: een combinatie die zowel goed- als
 * afgekeurd is heet `omstreden`, met beide contexten erbij, zodat de lezer
 * (of de terreinbouwer) kan zien waar het verschil vandaan komt. De duiding
 * van de regels staat in docs/aansluitregels_modulair-terrein.md.
 *
 * Drie soorten voegen, drie soorten regels:
 *   - `zij`    twee stukken naast elkaar; sleutel is het paar randprofielen
 *              (ongeordend — welke links staat maakt de voeg niet anders).
 *   - `stapel` het ene stuk boven op het andere; randprofielen ontbreken
 *              hier, dus de sleutel is het modelpaar onder>boven.
 *   - `rand`   de open zijkant van een stapeling: sluiten de zijprofielen
 *              van onder- en bovenstuk netjes op elkaar aan? Sleutel is het
 *              profielpaar onder>boven (geordend — boven en onder wisselen
 *              is een andere rand).
 *
 * Daarnaast schrijft het script per model@slag welk randprofiel er op welke
 * zijde is waargenomen (`profielen`), als naslag bij de regels. Brede
 * stukken beslaan meer cellen en tonen dan meerdere codes op één zijde.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BRON = process.argv[2] ?? join(ROOT, 'data', 'combinatieoordelen_16.json');
const DOEL = join(ROOT, 'data', 'aansluitregels_modulair-terrein.json');

let bron;
try {
  bron = JSON.parse(readFileSync(BRON, 'utf8'));
} catch (fout) {
  console.error(`Kan ${BRON} niet lezen als JSON: ${fout.message}`);
  process.exit(1);
}
if (bron === null || typeof bron.oordelen !== 'object' || bron.oordelen === null) {
  console.error(`Geen \`oordelen\` in ${BRON} — is dit wel een combinatieoordelen-bestand?`);
  process.exit(1);
}
const oordelen = Object.entries(bron.oordelen);

// Leeg of null profiel betekent: deze zijde heeft geen gemeten randprofiel
// (organische stukken als bergen en keien). In de sleutels heet dat '∅'.
const code = (r) => (r == null || r === '' ? '∅' : r);

const OVERZIJDE = { n: 'z', z: 'n', o: 'w', w: 'o' };

function verzamel() {
  const regels = { zij: new Map(), stapel: new Map(), rand: new Map() };
  const profielen = new Map();

  const noteerProfiel = (naam, slag, zijde, rand) => {
    const sleutel = `${naam}@${slag}`;
    if (!profielen.has(sleutel)) profielen.set(sleutel, new Map());
    const perZijde = profielen.get(sleutel);
    if (!perZijde.has(zijde)) perZijde.set(zijde, new Set());
    perZijde.get(zijde).add(code(rand));
  };

  for (const [sleutel, voeg] of oordelen) {
    const bouwsel = sleutel.split('|')[0];
    const soort = voeg.soort;

    let regelSleutel;
    if (soort === 'zij') {
      regelSleutel = voeg.randen.map(code).sort().join('|');
      noteerProfiel(voeg.namen[0], voeg.slagen[0], voeg.plek.zijde, voeg.randen[0]);
      noteerProfiel(voeg.namen[1], voeg.slagen[1], OVERZIJDE[voeg.plek.zijde], voeg.randen[1]);
    } else if (soort === 'stapel') {
      regelSleutel = `${voeg.namen[0]}>${voeg.namen[1]}`;
    } else {
      regelSleutel = voeg.randen.map(code).join('>');
    }

    if (!regels[soort].has(regelSleutel)) {
      regels[soort].set(regelSleutel, {
        goed: 0,
        niet: 0,
        meting: { waar: 0, onwaar: 0, geen: 0 },
        bouwsels: new Map(),
        vormen: new Map(),
        slagenGelijk: true,
      });
    }
    const regel = regels[soort].get(regelSleutel);
    regel[voeg.oordeel === 'goed' ? 'goed' : 'niet']++;
    regel.meting[voeg.meting === true ? 'waar' : voeg.meting === false ? 'onwaar' : 'geen']++;
    if (!regel.bouwsels.has(bouwsel)) regel.bouwsels.set(bouwsel, { goed: 0, niet: 0 });
    regel.bouwsels.get(bouwsel)[voeg.oordeel === 'goed' ? 'goed' : 'niet']++;
    regel.vormen.set(voeg.vorm, (regel.vormen.get(voeg.vorm) ?? 0) + 1);
    if (voeg.slagen[0] !== voeg.slagen[1]) regel.slagenGelijk = false;
  }

  return { regels, profielen };
}

function alsLijst(kaart, soort) {
  return [...kaart.entries()]
    .sort((a, b) => b[1].goed + b[1].niet - (a[1].goed + a[1].niet) || (a[0] < b[0] ? -1 : 1))
    .map(([sleutel, r]) => {
      const uit = {
        [soort === 'stapel' ? 'stukken' : 'randen']: sleutel,
        oordeel: r.niet === 0 ? 'goed' : r.goed === 0 ? 'niet' : 'omstreden',
        steun: { goed: r.goed, niet: r.niet },
        meting: r.meting,
        bouwsels: Object.fromEntries(
          [...r.bouwsels.entries()].map(([naam, telling]) => [naam, telling]),
        ),
        vormen: [...r.vormen.keys()].slice(0, 4),
      };
      if (soort === 'stapel') uit.slagenGelijk = r.slagenGelijk;
      return uit;
    });
}

const { regels, profielen } = verzamel();

const uitvoer = {
  kit: bron.kit,
  bron: relative(ROOT, resolve(BRON)),
  gemaakt: 'tools/leid-aansluitregels-af.mjs',
  toelichting:
    'Per combinatie het samengevatte oordeel uit de combinatieoordelen. ' +
    '`goed`/`niet` waar alle voegen het eens zijn, `omstreden` waar ' +
    'bouwsels elkaar tegenspreken — kijk dan bij `bouwsels` welke context ' +
    'wat vond. `meting` telt wat aansluitingen.mjs van diezelfde voegen ' +
    'vond. `∅` is een zijde zonder randprofiel. Duiding: ' +
    'docs/aansluitregels_modulair-terrein.md.',
  zij: alsLijst(regels.zij, 'zij'),
  stapel: alsLijst(regels.stapel, 'stapel'),
  rand: alsLijst(regels.rand, 'rand'),
  profielen: Object.fromEntries(
    [...profielen.entries()]
      .sort()
      .map(([model, perZijde]) => [
        model,
        Object.fromEntries(
          [...perZijde.entries()]
            .sort()
            .map(([zijde, codes]) => [zijde, [...codes].sort().join(' ')]),
        ),
      ]),
  ),
};

writeFileSync(DOEL, JSON.stringify(uitvoer, null, 1) + '\n');

const telling = (lijst) => {
  const per = { goed: 0, niet: 0, omstreden: 0 };
  for (const r of lijst) per[r.oordeel]++;
  return `${lijst.length} regels (${per.goed} goed, ${per.niet} niet, ${per.omstreden} omstreden)`;
};
console.log(`zij     ${telling(uitvoer.zij)}`);
console.log(`stapel  ${telling(uitvoer.stapel)}`);
console.log(`rand    ${telling(uitvoer.rand)}`);
console.log(`geschreven: ${DOEL}`);
