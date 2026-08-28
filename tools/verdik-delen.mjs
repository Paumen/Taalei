// Verdikt de te dunne onderdelen van een model tot een doeldikte.
//
// Welke onderdelen dat zijn en hoe dik ze nu zijn komt uit
// catalog/tools/dikte.mjs — dezelfde meting als tools/dunste-delen.mjs. Elk
// onderdeel dunner dan --doel wordt opgeblazen tot precies die dikte, op een
// manier die bij zijn vorm past:
//
//   staaf  — een steel, een spijl: minstens tien keer zo lang als dik, en over
//            zijn lengte ongeveer even breed als dik. Dat laatste wordt per
//            ring gemeten, niet over het hele onderdeel: een gebogen steel is
//            als geheel veel breder dan dik, maar elke doorsnede is rond. Een
//            letter in reliëf is juist overal een lint — lang, dun en toch zes
//            keer zo breed als dik — en valt zo af. Die gaat dwars op zijn eigen
//            lengteas open, per ring hoekpunten om het midden van díe ring. Zo
//            blijft de hartlijn liggen waar hij lag — ook als de steel scheef
//            staat of buigt — en blijft de verjonging behouden: elke ring
//            groeit met dezelfde factor, dus de punt bovenaan blijft een punt.
//   plaat  — al het andere: een blad, een schijf, een letter in reliëf. Die
//            groeit alleen in zijn dunne richting, om zijn eigen midden. Een
//            blad wordt dus dikker zonder breder of langer te worden. Dat het
//            naar twee kanten groeit, betekent dat reliëf voor de helft in zijn
//            ondergrond zakt; dat zit verstopt in het model eronder.
//
// Wat een onderdeel verder heeft, blijft: de UV's raken niet aangeroerd, dus de
// kleuren uit de gedeelde kleurkaart blijven staan, en de normalen blijven ook
// staan. Die van de modellen zijn niet het gemiddelde van de aanliggende
// vlakken — herberekenen zou de schaduw veranderen — en het verdikken draait de
// vlakken van een staaf nauwelijks. Bij een plaat kan het meer zijn; hoeveel
// precies staat in de uitvoer.
//
// Vlakke en bijna-vlakke onderdelen (dunner dan --ondergrens) blijven zoals ze
// zijn: die hebben geen dikte om mee te rekenen.
//
//   node tools/verdik-delen.mjs kits/workfiles/natuur/cattail-3.glb \
//     --doel 0.006 [--ondergrens 0.001] [--alleen-staaf] [--proef]
import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../catalog/tools/glb.mjs';
import { wereldMesh, onderdelen, dikte } from '../catalog/tools/dikte.mjs';

const a = process.argv.slice(2);
const paden = [];
let doel = null, proef = false, alleenStaaf = false, ondergrens = 0.001;
for (let i = 0; i < a.length; i++) {
  if (a[i] === '--doel') doel = Number(a[++i]);
  else if (a[i] === '--ondergrens') ondergrens = Number(a[++i]);
  else if (a[i] === '--proef') proef = true;
  else if (a[i] === '--alleen-staaf') alleenStaaf = true;
  else paden.push(a[i]);
}
if (!paden.length || !doel) throw new Error('gebruik: <glb...> --doel 0.006 [--ondergrens 0.001] [--alleen-staaf] [--proef]');

// Een onderdeel dat al op de doeldikte staat, blijft eraf; anders zou een
// tweede run alles opnieuw met factor 1,000 langsgaan.
const SPELING = 1e-5;
const LENGTE_PER_DIKTE = 10;
const BREEDTE_PER_DIKTE = 2.5;

const punt = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const IDENTITEIT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function maalMatrix(a, b) {
  const r = new Array(16).fill(0);
  for (let kolom = 0; kolom < 4; kolom++) {
    for (let rij = 0; rij < 4; rij++) {
      let som = 0;
      for (let k = 0; k < 4; k++) som += a[k * 4 + rij] * b[kolom * 4 + k];
      r[kolom * 4 + rij] = som;
    }
  }
  return r;
}

function knoopMatrix(knoop) {
  if (knoop.matrix) return knoop.matrix;
  const [tx, ty, tz] = knoop.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = knoop.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = knoop.scale ?? [1, 1, 1];
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
  const xx = qx * x2, xy = qx * y2, xz = qx * z2;
  const yy = qy * y2, yz = qy * z2, zz = qz * z2;
  const wx = qw * x2, wy = qw * y2, wz = qw * z2;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

const maalPunt = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];

// Inverse van een knoopmatrix: die is een draaiing met een gelijkmatige schaal
// en een verschuiving, meer heeft een model niet nodig.
function inverse(m) {
  const kolom = (c) => [m[c * 4], m[c * 4 + 1], m[c * 4 + 2]];
  const schaal = [0, 1, 2].map((c) => Math.hypot(...kolom(c)));
  if (Math.max(...schaal) - Math.min(...schaal) > 1e-6 * Math.max(...schaal)) {
    throw new Error(`knoop schaalt niet gelijkmatig (${schaal.map((s) => s.toFixed(4)).join(', ')})`);
  }
  const s = schaal[0];
  const r = [0, 1, 2].map((c) => kolom(c).map((v) => v / s));
  const t = [m[12], m[13], m[14]];
  const inv = new Array(16).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) inv[j * 4 + i] = r[i][j] / s;
  const rt = [0, 1, 2].map((i) => (r[i][0] * t[0] + r[i][1] * t[1] + r[i][2] * t[2]) / s);
  inv[12] = -rt[0]; inv[13] = -rt[1]; inv[14] = -rt[2];
  inv[15] = 1;

  // Heen en terug moet weer op hetzelfde punt uitkomen. Een knoop met een
  // draaiing erin is makkelijk verkeerd om te keren, en dan schiet het model bij
  // het terugschrijven de ruimte in; liever hier stuklopen dan daar.
  const proef = [0.013, 0.027, 0.041];
  const heen = maalPunt(m, proef);
  const terug = maalPunt(inv, heen);
  const fout = Math.hypot(...[0, 1, 2].map((c) => terug[c] - proef[c]));
  if (!(fout < 1e-9)) throw new Error(`inverse van de knoopmatrix klopt niet (fout ${fout.toExponential(2)})`);

  return inv;
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

// Hoekpunten op (vrijwel) dezelfde hoogte langs de as horen bij dezelfde ring.
function maakRingen(leden, plaats, as) {
  const langs = leden.map((v) => punt(plaats(v), as));
  const speling = (Math.max(...langs) - Math.min(...langs)) * 0.02;
  const ringen = [];
  leden.forEach((v, i) => {
    const ring = ringen.find((r) => Math.abs(r.hoogte - langs[i]) <= speling);
    if (ring) { ring.leden.push(v); ring.hoogte = (ring.hoogte * (ring.leden.length - 1) + langs[i]) / ring.leden.length; }
    else ringen.push({ hoogte: langs[i], leden: [v] });
  });
  for (const ring of ringen) {
    ring.midden = [0, 1, 2].map((c) => ring.leden.reduce((s, v) => s + plaats(v)[c], 0) / ring.leden.length);
  }
  return ringen;
}

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
  return { lang, lengte: breedte(lang), breed: breedte(derde) };
}

for (const pad of paden) {
  const glb = readGlb(pad);
  const knopen = glb.json.nodes ?? [];
  const scene = glb.json.scenes?.[glb.json.scene ?? 0];

  const wereld = new Array(knopen.length).fill(null);
  const zet = (index, ouder) => {
    if (wereld[index] || !knopen[index]) return;
    wereld[index] = maalMatrix(ouder, knoopMatrix(knopen[index]));
    for (const kind of knopen[index].children ?? []) zet(kind, wereld[index]);
  };
  for (const index of scene?.nodes ?? []) zet(index, IDENTITEIT);

  // Elk hoekpunt van elke primitive, met de matrix die het naar de wereld
  // brengt en terug. Onderdelen lopen dwars door knopen heen, dus alles moet in
  // dezelfde ruimte staan voordat we ze kunnen lassen.
  const punten = [];
  const sleutel = new Map();
  const driehoeken = [];
  const hoekpunten = [];        // { accessor, v, heen, terug, gelast }
  const accessors = new Map();  // accessorindex → gelezen posities

  knopen.forEach((knoop, index) => {
    if (knoop.mesh === undefined || !wereld[index]) return;
    const heen = wereld[index];
    const terug = inverse(heen);
    for (const prim of glb.json.meshes[knoop.mesh].primitives ?? []) {
      if ((prim.mode ?? 4) !== 4) continue;
      const acc = prim.attributes.POSITION;
      if (!accessors.has(acc)) accessors.set(acc, readAccessor(glb, acc));
      const pos = accessors.get(acc);
      const eigen = new Array(pos.count);
      for (let v = 0; v < pos.count; v++) {
        const p = maalPunt(heen, [pos.data[v * 3], pos.data[v * 3 + 1], pos.data[v * 3 + 2]]);
        const k = p.map((w) => w.toFixed(4)).join(',');
        let g = sleutel.get(k);
        if (g === undefined) { g = punten.length; sleutel.set(k, g); punten.push(p); }
        eigen[v] = g;
        hoekpunten.push({ accessor: acc, v, heen, terug, gelast: g });
      }
      const idx = prim.indices !== undefined ? readAccessor(glb, prim.indices) : null;
      const bij = (i) => eigen[idx ? idx.data[i] : i];
      const einde = idx ? idx.count : pos.count;
      for (let i = 0; i + 2 < einde; i += 3) {
        const d = [bij(i), bij(i + 1), bij(i + 2)];
        if (d[0] !== d[1] && d[1] !== d[2] && d[0] !== d[2]) driehoeken.push(d);
      }
    }
  });

  const oorspronkelijk = punten.map((p) => p.slice());
  const delen = onderdelen({ punten, driehoeken }).map((g) => ({ groep: g, ...dikte(g, punten) }));
  // Onder de ondergrens ligt geen echt onderdeel meer maar een vierhoek waarvan
  // de punten net niet in één vlak liggen; die heeft geen dikte om mee te
  // rekenen en blijft eraf, net als in tools/dunste-delen.mjs.
  const teDun = delen.filter((d) => d.dikte >= ondergrens && d.dikte < doel - SPELING);
  if (teDun.length === 0) {
    console.log(`${pad}: niets dunner dan ${(doel * 1000).toFixed(1)} mm`);
    continue;
  }
  const geraakt = () => verslag.staaf + verslag.plaat;

  const verslag = { staaf: 0, plaat: 0, overgeslagen: 0, dunste: Infinity, dikste: 0, draai: 0, tekort: [], klein: [] };
  for (const deel of teDun) {
    const leden = [...deel.groep.punten];
    const plaats = (v) => oorspronkelijk[v];
    const maat = vorm(leden.map(plaats), deel.as, lengteAs(leden.map(plaats)));
    const ringen = maakRingen(leden, plaats, maat.lang);
    // Doorsnede per ring: breed ten opzichte van dik. Een ronde steel zit rond
    // de 1, een lint van reliëf een stuk hoger.
    const derde = [
      deel.as[1] * maat.lang[2] - deel.as[2] * maat.lang[1],
      deel.as[2] * maat.lang[0] - deel.as[0] * maat.lang[2],
      deel.as[0] * maat.lang[1] - deel.as[1] * maat.lang[0],
    ];
    const verhoudingen = ringen.map((ring) => {
      const spreiding = (richting) => {
        let laag = Infinity, hoog = -Infinity;
        for (const v of ring.leden) { const w = punt(plaats(v), richting); if (w < laag) laag = w; if (w > hoog) hoog = w; }
        return hoog - laag;
      };
      const dik = spreiding(deel.as);
      return dik > 0 ? spreiding(derde) / dik : 0;
    }).filter((v) => v > 0).sort((a, b) => a - b);
    // Driekwart van de ringen moet rond zijn, niet de helft: bij een schijf of
    // een schaarblad is de helft van de ringen een smalle rand, en op de mediaan
    // zou zo'n onderdeel alsnog voor staaf doorgaan.
    const doorsnede = verhoudingen.length
      ? verhoudingen[Math.min(verhoudingen.length - 1, Math.floor(verhoudingen.length * 0.75))]
      : Infinity;
    const staaf = maat.lengte >= deel.dikte * LENGTE_PER_DIKTE && doorsnede <= BREEDTE_PER_DIKTE;
    if (!staaf && alleenStaaf) { verslag.overgeslagen++; continue; }

    // Een plaat kan alleen zo dik worden als zijn op één na kleinste maat
    // toelaat: rekt de dunne richting tot het doel, dan is die andere maat de
    // nieuwe dikte. Zulke onderdelen zijn niet dun maar klein, en in één
    // richting dikker maken lost niets op — die blijven eraf, met vermelding.
    // Een staaf heeft dat bezwaar niet: die gaat in beide dwarsrichtingen open.
    const dwarsmaat = (richting) => {
      let laag = Infinity, hoog = -Infinity;
      for (const v of leden) { const w = punt(plaats(v), richting); if (w < laag) laag = w; if (w > hoog) hoog = w; }
      return hoog - laag;
    };
    const tweede = Math.min(maat.lengte, dwarsmaat(derde));
    if (!staaf && tweede < doel - 5e-5) {
      verslag.klein.push(`${(deel.dikte * 1000).toFixed(2)} mm dik, ${(tweede * 1000).toFixed(2)} mm breed`);
      continue;
    }

    const as = maat.lang;
    const zetFactor = staaf
      ? (() => {
        return (factor) => {
          for (const ring of ringen) {
            for (const v of ring.leden) {
              const d = [0, 1, 2].map((c) => oorspronkelijk[v][c] - ring.midden[c]);
              const langsAs = punt(d, as);
              punten[v] = [0, 1, 2].map((c) => ring.midden[c] + langsAs * as[c] + (d[c] - langsAs * as[c]) * factor);
            }
          }
        };
      })()
      : (() => {
        const midden = [0, 1, 2].map((c) => leden.reduce((s, v) => s + oorspronkelijk[v][c], 0) / leden.length);
        const dun = deel.as;
        return (factor) => {
          for (const v of leden) {
            const d = [0, 1, 2].map((c) => oorspronkelijk[v][c] - midden[c]);
            const langsDun = punt(d, dun);
            punten[v] = [0, 1, 2].map((c) => midden[c] + d[c] + langsDun * (factor - 1) * dun[c]);
          }
        };
      })();

    // De factor stelt zich bij tot de meting klopt: de kleinste breedte van een
    // onderdeel groeit niet één op één mee met wat we rekken. Bij een staaf telt
    // de scheefstand mee die niet meegroeit, bij een wigvormige plaat ligt de
    // dunste richting schuin op wat we oprekken. Er zit een rem op, want als het
    // doel buiten bereik ligt zou het onderdeel zich blijven opblazen.
    let factor = staaf ? doel / deel.dikte : doel / dwarsmaat(deel.as);
    const rem = factor * 4;
    let gemeten = deel.dikte;
    for (let ronde = 0; ronde < 40; ronde++) {
      zetFactor(factor);
      const vorige = gemeten;
      gemeten = dikte(deel.groep, punten).dikte;
      if (Math.abs(gemeten - doel) < 5e-6) break;
      if (ronde > 0 && gemeten <= vorige + 1e-7) break;   // loopt niet meer vooruit
      const volgende = factor * (doel / gemeten);
      if (volgende > rem) break;
      factor = volgende;
    }
    if (gemeten < doel - 5e-5) {
      verslag.tekort.push(`${(deel.dikte * 1000).toFixed(2)} → ${(gemeten * 1000).toFixed(2)} mm`);
    }
    if (staaf) verslag.staaf++; else verslag.plaat++;
    verslag.dunste = Math.min(verslag.dunste, deel.dikte);
    verslag.dikste = Math.max(verslag.dikste, deel.dikte);

    for (const [ia, ib, ic] of deel.groep.driehoeken) {
      const normaal = (bron) => {
        const p = [ia, ib, ic].map((v) => bron[v]);
        const u = [0, 1, 2].map((c) => p[1][c] - p[0][c]);
        const w = [0, 1, 2].map((c) => p[2][c] - p[0][c]);
        const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
        const len = Math.hypot(...n);
        return len > 0 ? n.map((x) => x / len) : null;
      };
      const voor = normaal(oorspronkelijk), na = normaal(punten);
      if (!voor || !na) continue;
      verslag.draai = Math.max(verslag.draai, Math.acos(Math.min(1, Math.max(-1, punt(voor, na)))) * (180 / Math.PI));
    }
  }

  const samenvatting = (geraakt() === 0 ? 'niets verdikt' : `${verslag.staaf} staaf + ${verslag.plaat} plaat`
    + (verslag.overgeslagen ? ` (${verslag.overgeslagen} niet-staaf overgeslagen)` : '')
    + `, ${(verslag.dunste * 1000).toFixed(2)}–${(verslag.dikste * 1000).toFixed(2)} → ${(doel * 1000).toFixed(2)} mm`)
    + (verslag.klein.length ? `; ${verslag.klein.length} overgeslagen, te klein om te verdikken (${verslag.klein.join('; ')})` : '')
    + (verslag.tekort.length ? `; ${verslag.tekort.length} haalde het doel niet (${verslag.tekort.join(', ')}): een tweede maat van het onderdeel ligt zelf onder het doel` : '');
  if (proef || geraakt() === 0) { console.log(`${pad}: ${samenvatting}${proef ? '  [proef]' : ''}`); continue; }

  // Een onderdeel dat het doel niet haalt, mag niet stiekem zijn opgeblazen:
  // controleer de omvang van het model voor het iets wegschrijft.
  const omvang = (lijst) => [0, 1, 2].map((c) => {
    let laag = Infinity, hoog = -Infinity;
    for (const p of lijst) { if (p[c] < laag) laag = p[c]; if (p[c] > hoog) hoog = p[c]; }
    return hoog - laag;
  });
  const voor = omvang(oorspronkelijk), naDoos = omvang(punten);
  for (let c = 0; c < 3; c++) {
    if (naDoos[c] > voor[c] * 1.5 + 0.01) {
      throw new Error(`${pad}: het model werd te veel groter (${(voor[c] * 1000).toFixed(0)} → ${(naDoos[c] * 1000).toFixed(0)} mm); niets weggeschreven`);
    }
  }

  // Terug naar modelruimte, per hoekpunt met de matrix van zijn eigen knoop.
  for (const h of hoekpunten) {
    const p = maalPunt(h.terug, punten[h.gelast]);
    const pos = accessors.get(h.accessor);
    for (let c = 0; c < 3; c++) pos.data[h.v * 3 + c] = p[c];
  }
  for (const [index, pos] of accessors) {
    const acc = glb.json.accessors[index];
    const bv = glb.json.bufferViews[acc.bufferView];
    if (acc.componentType !== 5126 || bv.byteStride !== undefined) {
      throw new Error(`${pad}: POSITION staat niet als losse float32 in de buffer`);
    }
    const uit = new Float32Array(glb.bin.buffer, glb.bin.byteOffset + (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0), acc.count * 3);
    for (let i = 0; i < acc.count * 3; i++) uit[i] = pos.data[i];
    const langs = (c) => Array.from({ length: acc.count }, (_, i) => uit[i * 3 + c]);
    if (acc.min) acc.min = [0, 1, 2].map((c) => Math.min(...langs(c)));
    if (acc.max) acc.max = [0, 1, 2].map((c) => Math.max(...langs(c)));
  }
  writeGlb(pad, glb.json, glb.bin, writeFileSync);

  // Nameten op het weggeschreven bestand.
  const na = readGlb(pad);
  const naMesh = wereldMesh(na);
  const dunste = onderdelen(naMesh)
    .map((g) => dikte(g, naMesh.punten))
    .filter((d) => d.dikte > 0)
    .reduce((x, y) => (y.dikte < x.dikte ? y : x));
  console.log(`${pad}: ${samenvatting}; dunste onderdeel nu ${(dunste.dikte * 1000).toFixed(2)} mm, vlakken tot ${verslag.draai.toFixed(2)}° gedraaid`);
}
