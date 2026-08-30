// Maakt hoektegels voor de overgang van kasseien naar zand: keien alleen nog in
// één hoek, naar twee kanten tegelijk uitgedoofd. De kit heeft die niet — zijn
// vier overgangstegels doven alle vier langs één rand uit — dus een geplaveid
// vlak kan wel een rechte rand naar zand krijgen, maar geen buitenhoek.
//
//   node tools/bouw-hoekovergang.mjs [--uit kits/workfiles/village-kit]
//
// Gemaakt uit cobblestone-floor-a, niet nieuw getekend: de keien van die tegel
// worden er één voor één uit weggehaald, met een kans die afhangt van hun
// afstand tot de dichte hoek. Zo houden de hoektegels precies dezelfde keien —
// vorm, formaat en de drie grijstinten uit de kleurenkaart — als de tegels
// waar ze tegenaan komen te liggen, en dat is aan de naad niet te zien.
//
// Weghalen is hier platleggen, niet wissen. Een kei zit in de tegel verzonken:
// het zandvlak heeft een gat precies in haar omtrek en de kei vult dat gat. Bij
// wissen blijft dat gat open. Bij platleggen — alle hoekpunten van de kei naar
// y = 0, normaal omhoog, uv naar de zandkleur van het vlak eromheen — vult ze
// haar eigen gat weer op, en wat overblijft is zand. De wandjes van de kei
// vallen daarbij plat: die met een oppervlak van nul gaan eruit, die van een
// afgeschuinde kei blijven als vlakke rand liggen en vullen mee.
//
// Wat na het platleggen overblijft is één vlak zandveld dat nog getekend staat
// met alle hoekpunten van de weggehaalde keien erin. Die zijn nergens meer voor
// nodig: alles ligt in hetzelfde vlak, dus elk hoekpunt dat niet op de rand van
// de tegel of van een overgebleven kei ligt kan eruit, en het gat dat het
// achterlaat wordt opnieuw opgevuld. Dat verandert niets aan de vorm — het
// scheelt alleen driehoeken, en zonder dat blijft een vrijwel kale tegel er even
// zwaar als de volle vloertegel waar ze uit komt.
//
// De kansverdeling is afgekeken van de vier bestaande overgangstegels: langs
// hun dichte rand blijft ~0,89 van de keien staan, halverwege ~0,25, en de
// laatste achtste is helemaal kaal zodat de tegel schoon tegen kaal zand komt.
// Hier is dezelfde curve radiaal gelegd, gemeten vanaf de dichte hoek: langs
// beide randen van de hoektegel loopt hij dan precies zoals bij een rechte
// overgangstegel, en de tegels sluiten aan zonder sprong.
import { writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor } from '../catalog/tools/glb.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KIT = join(ROOT, 'kits', 'workfiles', 'village-kit');
const BRON = 'cobblestone-floor-a';

// De dichte hoek is de hoek met de kleinste x en de kleinste z, dezelfde kant
// als waar de rechte overgangstegels hun dichte rand hebben (die doven uit naar
// +x). Een kwartslag draaien wijst hem dus net zo als bij die tegels.
// Vier trekkingen, uitgezocht uit de eerste veertig zaden op één voorwaarde: in
// de dichte hoek moet minstens vier vijfde van het keienoppervlak blijven staan,
// zodat alle vier de varianten daar even vol tegen een vloertegel aan liggen. Een
// zaad is verder niets bijzonders; de curve doet het werk.
const VARIANTEN = [
  { letter: 'a', zaad: 0x5e1111 },
  { letter: 'b', zaad: 0x5e1115 },
  { letter: 'c', zaad: 0x5e1116 },
  { letter: 'd', zaad: 0x5e111a },
];

const VOL = 0.18;     // tot hier is het nog gewoon bestrating
const SOKKEL = 0.2;   // hoeveel er ver van de hoek nog los blijft liggen
const TAU = 0.24;     // hoe snel het wegvalt, in tegelbreedtes
const ZACHT = 0.62;   // vanaf hier loopt het naar kaal
const RAND = 0.92;    // en hier is het kaal

// Binnen VOL blijft alles liggen. Niet omdat de curve daar veel lager uitkomt —
// ze staat er al bijna op 1 — maar omdat er in dat hoekje maar een handvol keien
// ligt, en één grote die toevallig wegvalt scheelt daar meteen het halve
// oppervlak. Zonder die ondergrens valt de ene variant er dicht uit en de andere
// kaal, terwijl juist die hoek bij elke variant tegen een volle vloertegel aan
// moet kunnen liggen.
const kans = (r) => {
  if (r < VOL) return 1;
  const staart = Math.min(1, Math.max(0, (RAND - r) / (RAND - ZACHT)));
  return (SOKKEL + (1 - SOKKEL) * Math.exp(-r / TAU)) * staart;
};

// Eigen generator, want de tegels moeten bij elke bouw hetzelfde uitvallen.
function toeval(zaad) {
  let s = zaad >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Haalt hoekpunten uit een vlak veld van driehoeken weg zolang ze niet vastzitten
// — vast is alles wat op de rand van de tegel ligt of een kei raakt. Het gat dat
// een weggehaald hoekpunt achterlaat is stervormig rond dat punt, dus opnieuw
// opvullen kan met oorklippen. Meetkundig verandert er niets: het veld ligt plat,
// dus elke andere verdeling in driehoeken dekt precies dezelfde vorm. Er wordt
// nooit een verbinding gelegd die al bestaat — dan zou er een tweede driehoek op
// dezelfde plek komen te liggen.
function vereenvoudigVlak(driehoeken, punt, vast) {
  const zijden = new Map();
  const bijPunt = new Map();
  const levend = driehoeken.map((d) => d.slice());
  const zet = (t) => {
    for (let k = 0; k < 3; k++) {
      const a = levend[t][k], b = levend[t][(k + 1) % 3];
      if (!bijPunt.has(a)) bijPunt.set(a, new Set());
      bijPunt.get(a).add(t);
      zijden.set(`${a},${b}`, t);
    }
  };
  const haalWeg = (t) => {
    for (let k = 0; k < 3; k++) {
      const a = levend[t][k], b = levend[t][(k + 1) % 3];
      bijPunt.get(a)?.delete(t);
      if (zijden.get(`${a},${b}`) === t) zijden.delete(`${a},${b}`);
    }
    levend[t] = null;
  };
  for (let t = 0; t < levend.length; t++) zet(t);

  const opp = (a, b, c) =>
    (punt[b][0] - punt[a][0]) * (punt[c][1] - punt[a][1]) -
    (punt[b][1] - punt[a][1]) * (punt[c][0] - punt[a][0]);

  let veranderd = true;
  while (veranderd) {
    veranderd = false;
    for (const [p, ts] of bijPunt) {
      if (vast.has(p) || ts.size < 3) continue;
      // De ring om het punt: van elke driehoek de zijde tegenover het punt.
      const volgende = new Map();
      let goed = true;
      for (const t of ts) {
        const k = levend[t].indexOf(p);
        const a = levend[t][(k + 1) % 3], b = levend[t][(k + 2) % 3];
        if (volgende.has(a)) { goed = false; break; }
        volgende.set(a, b);
      }
      if (!goed || volgende.size !== ts.size) continue;
      const ring = [];
      let hier = volgende.keys().next().value;
      for (let i = 0; i < volgende.size; i++) { ring.push(hier); hier = volgende.get(hier); }
      if (hier !== ring[0] || new Set(ring).size !== ring.length) continue;

      // Oorklippen op de ring; een oor mag geen bestaande verbinding overdoen.
      const over = ring.slice();
      const nieuw = [];
      let mislukt = false;
      while (over.length > 3) {
        let geknipt = false;
        for (let i = 0; i < over.length; i++) {
          const a = over[(i + over.length - 1) % over.length], b = over[i], c = over[(i + 1) % over.length];
          if (opp(a, b, c) >= 0) continue;
          if (zijden.has(`${c},${a}`) || zijden.has(`${a},${c}`)) continue;
          let binnen = false;
          for (const q of over) {
            if (q === a || q === b || q === c) continue;
            if (opp(a, b, q) < 0 && opp(b, c, q) < 0 && opp(c, a, q) < 0) { binnen = true; break; }
          }
          if (binnen) continue;
          nieuw.push([a, b, c]);
          over.splice(i, 1);
          geknipt = true;
          break;
        }
        if (!geknipt) { mislukt = true; break; }
      }
      if (mislukt) continue;
      if (opp(over[0], over[1], over[2]) >= 0) continue;
      nieuw.push([over[0], over[1], over[2]]);

      for (const t of [...ts]) haalWeg(t);
      for (const d of nieuw) { levend.push(d); zet(levend.length - 1); }
      bijPunt.delete(p);
      veranderd = true;
      break;
    }
  }
  return levend.filter(Boolean);
}

const argumenten = process.argv.slice(2);
let uitmap = KIT;
for (let i = 0; i < argumenten.length; i++) {
  if (argumenten[i] === '--uit') uitmap = resolve(argumenten[++i]);
  else throw new Error(`onbekend argument ${argumenten[i]}`);
}

const glb = readGlb(join(KIT, `${BRON}.glb`));
const prim = glb.json.meshes[0].primitives[0];
const P = readAccessor(glb, prim.attributes.POSITION);
const N = readAccessor(glb, prim.attributes.NORMAL);
const T = readAccessor(glb, prim.attributes.TEXCOORD_0);
const I = readAccessor(glb, prim.indices);

// Losse onderdelen: hoekpunten die via een driehoek aan elkaar hangen. Omdat de
// kit elk kleurvlak zijn eigen uv geeft, zijn de hoekpunten daar al gesplitst en
// valt elke kei vanzelf als eigen onderdeel uit elkaar.
const ouder = Array.from({ length: P.count }, (_, i) => i);
const zoek = (a) => { while (ouder[a] !== a) { ouder[a] = ouder[ouder[a]]; a = ouder[a]; } return a; };
const bind = (a, b) => { a = zoek(a); b = zoek(b); if (a !== b) ouder[a] = b; };
for (let t = 0; t < I.count; t += 3) { bind(I.data[t], I.data[t + 1]); bind(I.data[t + 1], I.data[t + 2]); }

const onderdelen = new Map();
for (let t = 0; t < I.count; t += 3) {
  const r = zoek(I.data[t]);
  if (!onderdelen.has(r)) onderdelen.set(r, []);
  onderdelen.get(r).push(t);
}

// Het zandvlak is het grootste onderdeel dat helemaal op y = 0 ligt; zijn uv is
// de zandkleur waar een platgelegde kei naartoe gaat.
let vlak = null;
const keien = [];
for (const driehoeken of onderdelen.values()) {
  let hoog = -Infinity;
  for (const t of driehoeken) for (let k = 0; k < 3; k++) hoog = Math.max(hoog, P.data[I.data[t + k] * 3 + 1]);
  if (hoog > 1e-4) {
    let sx = 0, sz = 0, n = 0;
    for (const t of driehoeken) for (let k = 0; k < 3; k++) {
      const i = I.data[t + k]; sx += P.data[i * 3]; sz += P.data[i * 3 + 2]; n++;
    }
    keien.push({ driehoeken, mid: [sx / n, sz / n] });
  } else if (!vlak || driehoeken.length > vlak.length) {
    vlak = driehoeken;
  }
}
if (!vlak) throw new Error(`${BRON}: geen zandvlak gevonden`);
const vlakSet = new Set(vlak);
const zandUv = [T.data[I.data[vlak[0]] * 2], T.data[I.data[vlak[0]] * 2 + 1]];

let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
for (let i = 0; i < P.count; i++) {
  x0 = Math.min(x0, P.data[i * 3]); x1 = Math.max(x1, P.data[i * 3]);
  z0 = Math.min(z0, P.data[i * 3 + 2]); z1 = Math.max(z1, P.data[i * 3 + 2]);
}

const afronden = (waarde, decimalen = 5) => Number(waarde.toFixed(decimalen));

for (const { letter, zaad } of VARIANTEN) {
  const naam = `cobblestone-dirt-transition-corner-${letter}`;
  const worp = toeval(zaad);
  const plat = new Set();
  let gehouden = 0;
  for (const kei of keien) {
    const u = (kei.mid[0] - x0) / (x1 - x0);
    const v = (kei.mid[1] - z0) / (z1 - z0);
    if (worp() < kans(Math.hypot(u, v))) { gehouden++; continue; }
    for (const t of kei.driehoeken) plat.add(t);
  }

  // Het vlakke zandveld: het vlak zelf plus alles wat zojuist is platgelegd.
  // De rest — de overgebleven keien en de zijkanten en onderkant van de plaat —
  // gaat ongewijzigd mee.
  const punt = [], puntNr = new Map();
  const nummerVan = (x, z) => {
    const sleutel = `${afronden(x)},${afronden(z)}`;
    let n = puntNr.get(sleutel);
    if (n === undefined) { n = punt.length; puntNr.set(sleutel, n); punt.push([afronden(x), afronden(z)]); }
    return n;
  };
  const vlakVeld = [], rest = [];
  for (let t = 0; t < I.count; t += 3) {
    if (plat.has(t) || vlakSet.has(t)) {
      vlakVeld.push([0, 1, 2].map((k) => nummerVan(P.data[I.data[t + k] * 3], P.data[I.data[t + k] * 3 + 2])));
    } else {
      rest.push(t);
    }
  }

  // Vast staat een hoekpunt op de rand van de tegel en elk hoekpunt dat een
  // overgebleven kei aanraakt: daar loopt de grens van het veld.
  const vast = new Set();
  for (const [x, z] of punt) {
    if (x === afronden(x0) || x === afronden(x1) || z === afronden(z0) || z === afronden(z1)) {
      vast.add(puntNr.get(`${x},${z}`));
    }
  }
  for (const t of rest) for (let k = 0; k < 3; k++) {
    const i = I.data[t + k];
    const sleutel = `${afronden(P.data[i * 3])},${afronden(P.data[i * 3 + 2])}`;
    if (puntNr.has(sleutel)) vast.add(puntNr.get(sleutel));
  }

  const oppVoor = vlakVeld.reduce((som, [a, b, c]) => som + Math.abs(
    (punt[b][0] - punt[a][0]) * (punt[c][1] - punt[a][1]) - (punt[b][1] - punt[a][1]) * (punt[c][0] - punt[a][0])
  ) / 2, 0);
  const vereenvoudigd = vereenvoudigVlak(vlakVeld, punt, vast);
  const oppNa = vereenvoudigd.reduce((som, [a, b, c]) => som + Math.abs(
    (punt[b][0] - punt[a][0]) * (punt[c][1] - punt[a][1]) - (punt[b][1] - punt[a][1]) * (punt[c][0] - punt[a][0])
  ) / 2, 0);
  if (Math.abs(oppVoor - oppNa) > 1e-6) {
    throw new Error(`${naam}: zandveld dekt na vereenvoudigen ${oppNa} in plaats van ${oppVoor}`);
  }

  const posities = [], normalen = [], uvs = [], indices = [];
  const gezien = new Map();
  const voegToe = (hoekpunt) => {
    const sleutel = hoekpunt.join(',');
    let nummer = gezien.get(sleutel);
    if (nummer === undefined) {
      nummer = posities.length / 3;
      gezien.set(sleutel, nummer);
      posities.push(hoekpunt[0], hoekpunt[1], hoekpunt[2]);
      normalen.push(hoekpunt[3], hoekpunt[4], hoekpunt[5]);
      uvs.push(hoekpunt[6], hoekpunt[7]);
    }
    indices.push(nummer);
  };
  for (const driehoek of vereenvoudigd) {
    for (const n of driehoek) voegToe([punt[n][0], 0, punt[n][1], 0, 1, 0, zandUv[0], zandUv[1]]);
  }
  for (const t of rest) {
    for (let k = 0; k < 3; k++) {
      const i = I.data[t + k];
      voegToe([
        afronden(P.data[i * 3]), afronden(P.data[i * 3 + 1]), afronden(P.data[i * 3 + 2]),
        afronden(N.data[i * 3], 4), afronden(N.data[i * 3 + 1], 4), afronden(N.data[i * 3 + 2], 4),
        afronden(T.data[i * 2], 6), afronden(T.data[i * 2 + 1], 6),
      ]);
    }
  }

  const posBuf = Buffer.from(new Float32Array(posities).buffer);
  const normBuf = Buffer.from(new Float32Array(normalen).buffer);
  const uvBuf = Buffer.from(new Float32Array(uvs).buffer);
  const kort = posities.length / 3 <= 65535;
  const indexBuf = Buffer.from((kort ? new Uint16Array(indices) : new Uint32Array(indices)).buffer);
  const vulling = Buffer.alloc((4 - (indexBuf.length % 4)) % 4);
  const bin = Buffer.concat([posBuf, normBuf, uvBuf, indexBuf, vulling]);

  const grens = [0, 1, 2].map((as) => {
    let laag = Infinity, hoog = -Infinity;
    for (let i = as; i < posities.length; i += 3) { laag = Math.min(laag, posities[i]); hoog = Math.max(hoog, posities[i]); }
    return [laag, hoog];
  });

  const json = {
    ...glb.json,
    asset: {
      ...glb.json.asset,
      generator: 'tools/bouw-hoekovergang.mjs',
      extras: { taaleiland: { ...glb.json.asset.extras.taaleiland, bronmodel: BRON } },
    },
    nodes: glb.json.nodes.map((knoop) => ({ ...knoop, name: naam })),
    meshes: [{
      name: naam,
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
        indices: 3,
        material: prim.material,
      }],
    }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBuf.length, target: 34962 },
      { buffer: 0, byteOffset: posBuf.length, byteLength: normBuf.length, target: 34962 },
      { buffer: 0, byteOffset: posBuf.length + normBuf.length, byteLength: uvBuf.length, target: 34962 },
      { buffer: 0, byteOffset: posBuf.length + normBuf.length + uvBuf.length, byteLength: indexBuf.length, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: posities.length / 3, type: 'VEC3', min: grens.map((g) => g[0]), max: grens.map((g) => g[1]) },
      { bufferView: 1, componentType: 5126, count: normalen.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: uvs.length / 2, type: 'VEC2' },
      { bufferView: 3, componentType: kort ? 5123 : 5125, count: indices.length, type: 'SCALAR' },
    ],
  };

  const pad = join(uitmap, `${naam}.glb`);
  writeGlb(pad, json, bin, writeFileSync);
  console.log(
    `${pad}: ${gehouden} van ${keien.length} keien blijven staan, ` +
      `zandveld van ${vlakVeld.length} naar ${vereenvoudigd.length} driehoeken ` +
      `→ ${indices.length / 3} in totaal`,
  );
}
