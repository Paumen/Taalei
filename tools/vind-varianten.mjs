/**
 * Zoekt gelijkende varianten in de collectie: modellen die dezelfde vorm
 * hebben en alleen in kleur, samenstelling of een detail verschillen.
 *
 * Draaien vanuit de repo-root:
 *   node tools/vind-varianten.mjs
 *
 * Schrijft docs/asset_variants.json met de gevonden groepen, plus
 * docs/asset_variants.groepen.json waarmee de renderharnas van
 * tools/vergelijk-groottes elke groep naast elkaar kan zetten:
 *
 *   NODE_PATH=$(npm root -g) node tools/vergelijk-groottes/render.mjs \
 *     docs/asset_variants.groepen.json docs/asset_variant_review
 *
 * Werkwijze: van elk model wordt de scène in wereldruimte uitgelezen (dezelfde
 * traversal als glb.mjs/meetScene, inclusief skinning), waarna drie
 * handtekeningen worden berekend:
 *
 *  - `hash`: de hoekpunten op 4 decimalen, gesorteerd en gehasht. Gelijke hash
 *    = letterlijk dezelfde geometrie; wat dan nog verschilt is kleur.
 *  - `hashMaat`: dezelfde hoekpunten, maar gecentreerd en op maat 1 geschaald.
 *    Gelijke hash = dezelfde mesh op een ander formaat.
 *  - `raster`: twee 16³ bezettingsrasters van de driehoeken. Het vaste raster
 *    schaalt het model gelijkmatig (langste as vult het raster) en houdt zo de
 *    verhoudingen vast: een blok is geen tegel. Het gerekte raster schaalt per
 *    as, waardoor een dunne tegel het raster in de hoogte vult en het reliëf
 *    op zijn oppervlak zichtbaar wordt. Een paar telt pas als variant als het
 *    op béide de drempel haalt — het vaste raster scheidt de vormen, het
 *    gerekte scheidt de tegels met verschillende groeven en planken.
 *
 * De rasters worden in vier yaw-standen vergeleken, want een variant staat soms
 * een kwartslag gedraaid.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { leesGlb, leesAccessor, maalMatrix, nodeMatrix, EENHEIDSMATRIX } from './glb.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const N = 16;                 // rasterresolutie per as
const WOORDEN = Math.ceil((N * N * N) / 32);
const DREMPEL_VARIANT = 0.9;  // vanaf hier: zelfde model, ander detail
const DREMPEL_VERWANT = 0.78; // daaronder: hooguit familie
/* Detail dat onder de rastercel valt — de groeven in een tegel, de planken op
 * een kist — zie je niet in het raster maar wel in het driehoekental. Twee
 * modellen die daarin een factor twee schelen zijn geen variant van elkaar. */
const DREMPEL_DRIEHOEKEN = 0.5;

/**
 * Paren die de meting niet ziet maar die het wél zijn (besluit PO). Ze worden
 * onvoorwaardelijk samengevoegd: een mens die zegt dat twee modellen dezelfde
 * asset zijn wint van het raster.
 *
 * De twee die er nu staan tonen allebei een grens van de meting:
 * `wood-plank-c` is dezelfde plank als `a` in dezelfde bounding box maar met
 * bijna drie keer zoveel driehoeken, en valt dus op de driehoekendrempel af;
 * `wood-log-b` is hetzelfde blok hout als `a` maar dunner, en dunner is voor
 * het gelijkmatig geschaalde raster gewoon een andere vorm.
 */
const HANDMATIG = [
  ['resources/wood-plank-a', 'resources/wood-plank-c'],
  ['resources/wood-log-a', 'resources/wood-log-b'],
];

/**
 * Welk lid een groep vertegenwoordigt: de catalogus toont van elke groep één
 * kaart, en dat hoort niet degene te zijn die toevallig vooraan in het alfabet
 * staat. Eerste rake regel wint; is er geen, dan het eerste lid.
 *
 * IJzer is de neutrale van de vier metalen (besluit PO) — koper, goud en zilver
 * lezen als "bijzonder", ijzer als "gewoon", en dat is wat je op de kaart wilt
 * zien staan.
 */
const VOORKEUR = [/(^|\/)iron-/];

const maalPunt = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];

/** Alle driehoeken van de scène in wereldruimte, als vlakke lijst punten. */
function leesDriehoeken(glb) {
  const { json } = glb;
  const nodes = json.nodes ?? [];
  const scene = json.scenes?.[json.scene ?? 0];

  const wereld = new Array(nodes.length).fill(null);
  const zetWereld = (index, ouder) => {
    if (wereld[index]) return;
    const node = nodes[index];
    if (!node) return;
    wereld[index] = maalMatrix(ouder, nodeMatrix(node));
    for (const kind of node.children ?? []) zetWereld(kind, wereld[index]);
  };
  for (const index of scene?.nodes ?? []) zetWereld(index, EENHEIDSMATRIX);

  const punten = [];     // [x,y,z] per hoekpunt van elke driehoek
  const hoekpunten = []; // alle posities, voor de vorm-hash

  nodes.forEach((node, index) => {
    if (node.mesh === undefined || !wereld[index]) return;

    for (const prim of json.meshes[node.mesh].primitives ?? []) {
      if ((prim.mode ?? 4) !== 4) continue;
      const positie = leesAccessor(glb, prim.attributes.POSITION);
      const skin = node.skin !== undefined && prim.attributes.JOINTS_0 !== undefined
        ? json.skins[node.skin]
        : null;

      /* posities in wereldruimte */
      const vp = new Float64Array(positie.count * 3);
      if (!skin) {
        for (let v = 0; v < positie.count; v++) {
          const p = maalPunt(wereld[index], positie.data[v * 3], positie.data[v * 3 + 1], positie.data[v * 3 + 2]);
          vp[v * 3] = p[0]; vp[v * 3 + 1] = p[1]; vp[v * 3 + 2] = p[2];
        }
      } else {
        const bind = leesAccessor(glb, skin.inverseBindMatrices);
        const gewrichten = leesAccessor(glb, prim.attributes.JOINTS_0);
        const gewichten = leesAccessor(glb, prim.attributes.WEIGHTS_0);
        const skinMatrix = skin.joints.map((n, k) =>
          maalMatrix(wereld[n] ?? EENHEIDSMATRIX, Array.from(bind.data.slice(k * 16, k * 16 + 16))),
        );
        for (let v = 0; v < positie.count; v++) {
          const [x, y, z] = [positie.data[v * 3], positie.data[v * 3 + 1], positie.data[v * 3 + 2]];
          const uit = [0, 0, 0];
          let som = 0;
          for (let k = 0; k < 4; k++) {
            const gewicht = gewichten.data[v * 4 + k];
            if (!gewicht) continue;
            const m = skinMatrix[gewrichten.data[v * 4 + k]];
            if (!m) continue;
            som += gewicht;
            const p = maalPunt(m, x, y, z);
            for (let as = 0; as < 3; as++) uit[as] += gewicht * p[as];
          }
          const p = som === 0 ? maalPunt(wereld[index], x, y, z) : uit.map((c) => c / som);
          vp[v * 3] = p[0]; vp[v * 3 + 1] = p[1]; vp[v * 3 + 2] = p[2];
        }
      }

      for (let v = 0; v < positie.count; v++) {
        hoekpunten.push([vp[v * 3], vp[v * 3 + 1], vp[v * 3 + 2]]);
      }

      const index3 = prim.indices !== undefined ? leesAccessor(glb, prim.indices).data : null;
      const aantal = index3 ? index3.length : positie.count;
      for (let i = 0; i + 2 < aantal; i += 3) {
        for (let k = 0; k < 3; k++) {
          const v = index3 ? index3[i + k] : i + k;
          punten.push(vp[v * 3], vp[v * 3 + 1], vp[v * 3 + 2]);
        }
      }
    }
  });

  return { punten, hoekpunten };
}

/**
 * Bezettingsraster: de driehoeken uitgezaaid over een N³-raster. Het model
 * wordt gelijkmatig geschaald (langste as vult het raster) en gecentreerd, dus
 * de verhoudingen blijven staan: een halve muur is geen hele muur, en een
 * platte tegel valt niet samen met een blok.
 */
function maakRaster(punten, rek) {
  const bits = new Uint32Array(WOORDEN);
  if (punten.length === 0) return { bits, aantal: 0 };

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < punten.length; i += 3) {
    for (let as = 0; as < 3; as++) {
      if (punten[i + as] < min[as]) min[as] = punten[i + as];
      if (punten[i + as] > max[as]) max[as] = punten[i + as];
    }
  }
  const langste = Math.max(...[0, 1, 2].map((as) => max[as] - min[as]), 1e-6);
  const maat = [0, 1, 2].map((as) => (rek ? Math.max(max[as] - min[as], 1e-6) : langste));
  const midden = [0, 1, 2].map((as) => (min[as] + max[as]) / 2);

  const zet = (x, y, z) => {
    const cel = [x, y, z].map((c, as) =>
      Math.min(N - 1, Math.max(0, Math.floor((((c - midden[as]) / maat[as]) + 0.5) * N))));
    const i = (cel[0] * N + cel[1]) * N + cel[2];
    bits[i >>> 5] |= 1 << (i & 31);
  };

  /* Elke driehoek fijn genoeg bemonsteren dat er geen rastercel tussenuit valt. */
  for (let t = 0; t < punten.length; t += 9) {
    const a = punten.slice(t, t + 3);
    const b = punten.slice(t + 3, t + 6);
    const c = punten.slice(t + 6, t + 9);
    const zijde = (p, q) => Math.max(...[0, 1, 2].map((as) => Math.abs(p[as] - q[as]) / maat[as]));
    const stappen = Math.min(64, Math.max(1, Math.ceil(Math.max(zijde(a, b), zijde(a, c), zijde(b, c)) * N * 2)));
    for (let i = 0; i <= stappen; i++) {
      for (let j = 0; i + j <= stappen; j++) {
        const u = i / stappen, v = j / stappen, w = 1 - u - v;
        zet(a[0] * w + b[0] * u + c[0] * v, a[1] * w + b[1] * u + c[1] * v, a[2] * w + b[2] * u + c[2] * v);
      }
    }
  }

  let aantal = 0;
  for (const woord of bits) aantal += popcount(woord);
  return { bits, aantal };
}

function popcount(v) {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** Hetzelfde raster, een kwartslag om de hoogte-as (Y) gedraaid. */
function draai(bits) {
  const uit = new Uint32Array(WOORDEN);
  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) {
      for (let z = 0; z < N; z++) {
        const i = (x * N + y) * N + z;
        if (!(bits[i >>> 5] & (1 << (i & 31)))) continue;
        const j = ((N - 1 - z) * N + y) * N + x;
        uit[j >>> 5] |= 1 << (j & 31);
      }
    }
  }
  return uit;
}

function jaccard(a, b, aantalA, aantalB) {
  let snede = 0;
  for (let w = 0; w < WOORDEN; w++) snede += popcount(a[w] & b[w]);
  return snede / (aantalA + aantalB - snede);
}

const hashVan = (punten) =>
  createHash('sha1').update(punten.slice().sort().join(';')).digest('hex').slice(0, 16);

/** Hoekpunten gecentreerd op hun bounding box en gelijkmatig op maat 1 gezet. */
function normaliseer(punten) {
  if (punten.length === 0) return punten;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of punten) {
    p.forEach((c, as) => {
      if (c < min[as]) min[as] = c;
      if (c > max[as]) max[as] = c;
    });
  }
  const maat = Math.max(...[0, 1, 2].map((as) => max[as] - min[as]), 1e-6);
  return punten.map((p) => p
    .map((c, as) => ((c - (min[as] + max[as]) / 2) / maat).toFixed(3))
    .join(','));
}

/* -- inlezen -------------------------------------------------------------- */

const catalogus = JSON.parse(readFileSync(path.join(ROOT, 'kits', 'catalog.json'), 'utf8'));
const modellen = [];

for (const model of catalogus.modellen) {
  let vorm;
  try {
    vorm = leesDriehoeken(leesGlb(path.join(ROOT, model.pad)));
  } catch (fout) {
    console.log(`overgeslagen ${model.id}: ${fout.message}`);
    continue;
  }
  const vast = maakRaster(vorm.punten, false);
  const rek = maakRaster(vorm.punten, true);
  modellen.push({
    ...model,
    hash: hashVan(vorm.hoekpunten.map((p) => p.map((c) => c.toFixed(4)).join(','))),
    /* dezelfde hoekpunten, maar gecentreerd en op de langste as geschaald:
     * gelijke hash = dezelfde mesh op een ander formaat */
    hashMaat: hashVan(normaliseer(vorm.hoekpunten)),
    vast: [vast.bits, null, null, null],
    rek: [rek.bits, null, null, null],
    aantalVast: vast.aantal,
    aantalRek: rek.aantal,
  });
}
for (const m of modellen) {
  for (let k = 1; k < 4; k++) {
    m.vast[k] = draai(m.vast[k - 1]);
    m.rek[k] = draai(m.rek[k - 1]);
  }
}
console.log(`${modellen.length} modellen gemeten`);

/* -- vergelijken ----------------------------------------------------------- */

const paren = [];
for (let i = 0; i < modellen.length; i++) {
  const a = modellen[i];
  if (!a.aantalVast) continue;
  for (let j = i + 1; j < modellen.length; j++) {
    const b = modellen[j];
    if (!b.aantalVast) continue;
    /* modellen die qua bezetting te ver uit elkaar liggen kunnen de drempel
     * nooit halen: min/max van de bezetting begrenst Jaccard van bovenaf */
    if (Math.min(a.aantalVast, b.aantalVast) / Math.max(a.aantalVast, b.aantalVast) < DREMPEL_VERWANT) continue;
    if (Math.min(a.aantalRek, b.aantalRek) / Math.max(a.aantalRek, b.aantalRek) < DREMPEL_VERWANT) continue;
    if (Math.min(a.driehoeken, b.driehoeken) / Math.max(a.driehoeken, b.driehoeken) < DREMPEL_DRIEHOEKEN) continue;

    /* per yaw-stand telt de zwakste van de twee rasters; het beste van de vier */
    let beste = 0;
    let besteVast = 0;
    let besteRek = 0;
    for (let k = 0; k < 4; k++) {
      const v = jaccard(a.vast[0], b.vast[k], a.aantalVast, b.aantalVast);
      const r = jaccard(a.rek[0], b.rek[k], a.aantalRek, b.aantalRek);
      if (Math.min(v, r) > beste) { beste = Math.min(v, r); besteVast = v; besteRek = r; }
    }
    if (beste < DREMPEL_VERWANT) continue;

    const zelfdeVorm = a.hash === b.hash;
    const zelfdeMesh = a.hashMaat === b.hashMaat; // zelfde mesh, mogelijk ander formaat
    const zelfdeKleur = JSON.stringify(a.kleuren) === JSON.stringify(b.kleuren);
    paren.push({
      a: a.id,
      b: b.id,
      overlap: Math.round(beste * 1000) / 1000,
      overlapVast: Math.round(besteVast * 1000) / 1000,
      overlapRek: Math.round(besteRek * 1000) / 1000,
      zelfdeVorm,
      zelfdeKleur,
      zelfdeMesh,
      soort: zelfdeVorm && zelfdeKleur ? 'duplicaat'
        : zelfdeMesh && !zelfdeKleur ? 'kleurvariant'
          : zelfdeMesh ? 'maatvariant'
            : beste >= DREMPEL_VARIANT ? 'detailvariant' : 'verwant',
      driehoeken: [a.driehoeken, b.driehoeken],
      wdh: [a.wdh, b.wdh],
      kleuren: [a.kleuren, b.kleuren],
    });
  }
}
paren.sort((x, y) => y.overlap - x.overlap);

/* -- groeperen ------------------------------------------------------------
 * Volledige koppeling: een groep ontstaat alleen als élk paar erin de drempel
 * haalt. Zonder die eis rijgt de ene vergelijkbare buur de andere aan zich en
 * eindigt de halve collectie in één groep.
 */

const overlapVan = new Map(paren.map((p) => [`${p.a}|${p.b}`, p]));
const paarVan = (a, b) => overlapVan.get(a < b ? `${a}|${b}` : `${b}|${a}`);

const groepVan = new Map();
const groepen = [];
for (const paar of paren) {
  if (paar.soort === 'verwant') continue;
  const ga = groepVan.get(paar.a);
  const gb = groepVan.get(paar.b);
  if (ga && ga === gb) continue;

  const kandidaat = [...new Set([...(ga ?? [paar.a]), ...(gb ?? [paar.b])])];
  const kliek = kandidaat.every((x, i) => kandidaat.every((y, j) => {
    if (j <= i) return true;
    const p = paarVan(x, y);
    return p && p.soort !== 'verwant';
  }));
  if (!kliek) continue;

  for (const groep of [ga, gb]) {
    if (groep) groepen.splice(groepen.indexOf(groep), 1);
  }
  groepen.push(kandidaat);
  for (const id of kandidaat) groepVan.set(id, kandidaat);
}

/* De handmatige paren erbij. Geen kliekcontrole: dit is een uitspraak, geen
 * meting. Een paar dat een model noemt dat niet in de catalogus staat wordt
 * overgeslagen — dan is het model verwijderd en de uitspraak achterhaald. */
const bekend = new Set(modellen.map((m) => m.id));
for (const [a, b] of HANDMATIG) {
  if (!bekend.has(a) || !bekend.has(b)) {
    console.log(`handmatig paar overgeslagen (niet in de catalogus): ${a} ↔ ${b}`);
    continue;
  }
  const ga = groepVan.get(a);
  const gb = groepVan.get(b);
  if (ga && ga === gb) continue;

  const samen = [...new Set([...(ga ?? [a]), ...(gb ?? [b])])];
  for (const groep of [ga, gb]) {
    if (groep) groepen.splice(groepen.indexOf(groep), 1);
  }
  groepen.push(samen);
  for (const id of samen) groepVan.set(id, samen);
}

const handmatigPaar = new Set(HANDMATIG.map(([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`)));

const bijId = new Map(modellen.map((m) => [m.id, m]));
const clusters = groepen
  .map((leden) => {
    leden.sort();
    /* Alle paren binnen de groep. Een handmatig paar is niet gemeten, dus daar
     * hoort geen overlap bij; het staat er met soort 'handmatig' in. */
    const eigen = [];
    for (let i = 0; i < leden.length; i++) {
      for (let j = i + 1; j < leden.length; j++) {
        const sleutel = leden[i] < leden[j] ? `${leden[i]}|${leden[j]}` : `${leden[j]}|${leden[i]}`;
        const gemeten = paarVan(leden[i], leden[j]);
        if (gemeten && gemeten.soort !== 'verwant') eigen.push(gemeten);
        else if (handmatigPaar.has(sleutel)) eigen.push({ a: leden[i], b: leden[j], soort: 'handmatig', overlap: null });
      }
    }
    const soorten = new Set(eigen.map((p) => p.soort));
    const gemeten = eigen.filter((p) => p.overlap !== null);
    /* verschilt de groep alleen in maat? dan is de vorm dezelfde en de
     * bounding boxen zijn niet gelijk */
    const maten = leden.map((id) => bijId.get(id).wdh.join('x'));
    return {
      leden,
      /* De kaart die de catalogus van deze groep toont. */
      hoofd: leden.find((id) => VOORKEUR.some((regel) => regel.test(id))) ?? leden[0],
      kits: [...new Set(leden.map((id) => id.split('/')[0]))].sort(),
      soort: soorten.has('detailvariant') || soorten.has('handmatig') ? 'detailvariant'
        : soorten.has('kleurvariant') ? 'kleurvariant'
          : soorten.has('maatvariant') ? 'maatvariant' : 'duplicaat',
      soorten: [...soorten].sort(),
      zelfdeMaat: new Set(maten).size === 1,
      minOverlap: gemeten.length ? Math.min(...gemeten.map((p) => p.overlap)) : null,
      wdh: leden.map((id) => bijId.get(id).wdh),
      driehoeken: leden.map((id) => bijId.get(id).driehoeken),
      kleuren: leden.map((id) => bijId.get(id).kleuren),
      paren: eigen.map((p) => ({ a: p.a, b: p.b, soort: p.soort, overlap: p.overlap })),
    };
  })
  .sort((a, b) => b.leden.length - a.leden.length || a.leden[0].localeCompare(b.leden[0]));

const uit = {
  gegenereerd: 'node tools/vind-varianten.mjs',
  raster: N,
  drempels: { variant: DREMPEL_VARIANT, verwant: DREMPEL_VERWANT },
  gemeten: modellen.length,
  clusters,
  verwant: paren.filter((p) => p.soort === 'verwant').map((p) => ({ a: p.a, b: p.b, overlap: p.overlap })),
};
writeFileSync(path.join(ROOT, 'docs', 'asset_variants.json'), `${JSON.stringify(uit, null, 1)}\n`);

/* groepenbestand voor de renderharnas: één plaat per groep */
const groepenBestand = {};
clusters.forEach((cluster, n) => {
  const naam = `${String(n + 1).padStart(2, '0')}-${cluster.soort}-${cluster.leden[0].replace(/\//g, '-')}`;
  groepenBestand[naam] = {
    items: [cluster.hoofd, ...cluster.leden.filter((id) => id !== cluster.hoofd)].map((id) => ({
      pad: bijId.get(id).pad.replace(/^kits\//, ''),
      label: id,
    })),
  };
});
writeFileSync(
  path.join(ROOT, 'docs', 'asset_variants.groepen.json'),
  `${JSON.stringify(groepenBestand, null, 1)}\n`,
);

const tel = (soort) => clusters.filter((c) => c.soort === soort).length;
console.log(`${clusters.length} groepen (${tel('duplicaat')} duplicaat, ${tel('kleurvariant')} kleurvariant, ${tel('maatvariant')} maatvariant, ${tel('detailvariant')} detailvariant)`);
console.log(`${uit.verwant.length} verwante paren onder de variantdrempel`);
