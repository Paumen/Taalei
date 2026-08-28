// Verdikt de te dunne onderdelen van een model tot een doeldikte.
//
// Welke onderdelen dat zijn en hoe dik ze nu zijn komt uit
// catalog/tools/dikte.mjs — dezelfde meting als tools/dunste-delen.mjs. Een
// onderdeel dunner dan --doel wordt dwars op zijn eigen lengteas opgeblazen,
// precies genoeg om die dikte te halen.
//
// Het opblazen gaat per ring hoekpunten, om het midden van díe ring. Zo blijft
// de hartlijn liggen waar hij lag — ook als de steel scheef staat of buigt —
// en blijft de verjonging behouden: elke ring groeit met dezelfde factor, dus
// de punt bovenaan blijft een punt. Een vaste dikte over de hele lengte zou
// van een steel een staaf met een afgeknotte top maken.
//
// Alleen staafvormige onderdelen komen in aanmerking: lang ten opzichte van
// hun dikte, en niet breed uitgelopen. Een blad of een schijf is óók dun, maar
// dwars opblazen maakt zo'n onderdeel net zo veel breder als dikker, en dat is
// een andere ingreep dan het verdikken van een steel. Wat afvalt komt in de
// uitvoer te staan.
//
// De hoogte van een hoekpunt langs de as verandert niet, alleen zijn afstand
// tot de hartlijn. De UV's blijven onaangeroerd, dus de kleuren uit de gedeelde
// kleurkaart blijven staan. De normalen blijven ook staan: die van het model
// zijn niet het gemiddelde van de aanliggende vlakken — herberekenen zou de
// schaduw van het model veranderen — en het verdikken draait de vlakken zelf
// nauwelijks. Hoeveel precies staat in de uitvoer; boven een halve graad is
// het een waarschuwing waard.
//
//   node tools/verdik-steel.mjs kits/workfiles/natuur/cattail-3.glb \
//     --doel 0.006 [--proef]
import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../catalog/tools/glb.mjs';
import { wereldMesh, onderdelen, dikte } from '../catalog/tools/dikte.mjs';

const a = process.argv.slice(2);
const paden = [];
let doel = null, proef = false;
for (let i = 0; i < a.length; i++) {
  if (a[i] === '--doel') doel = Number(a[++i]);
  else if (a[i] === '--proef') proef = true;
  else paden.push(a[i]);
}
if (!paden.length || !doel) throw new Error('gebruik: <glb...> --doel 0.006 [--proef]');

const punt = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Staaf: minstens tien keer zo lang als dik, en niet breder dan een derde van
// zijn lengte. Een steel haalt dat ruim (een lisdoddesteel is zestig keer zo
// lang als dik); een blad is maar drie tot acht keer zo lang als dik, en een
// bloemschijf is even breed als lang.
const LENGTE_PER_DIKTE = 10;
const BREEDTE_PER_LENGTE = 1 / 3;

function vorm(punten, dun, as) {
  const recht = as.map((x, i) => x - punt(as, dun) * dun[i]);
  const len = Math.hypot(...recht);
  const lang = len > 0 ? recht.map((x) => x / len) : as;
  const derde = [
    dun[1] * lang[2] - dun[2] * lang[1],
    dun[2] * lang[0] - dun[0] * lang[2],
    dun[0] * lang[1] - dun[1] * lang[0],
  ];
  const breedte = (richting) => {
    let laag = Infinity, hoog = -Infinity;
    for (const p of punten) { const v = punt(p, richting); if (v < laag) laag = v; if (v > hoog) hoog = v; }
    return hoog - laag;
  };
  return { lengte: breedte(lang), breed: breedte(derde) };
}

// Lengteas van een onderdeel: de richting waarin het het meest uitgestrekt is,
// gevonden door de spreidingsmatrix een paar keer op zichzelf toe te passen.
function lengteAs(punten) {
  const midden = [0, 1, 2].map((c) => punten.reduce((s, p) => s + p[c], 0) / punten.length);
  const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of punten) {
    const d = [0, 1, 2].map((c) => p[c] - midden[c]);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i][j] += d[i] * d[j];
  }
  let v = [0, 1, 0];
  for (let k = 0; k < 64; k++) {
    const w = [0, 1, 2].map((i) => punt(m[i], v));
    const len = Math.hypot(...w);
    if (!(len > 0)) return [0, 1, 0];
    v = w.map((x) => x / len);
  }
  return v;
}

for (const pad of paden) {
  const glb = readGlb(pad);
  const knopen = glb.json.nodes ?? [];
  if (glb.json.meshes.length !== 1 || glb.json.meshes[0].primitives.length !== 1) {
    throw new Error(`${pad}: verwacht één mesh met één primitive`);
  }
  const knoop = knopen.find((k) => k.mesh === 0);
  const schaal = knoop?.scale ?? [1, 1, 1];
  if (new Set(schaal.map((s) => s.toFixed(6))).size !== 1) {
    throw new Error(`${pad}: knoop schaalt niet gelijkmatig (${schaal.join(', ')})`);
  }
  const s = schaal[0];

  const prim = glb.json.meshes[0].primitives[0];
  const pos = readAccessor(glb, prim.attributes.POSITION);
  const idx = readAccessor(glb, prim.indices);

  // Onderdelen in modelruimte, zodat de hoekpunten direct aanwijsbaar blijven.
  const mesh = { punten: [], driehoeken: [] };
  const sleutel = new Map();
  const naarGelast = new Int32Array(pos.count);
  for (let v = 0; v < pos.count; v++) {
    const p = [0, 1, 2].map((c) => pos.data[v * 3 + c] * s);
    const k = p.map((w) => w.toFixed(4)).join(',');
    let g = sleutel.get(k);
    if (g === undefined) { g = mesh.punten.length; sleutel.set(k, g); mesh.punten.push(p); }
    naarGelast[v] = g;
  }
  for (let t = 0; t + 2 < idx.count; t += 3) {
    const d = [0, 1, 2].map((k) => naarGelast[idx.data[t + k]]);
    if (d[0] !== d[1] && d[1] !== d[2] && d[0] !== d[2]) mesh.driehoeken.push(d);
  }

  const delen = onderdelen(mesh);
  const gemeten = delen.map((g) => ({ groep: g, ...dikte(g, mesh.punten) }));
  const dun = gemeten.filter((d) => d.dikte > 0 && d.dikte < doel);
  const teDun = [];
  const geenStaaf = [];
  for (const deel of dun) {
    const punten = [...deel.groep.punten].map((v) => mesh.punten[v]);
    const maat = vorm(punten, deel.as, lengteAs(punten));
    const staaf = maat.lengte >= deel.dikte * LENGTE_PER_DIKTE && maat.breed <= maat.lengte * BREEDTE_PER_LENGTE;
    (staaf ? teDun : geenStaaf).push({ ...deel, maat });
  }
  if (geenStaaf.length) {
    console.log(`${pad}: ${geenStaaf.length === 1 ? 'één dun onderdeel' : `${geenStaaf.length} dunne onderdelen`} overgeslagen, geen staaf — ${geenStaaf.map((d) => `${(d.dikte * 1000).toFixed(2)} mm, ${(d.maat.lengte * 1000).toFixed(0)} lang × ${(d.maat.breed * 1000).toFixed(0)} breed`).join('; ')}`);
  }
  if (teDun.length === 0) {
    console.log(`${pad}: geen staafvormig onderdeel dunner dan ${(doel * 1000).toFixed(1)} mm`);
    continue;
  }

  const verslag = [];
  const oorspronkelijk = Float64Array.from(pos.data);
  let grootsteDraai = 0;

  for (const deel of teDun) {
    // Alle hoekpunten van dit onderdeel, ook de dubbelen op dezelfde plek.
    const gelast = deel.groep.punten;
    const eigen = [];
    for (let v = 0; v < pos.count; v++) if (gelast.has(naarGelast[v])) eigen.push(v);
    const plaats = (v) => [0, 1, 2].map((c) => oorspronkelijk[v * 3 + c]);
    const as = lengteAs(eigen.map(plaats));

    // Ringen: hoekpunten op (vrijwel) dezelfde hoogte langs de as horen bijeen.
    const langs = eigen.map((v) => punt(plaats(v), as));
    const lengte = Math.max(...langs) - Math.min(...langs);
    const speling = lengte * 0.02;
    const ringen = [];
    eigen.forEach((v, i) => {
      const ring = ringen.find((r) => Math.abs(r.hoogte - langs[i]) <= speling);
      if (ring) { ring.leden.push(v); ring.hoogte = (ring.hoogte * (ring.leden.length - 1) + langs[i]) / ring.leden.length; }
      else ringen.push({ hoogte: langs[i], leden: [v] });
    });
    for (const ring of ringen) {
      ring.midden = [0, 1, 2].map((c) => ring.leden.reduce((sm, v) => sm + oorspronkelijk[v * 3 + c], 0) / ring.leden.length);
    }

    const zetFactor = (factor) => {
      for (const ring of ringen) {
        for (const v of ring.leden) {
          const d = [0, 1, 2].map((c) => oorspronkelijk[v * 3 + c] - ring.midden[c]);
          const langsAs = punt(d, as);
          for (let c = 0; c < 3; c++) {
            const dwars = d[c] - langsAs * as[c];
            pos.data[v * 3 + c] = ring.midden[c] + langsAs * as[c] + dwars * factor;
          }
        }
      }
    };
    const meet = () => {
      const punten = mesh.punten.map((p) => p.slice());
      for (let v = 0; v < pos.count; v++) {
        const g = naarGelast[v];
        for (let c = 0; c < 3; c++) punten[g][c] = pos.data[v * 3 + c] * s;
      }
      return dikte(deel.groep, punten).dikte;
    };

    // Het verdikken raakt alleen de afstand tot de hartlijn; de scheefstand van
    // een steel telt óók mee in zijn gemeten dikte en groeit niet mee. Eén
    // factor haalt het doel dus niet — daarom bijstellen tot het klopt.
    let factor = doel / deel.dikte;
    let gemeten = deel.dikte;
    for (let ronde = 0; ronde < 40; ronde++) {
      zetFactor(factor);
      gemeten = meet();
      if (Math.abs(gemeten - doel) < 5e-6) break;
      factor *= doel / gemeten;
    }

    // Hoeveel draaien de vlakken van dit onderdeel door het verdikken?
    const vlakNormaal = (bron, v) => {
      const p = v.map((w) => [0, 1, 2].map((c) => bron[w * 3 + c]));
      const u = [0, 1, 2].map((c) => p[1][c] - p[0][c]);
      const w = [0, 1, 2].map((c) => p[2][c] - p[0][c]);
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const len = Math.hypot(...n);
      return len > 0 ? n.map((x) => x / len) : null;
    };
    for (let t = 0; t + 2 < idx.count; t += 3) {
      const v = [0, 1, 2].map((k) => idx.data[t + k]);
      if (!gelast.has(naarGelast[v[0]])) continue;
      const voor = vlakNormaal(oorspronkelijk, v);
      const na = vlakNormaal(pos.data, v);
      if (!voor || !na) continue;
      const hoek = Math.acos(Math.min(1, Math.max(-1, punt(voor, na)))) * (180 / Math.PI);
      if (hoek > grootsteDraai) grootsteDraai = hoek;
    }

    verslag.push(`${(deel.dikte * 1000).toFixed(2)} → ${(gemeten * 1000).toFixed(2)} mm (×${factor.toFixed(3)}, ${ringen.length} ringen, ${eigen.length} hoekpunten)`);
  }

  if (proef) {
    pos.data.set(oorspronkelijk);
    console.log(`${pad}: ${verslag.join('; ')}  [proef]`);
    continue;
  }

  const schrijf = (attribuut, bron, breedte) => {
    const acc = glb.json.accessors[prim.attributes[attribuut]];
    const bv = glb.json.bufferViews[acc.bufferView];
    if (acc.componentType !== 5126 || bv.byteStride !== undefined) {
      throw new Error(`${pad}: ${attribuut} staat niet als losse float32 in de buffer`);
    }
    const uit = new Float32Array(glb.bin.buffer, glb.bin.byteOffset + (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0), acc.count * breedte);
    for (let i = 0; i < acc.count * breedte; i++) uit[i] = bron.data[i];
    const langs = (c) => Array.from({ length: acc.count }, (_, i) => uit[i * breedte + c]);
    if (acc.min) acc.min = Array.from({ length: breedte }, (_, c) => Math.min(...langs(c)));
    if (acc.max) acc.max = Array.from({ length: breedte }, (_, c) => Math.max(...langs(c)));
  };
  schrijf('POSITION', pos, 3);
  writeGlb(pad, glb.json, glb.bin, writeFileSync);

  // Nameten op het weggeschreven bestand: de meting hoort nu precies te kloppen.
  const na = readGlb(pad);
  const naMesh = wereldMesh(na);
  const dunste = onderdelen(naMesh)
    .map((g) => dikte(g, naMesh.punten))
    .filter((d) => d.dikte > 0)
    .reduce((x, y) => (y.dikte < x.dikte ? y : x));
  console.log(`${pad}: ${verslag.join('; ')}; dunste onderdeel nu ${(dunste.dikte * 1000).toFixed(2)} mm, vlakken tot ${grootsteDraai.toFixed(2)}° gedraaid`);
}
