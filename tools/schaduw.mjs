/**
 * Zet de facetten van een model aan of uit door alléén de normalen te
 * herschrijven. Posities, uv's, materialen, skins en animaties blijven zoals ze
 * zijn: het silhouet van een achtkant blijft een achtkant en de kleur verschiet
 * niet, want de uv's blijven naar dezelfde cel van de colormap wijzen.
 *
 * Draai vanuit de repo-root:
 *
 *     node tools/schaduw.mjs props                    # hele kit, facetten uit op 20°
 *     node tools/schaduw.mjs props/bottle-a --vlak    # één model, facetten aan
 *     node tools/schaduw.mjs rocks --glad=30 --droog  # alleen kijken wat er zou gebeuren
 *
 * Draai daarna `node tools/build-catalog.mjs` opnieuw: de driehoekstelling
 * verandert niet, maar bij `--vlak` wel de bestandsgrootte.
 *
 * -- waarom een drempel --------------------------------------------------
 *
 * `--glad[=graden]` middelt de hoekpuntnormalen over de aangrenzende vlakken,
 * maar alleen over vlakken die binnen `graden` van elkaar liggen. Zonder die
 * drempel smelt de rand tussen wand en deksel weg en wordt een vat een ei; met
 * drempel blijft een echte rand een rand. Twintig graden is bewust de zuinige
 * kant: een achtkant heeft 45° tussen zijn zijden en blijft dus staan, en
 * kubisch meubilair (`props/stool-a`, `props/table-a`) verandert op geen enkele
 * drempel. Wat op 20° wél in elkaar vloeit zijn de hoogteringen van een
 * gedraaide vorm, die vaak maar een paar graden uit elkaar liggen.
 *
 * Stijlgids §0 en §2 vragen om facetten ("Faceted, iconic, story book", "Round
 * shapes visibly built from flat pieces"), dus `--glad` is de richting die je
 * per model verantwoordt, niet de richting die je over de hele repo loslaat.
 * `kits/rocks/` is het duidelijkste voorbeeld: daar ís het facet het model.
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leesGlb, schrijfGlb, leesAccessor } from './glb.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KITS = join(ROOT, 'kits');

const COMPONENT = {
  5120: Int8Array, 5121: Uint8Array, 5122: Int16Array,
  5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array,
};
const ONDERDELEN = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/* -- rekenwerk ------------------------------------------------------------ */

const kruis = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const min3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

const eenheid = (n) => {
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / l, n[1] / l, n[2] / l];
};

/** Vlaknormaal, niet genormaliseerd: zijn lengte is 2× de oppervlakte. */
function vlaknormaal(pos, a, b, c) {
  const P = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
  return kruis(min3(P(b), P(a)), min3(P(c), P(a)));
}

/**
 * Gemiddelde normalen, gewogen naar oppervlakte, per positie gegroepeerd.
 *
 * Groeperen gaat op positie en niet op hoekpuntindex, want de kits wijzen hun
 * uv's naar losse cellen van de gedeelde colormap: rond een kleurnaad staan
 * twee hoekpunten op dezelfde plek met verschillende uv's. Die moeten dezelfde
 * normaal krijgen — anders blijft de naad als een lichtrand zichtbaar — maar
 * hun eigen uv houden. De vertexlayout verandert dus niet.
 */
function gladdeNormalen(pos, idx, drempelGraden) {
  const lees = (k) => (idx ? idx[k] : k);
  const telling = idx ? idx.length : pos.length / 3;

  const sleutel = (i) =>
    `${pos[i * 3].toFixed(4)},${pos[i * 3 + 1].toFixed(4)},${pos[i * 3 + 2].toFixed(4)}`;

  const bij = new Map(); // positie → [{ vlak, hoekpunt }]
  const vlakken = [];
  for (let t = 0; t + 2 < telling; t += 3) {
    const hoek = [lees(t), lees(t + 1), lees(t + 2)];
    const ruw = vlaknormaal(pos, ...hoek);
    const f = vlakken.push({ n: eenheid(ruw), opp: Math.hypot(ruw[0], ruw[1], ruw[2]) }) - 1;
    for (const h of hoek) {
      const s = sleutel(h);
      if (!bij.has(s)) bij.set(s, []);
      bij.get(s).push({ vlak: f, hoekpunt: h });
    }
  }

  const cos = Math.cos((drempelGraden * Math.PI) / 180);
  const nor = new Float32Array((pos.length / 3) * 3);

  for (const groep of bij.values()) {
    for (const { vlak: eigen, hoekpunt } of groep) {
      const e = vlakken[eigen].n;
      let som = [0, 0, 0];
      for (const { vlak: ander } of groep) {
        const a = vlakken[ander];
        // Buiten de drempel telt de buur niet mee: een harde rand blijft hard.
        if (e[0] * a.n[0] + e[1] * a.n[1] + e[2] * a.n[2] < cos) continue;
        som = [som[0] + a.n[0] * a.opp, som[1] + a.n[1] * a.opp, som[2] + a.n[2] * a.opp];
      }
      const g = eenheid(som[0] || som[1] || som[2] ? som : e);
      for (let k = 0; k < 3; k++) nor[hoekpunt * 3 + k] = g[k];
    }
  }
  return nor;
}

/**
 * Aandeel driehoeken waarvan de hoekpuntnormalen uiteenlopen: precies wat de
 * shader over het vlak heen kan interpoleren, en dus wat "glad" oogt.
 */
function gladheid(nor, idx, telling) {
  const lees = (k) => (idx ? idx[k] : k);
  const hoek = (u, v) => {
    const d = nor[u*3]*nor[v*3] + nor[u*3+1]*nor[v*3+1] + nor[u*3+2]*nor[v*3+2];
    return Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI;
  };
  let glad = 0, alle = 0;
  for (let t = 0; t + 2 < telling; t += 3) {
    const [a, b, c] = [lees(t), lees(t + 1), lees(t + 2)];
    alle++;
    if (Math.max(hoek(a, b), hoek(b, c), hoek(a, c)) > 5) glad++;
  }
  return alle ? glad / alle : 0;
}

/* -- de GLB terugschrijven -------------------------------------------------
 * Twee gevallen, want ze kosten niet hetzelfde.
 *
 * `--glad` houdt de vertexlayout heel: dan is de goedkoopste en veiligste weg
 * de nieuwe normalen tussen de bestaande bytes terugschrijven, op de plek en
 * met de stap die de accessor zelf aangeeft. De rest van het bestand blijft
 * byte voor byte hetzelfde, dus skins en animaties kunnen niet stukgaan.
 *
 * `--vlak` ontvlecht: elke driehoek krijgt eigen hoekpunten, dus de tellingen
 * veranderen en de buffer moet opnieuw. Daarbij worden álle accessors opnieuw
 * weggeschreven — ook die van skins en animaties — op hun eigen index, zodat
 * elke verwijzing elders in het bestand blijft kloppen.
 */

/** Schrijft VEC3-floats terug in de bestaande buffer, met respect voor byteStride. */
function schrijfNormalenTerug(glb, accessorIndex, nor) {
  const acc = glb.json.accessors[accessorIndex];
  if (acc.componentType !== 5126 || acc.type !== 'VEC3') {
    throw new Error(`NORMAL-accessor ${accessorIndex} is geen float32 VEC3`);
  }
  const bv = glb.json.bufferViews[acc.bufferView];
  const start = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const stap = bv.byteStride ?? 12;
  for (let i = 0; i < acc.count; i++) {
    for (let k = 0; k < 3; k++) glb.bin.writeFloatLE(nor[i * 3 + k], start + i * stap + k * 4);
  }
}

/**
 * Bouwt json + bin opnieuw op. `vervanging` is accessorIndex → { data, count },
 * met `data` als typed array van hetzelfde componentType; alle andere accessors
 * worden ongewijzigd meegekopieerd, ontvlochten naar hun eigen bufferView.
 */
function herbouw(glb, vervanging) {
  const bron = glb.json;
  const stukken = [];
  const bufferViews = [];
  const accessors = [];
  let lengte = 0;

  for (let i = 0; i < bron.accessors.length; i++) {
    const acc = bron.accessors[i];
    if (acc.sparse) throw new Error('sparse accessor wordt niet ondersteund');
    const Soort = COMPONENT[acc.componentType];
    const breedte = ONDERDELEN[acc.type];
    const stapUit = breedte * Soort.BYTES_PER_ELEMENT;

    // De spec eist dat een accessor begint op een veelvoud van zijn componentgrootte.
    while (lengte % 4 !== 0) { stukken.push(Buffer.alloc(1)); lengte++; }

    let buf;
    let telling;
    const nieuw = vervanging.get(i);
    if (nieuw) {
      buf = Buffer.from(nieuw.data.buffer, nieuw.data.byteOffset, nieuw.data.byteLength);
      telling = nieuw.count;
    } else {
      const bv = bron.bufferViews[acc.bufferView];
      const start = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
      const stapIn = bv.byteStride ?? stapUit;
      buf = Buffer.alloc(acc.count * stapUit);
      for (let r = 0; r < acc.count; r++) {
        glb.bin.copy(buf, r * stapUit, start + r * stapIn, start + r * stapIn + stapUit);
      }
      telling = acc.count;
    }

    bufferViews.push({ buffer: 0, byteOffset: lengte, byteLength: buf.length });
    stukken.push(buf);
    lengte += buf.length;
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType: acc.componentType,
      count: telling,
      type: acc.type,
      ...(nieuw?.min ? { min: nieuw.min, max: nieuw.max } : acc.min ? { min: acc.min, max: acc.max } : {}),
    });
  }

  return {
    json: { ...bron, accessors, bufferViews, buffers: [{ byteLength: lengte }] },
    bin: Buffer.concat(stukken),
  };
}

/* -- één model -------------------------------------------------------------- */

/**
 * Geeft `{ voor, na, bytesVoor, bytesNa }` terug, of `null` als het model niets
 * te herschrijven heeft.
 */
function verwerk(pad, modus, drempel, droog) {
  const glb = leesGlb(pad);
  const bytesVoor = statSync(pad).size;

  // Een accessor die twee primitives delen zou bij het ontvlechten twee
  // verschillende tellingen moeten krijgen. Dat komt in deze kits niet voor;
  // als het ooit gebeurt is stoppen beter dan er stilzwijgend naast zitten.
  const gezien = new Set();
  for (const mesh of glb.json.meshes ?? []) {
    for (const prim of mesh.primitives) {
      for (const index of [...Object.values(prim.attributes), prim.indices]) {
        if (index === undefined) continue;
        if (gezien.has(index)) throw new Error(`${basename(pad)}: accessor ${index} wordt gedeeld`);
        gezien.add(index);
      }
    }
  }

  let voorSom = 0, naSom = 0, driehoeken = 0;
  let raakt = false;
  const vervanging = new Map();

  for (const mesh of glb.json.meshes ?? []) {
    for (const prim of mesh.primitives) {
      if (prim.attributes.NORMAL === undefined || prim.indices === undefined) continue;
      const pos = leesAccessor(glb, prim.attributes.POSITION).data;
      const nor = leesAccessor(glb, prim.attributes.NORMAL).data;
      const idx = leesAccessor(glb, prim.indices).data;
      const tri = idx.length / 3;
      const voor = gladheid(nor, idx, idx.length);
      driehoeken += tri;
      voorSom += voor * tri;

      if (modus === 'glad') {
        const nieuw = gladdeNormalen(pos, idx, drempel);
        naSom += gladheid(nieuw, idx, idx.length) * tri;
        // Alleen aanraken als er echt iets verschuift: zo blijft een tweede
        // draai een no-op en laat een kit-brede run alleen de modellen na die
        // ook werkelijk veranderd zijn.
        if (nieuw.some((v, k) => Math.abs(v - nor[k]) > 1e-4)) {
          raakt = true;
          if (!droog) schrijfNormalenTerug(glb, prim.attributes.NORMAL, nieuw);
        }
        continue;
      }

      // --vlak: al vlak is al klaar. Opnieuw ontvlechten zou alleen bytes
      // kosten — de dolfijn groeit er 32 kB van zonder één pixel te verschuiven.
      if (voor === 0) {
        naSom += 0;
        continue;
      }
      raakt = true;

      // Elk hoekpunt los, met de normaal van zijn eigen driehoek.
      const n = idx.length;
      for (const [naam, accIndex] of Object.entries(prim.attributes)) {
        const acc = glb.json.accessors[accIndex];
        const gelezen = leesAccessor(glb, accIndex);
        const Soort = COMPONENT[acc.componentType];
        const breedte = gelezen.breedte;
        const data = new Soort(n * breedte);
        const min = naam === 'POSITION' ? new Array(breedte).fill(Infinity) : null;
        const max = naam === 'POSITION' ? new Array(breedte).fill(-Infinity) : null;

        for (let i = 0; i < n; i++) {
          const oud = idx[i];
          for (let k = 0; k < breedte; k++) {
            const v = gelezen.data[oud * breedte + k];
            data[i * breedte + k] = v;
            if (min) { if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
          }
        }
        vervanging.set(accIndex, { data, count: n, ...(min ? { min, max } : {}) });
      }

      // Normalen ná het ontvlechten: elke driehoek zijn eigen vlaknormaal.
      const nieuwePos = vervanging.get(prim.attributes.POSITION).data;
      const nieuweNor = new Float32Array(n * 3);
      for (let t = 0; t < n; t += 3) {
        const f = eenheid(vlaknormaal(nieuwePos, t, t + 1, t + 2));
        for (let k = 0; k < 3; k++) {
          nieuweNor[t * 3 + k] = f[k];
          nieuweNor[(t + 1) * 3 + k] = f[k];
          nieuweNor[(t + 2) * 3 + k] = f[k];
        }
      }
      vervanging.set(prim.attributes.NORMAL, { data: nieuweNor, count: n });

      const Index = n > 65535 ? Uint32Array : Uint16Array;
      const nieuweIdx = new Index(n);
      for (let i = 0; i < n; i++) nieuweIdx[i] = i;
      vervanging.set(prim.indices, { data: nieuweIdx, count: n });
      glb.json.accessors[prim.indices].componentType = n > 65535 ? 5125 : 5123;

      naSom += gladheid(nieuweNor, nieuweIdx, n) * tri;
    }
  }

  if (driehoeken === 0) return null;

  if (!droog && raakt) {
    if (modus === 'glad') {
      schrijfGlb(pad, glb.json, glb.bin, writeFileSync);
    } else {
      const uit = herbouw(glb, vervanging);
      schrijfGlb(pad, uit.json, uit.bin, writeFileSync);
    }
  }

  return {
    voor: voorSom / driehoeken,
    na: naSom / driehoeken,
    driehoeken,
    bytesVoor,
    bytesNa: droog ? bytesVoor : statSync(pad).size,
  };
}

/* -- doelen uitzoeken ------------------------------------------------------ */

/** `props` → hele kit, `props/bottle-a` → één model, `kits/props/x.glb` → pad. */
function zoekDoelen(doel) {
  const alsPad = resolve(ROOT, doel);
  if (existsSync(alsPad) && statSync(alsPad).isFile()) return [alsPad];

  const alsKit = join(KITS, doel);
  if (existsSync(alsKit) && statSync(alsKit).isDirectory()) {
    return readdirSync(alsKit).filter((n) => n.endsWith('.glb')).sort().map((n) => join(alsKit, n));
  }

  const alsModel = join(KITS, `${doel}.glb`);
  if (existsSync(alsModel)) return [alsModel];

  throw new Error(`geen kit, model of bestand gevonden voor "${doel}"`);
}

/* -- aanroep ---------------------------------------------------------------- */

const argv = process.argv.slice(2);
const vlaggen = argv.filter((a) => a.startsWith('--'));
const doelen = argv.filter((a) => !a.startsWith('--'));

if (doelen.length === 0) {
  console.error('gebruik: node tools/schaduw.mjs <kit|kit/model|pad>… [--glad[=graden] | --vlak] [--droog]');
  process.exit(1);
}

const wilVlak = vlaggen.includes('--vlak');
const gladVlag = vlaggen.find((v) => v === '--glad' || v.startsWith('--glad='));
if (wilVlak && gladVlag) {
  console.error('--vlak en --glad sluiten elkaar uit');
  process.exit(1);
}

const DREMPEL_STANDAARD = 20;
const drempel = gladVlag?.includes('=') ? Number(gladVlag.split('=')[1]) : DREMPEL_STANDAARD;
if (!wilVlak && !(drempel > 0 && drempel < 180)) {
  console.error(`drempel moet tussen 0 en 180 graden liggen, niet "${gladVlag.split('=')[1]}"`);
  process.exit(1);
}

const modus = wilVlak ? 'vlak' : 'glad';
const droog = vlaggen.includes('--droog');

const onbekend = vlaggen.filter((v) => !['--vlak', '--droog'].includes(v) && !v.startsWith('--glad'));
if (onbekend.length) {
  console.error(`onbekende vlag: ${onbekend.join(', ')}`);
  process.exit(1);
}

const paden = [...new Set(doelen.flatMap(zoekDoelen))].sort();
console.log(
  `${modus === 'vlak' ? 'facetten aan (vlakke normalen)' : `facetten uit (drempel ${drempel}°)`}` +
  `${droog ? ' — DROOG, er wordt niets geschreven' : ''}: ${paden.length} model(len)`,
);
console.log('model'.padEnd(42), 'tri'.padStart(6), 'glad voor'.padStart(10), 'na'.padStart(6), 'bytes'.padStart(10));

let veranderd = 0, bytesDelta = 0;
for (const pad of paden) {
  const uit = verwerk(pad, modus, drempel, droog);
  if (!uit) { console.log(`${pad.slice(KITS.length + 1).padEnd(42)}  — geen mesh met normalen`); continue; }
  const delta = uit.bytesNa - uit.bytesVoor;
  bytesDelta += delta;
  if (Math.abs(uit.na - uit.voor) > 0.005) veranderd++;
  console.log(
    pad.slice(KITS.length + 1).replace('.glb', '').padEnd(42),
    String(uit.driehoeken).padStart(6),
    ((uit.voor * 100).toFixed(0) + '%').padStart(10),
    ((uit.na * 100).toFixed(0) + '%').padStart(6),
    (delta === 0 ? '—' : `${delta > 0 ? '+' : ''}${delta}`).padStart(10),
  );
}

console.log(
  `\n${veranderd} van de ${paden.length} modellen veranderen van schaduw` +
  `${droog ? '' : `, ${bytesDelta >= 0 ? '+' : ''}${bytesDelta} bytes`}.`,
);
if (!droog) console.log('draai nu `node tools/build-catalog.mjs` opnieuw.');
