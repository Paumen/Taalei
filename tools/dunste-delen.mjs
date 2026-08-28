// Meet hoe dun de onderdelen van een model zijn en zet de dunste bovenaan.
//
// Een onderdeel is een samenhangend stuk mesh — hoekpunten eerst gelast op
// wereldpositie, dan driehoek voor driehoek verenigd, net als in afsplitsen.mjs.
// De dikte van zo'n onderdeel is de kleinste breedte van de strakst passende
// doos: voor een richting de afstand tussen de twee steunvlakken, en daarvan de
// kleinste over alle richtingen. Die kleinste breedte valt altijd óf loodrecht
// op een vlak van de omhullende, óf loodrecht op twee van zijn ribben tegelijk,
// dus verder hoeft de meting niet te kijken. Een asgerichte doos zou een schuin
// onderdeel veel te dik meten, en alleen de eigen vlaknormalen zouden een
// gebogen onderdeel overschatten — daar ligt de dunne richting juist tussen de
// vlakken in. Onderdelen met een te fijne omhullende vallen terug op een
// benadering; die staat verderop beschreven.
//
// Vlakke onderdelen (een enkel vlak: bladkaartjes, vlaggen, kleden) hebben geen
// dikte; zij en alles onder --ondergrens vallen af.
//
//   node tools/dunste-delen.mjs [--aantal 20] [--ondergrens 0.001] \
//     [--kit dungeon] [--json pad.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readGlb, readAccessor } from '../catalog/tools/glb.mjs';

const WORTEL = new URL('..', import.meta.url).pathname;
const MODELMAP = join(WORTEL, 'kits/workfiles');

const a = process.argv.slice(2);
let aantal = 20, ondergrens = 0.001, kitfilter = null, jsonpad = null;
for (let i = 0; i < a.length; i++) {
  if (a[i] === '--aantal') aantal = Number(a[++i]);
  else if (a[i] === '--ondergrens') ondergrens = Number(a[++i]);
  else if (a[i] === '--kit') kitfilter = a[++i];
  else if (a[i] === '--json') jsonpad = a[++i];
  else throw new Error(`onbekend argument: ${a[i]}`);
}

const EENHEID = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

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

const maalPunt = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];

// Alle driehoeken van de scene in wereldcoördinaten, met gelaste hoekpunten.
function wereldMesh(glb) {
  const { json } = glb;
  const knopen = json.nodes ?? [];
  const scene = json.scenes?.[json.scene ?? 0];

  const wereld = new Array(knopen.length).fill(null);
  const zetWereld = (index, ouder) => {
    if (wereld[index]) return;
    const knoop = knopen[index];
    if (!knoop) return;
    wereld[index] = maalMatrix(ouder, knoopMatrix(knoop));
    for (const kind of knoop.children ?? []) zetWereld(kind, wereld[index]);
  };
  for (const index of scene?.nodes ?? []) zetWereld(index, EENHEID);

  const punten = [];
  const sleutel = new Map();
  const driehoeken = [];

  const lasPunt = (p) => {
    const k = `${p[0].toFixed(4)},${p[1].toFixed(4)},${p[2].toFixed(4)}`;
    const gevonden = sleutel.get(k);
    if (gevonden !== undefined) return gevonden;
    sleutel.set(k, punten.length);
    punten.push(p);
    return punten.length - 1;
  };

  knopen.forEach((knoop, index) => {
    if (knoop.mesh === undefined || !wereld[index]) return;
    for (const prim of json.meshes[knoop.mesh].primitives ?? []) {
      if ((prim.mode ?? 4) !== 4) continue;
      const positie = readAccessor(glb, prim.attributes.POSITION);
      const eigen = new Array(positie.count);
      for (let v = 0; v < positie.count; v++) {
        eigen[v] = lasPunt(maalPunt(
          wereld[index],
          positie.data[v * 3], positie.data[v * 3 + 1], positie.data[v * 3 + 2],
        ));
      }
      const idx = prim.indices !== undefined ? readAccessor(glb, prim.indices) : null;
      const bij = (i) => eigen[idx ? idx.data[i] : i];
      const einde = idx ? idx.count : positie.count;
      for (let i = 0; i + 2 < einde; i += 3) {
        const t = [bij(i), bij(i + 1), bij(i + 2)];
        if (t[0] === t[1] || t[1] === t[2] || t[0] === t[2]) continue;
        driehoeken.push(t);
      }
    }
  });

  return { punten, driehoeken };
}

// Samenhangende onderdelen: driehoek voor driehoek verenigen over gelaste punten.
function onderdelen({ punten, driehoeken }) {
  const ouder = new Int32Array(punten.length);
  for (let i = 0; i < punten.length; i++) ouder[i] = i;
  const vind = (x) => { while (ouder[x] !== x) { ouder[x] = ouder[ouder[x]]; x = ouder[x]; } return x; };
  const unie = (x, y) => { x = vind(x); y = vind(y); if (x !== y) ouder[y] = x; };
  for (const [a, b, c] of driehoeken) { unie(a, b); unie(b, c); }

  const groepen = new Map();
  for (const t of driehoeken) {
    const w = vind(t[0]);
    let groep = groepen.get(w);
    if (!groep) { groep = { driehoeken: [], punten: new Set() }; groepen.set(w, groep); }
    groep.driehoeken.push(t);
    for (const v of t) groep.punten.add(v);
  }
  return [...groepen.values()];
}

// De omhullende (convexe romp) van een onderdeel. Incrementeel: begin met een
// viervlak en voeg punt voor punt toe, waarbij de zichtbare vlakken wijken voor
// nieuwe vlakken naar dat punt. Coplanaire onderdelen — een enkel vlak, zonder
// dikte — leveren geen romp op en komen als null terug.
function romp(punten) {
  const uit = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const kruis = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const punt = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  let maat = 0;
  for (let c = 0; c < 3; c++) {
    let laag = Infinity, hoog = -Infinity;
    for (const p of punten) { if (p[c] < laag) laag = p[c]; if (p[c] > hoog) hoog = p[c]; }
    maat = Math.max(maat, hoog - laag);
  }
  if (!(maat > 0)) return null;
  const speling = maat * 1e-7;

  let i0 = 0, i1 = 0;
  for (let i = 1; i < punten.length; i++) {
    if (punten[i][0] < punten[i0][0]) i0 = i;
    if (punten[i][0] > punten[i1][0]) i1 = i;
  }
  if (i0 === i1) return null;

  let i2 = -1, verst = speling;
  for (let i = 0; i < punten.length; i++) {
    const d = Math.hypot(...kruis(uit(punten[i], punten[i0]), uit(punten[i1], punten[i0])));
    if (d > verst) { verst = d; i2 = i; }
  }
  if (i2 < 0) return null;

  const vlak = kruis(uit(punten[i1], punten[i0]), uit(punten[i2], punten[i0]));
  const vlakLen = Math.hypot(...vlak);
  let i3 = -1;
  verst = speling;
  for (let i = 0; i < punten.length; i++) {
    const d = Math.abs(punt(vlak, uit(punten[i], punten[i0]))) / vlakLen;
    if (d > verst) { verst = d; i3 = i; }
  }
  if (i3 < 0) return null;

  const midden = [0, 1, 2].map((c) => ([i0, i1, i2, i3].reduce((s, i) => s + punten[i][c], 0)) / 4);
  const maakVlak = (a, b, c) => {
    let n = kruis(uit(punten[b], punten[a]), uit(punten[c], punten[a]));
    if (punt(n, uit(midden, punten[a])) > 0) { [b, c] = [c, b]; n = n.map((v) => -v); }
    return { v: [a, b, c], n };
  };
  let vlakken = [
    maakVlak(i0, i1, i2), maakVlak(i0, i1, i3),
    maakVlak(i0, i2, i3), maakVlak(i1, i2, i3),
  ];

  for (let i = 0; i < punten.length; i++) {
    if (i === i0 || i === i1 || i === i2 || i === i3) continue;
    const zichtbaar = [];
    const rest = [];
    for (const f of vlakken) {
      if (punt(f.n, uit(punten[i], punten[f.v[0]])) > speling * Math.hypot(...f.n)) zichtbaar.push(f);
      else rest.push(f);
    }
    if (zichtbaar.length === 0) continue;

    // Horizon: elke gerichte rand van een zichtbaar vlak waarvan de buur niet meekijkt.
    const randen = new Set();
    for (const f of zichtbaar) {
      for (let k = 0; k < 3; k++) randen.add(`${f.v[k]},${f.v[(k + 1) % 3]}`);
    }
    const nieuw = [];
    for (const rand of randen) {
      const [a, b] = rand.split(',').map(Number);
      if (randen.has(`${b},${a}`)) continue;
      let n = kruis(uit(punten[b], punten[a]), uit(punten[i], punten[a]));
      if (Math.hypot(...n) === 0) continue;
      nieuw.push({ v: [a, b, i], n });
    }
    if (nieuw.length === 0) continue;
    vlakken = rest.concat(nieuw);
  }

  const hoekpunten = new Set();
  const randen = new Map();
  for (const f of vlakken) {
    for (let k = 0; k < 3; k++) {
      hoekpunten.add(f.v[k]);
      const a = f.v[k], b = f.v[(k + 1) % 3];
      randen.set(a < b ? `${a},${b}` : `${b},${a}`, [Math.min(a, b), Math.max(a, b)]);
    }
  }
  return { vlakken, randen: [...randen.values()], hoekpunten: [...hoekpunten] };
}

// Dikte = kleinste breedte van het onderdeel: voor een richting de afstand
// tussen de twee steunvlakken, en daarvan de kleinste over alle richtingen.
// De kleinste breedte van een lichaam valt altijd óf loodrecht op een vlak van
// de omhullende, óf loodrecht op twee van zijn ribben tegelijk — meer
// richtingen hoeven we niet te proberen, en minder mag niet: bij een gebogen of
// onregelmatig onderdeel ligt de dunne richting juist tussen de eigen vlakken
// in, en alleen naar die vlakken kijken overschat de dikte flink.
// Bij een uitzonderlijk fijne omhullende zijn dat te veel ribbenparen; dan valt
// de meting terug op een gelijkmatige spreiding over de halve bol (Fibonacci)
// met een fijnzoektocht vanaf de beste richting. Zulke onderdelen zijn massief
// en staan nooit boven aan de lijst.
const RIBBEGRENS = 400;
const NET = 20000;

const breedte = (lijst, nx, ny, nz) => {
  let laag = Infinity, hoog = -Infinity;
  for (const p of lijst) {
    const d = p[0] * nx + p[1] * ny + p[2] * nz;
    if (d < laag) laag = d;
    if (d > hoog) hoog = d;
  }
  return hoog - laag;
};

const loodrecht = (d) => {
  const hulp = Math.abs(d[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = [
    d[1] * hulp[2] - d[2] * hulp[1],
    d[2] * hulp[0] - d[0] * hulp[2],
    d[0] * hulp[1] - d[1] * hulp[0],
  ];
  const len = Math.hypot(...u);
  const eenheid = u.map((v) => v / len);
  return [eenheid, [
    d[1] * eenheid[2] - d[2] * eenheid[1],
    d[2] * eenheid[0] - d[0] * eenheid[2],
    d[0] * eenheid[1] - d[1] * eenheid[0],
  ]];
};

function dikte(groep, punten) {
  const lijst = [...groep.punten].map((v) => punten[v]);
  const schil = romp(lijst);

  const richtingen = new Map();
  const zet = (x, y, z) => {
    const len = Math.hypot(x, y, z);
    if (!(len > 0)) return;
    let [nx, ny, nz] = [x / len, y / len, z / len];
    if (nx < 0 || (nx === 0 && (ny < 0 || (ny === 0 && nz < 0)))) { nx = -nx; ny = -ny; nz = -nz; }
    const k = `${Math.round(nx * 4096)},${Math.round(ny * 4096)},${Math.round(nz * 4096)}`;
    if (!richtingen.has(k)) richtingen.set(k, [nx, ny, nz]);
  };

  let benaderd = false;
  if (schil && schil.randen.length <= RIBBEGRENS) {
    for (const f of schil.vlakken) zet(f.n[0], f.n[1], f.n[2]);
    const ribben = schil.randen.map(([a, b]) => [0, 1, 2].map((c) => lijst[b][c] - lijst[a][c]));
    for (let i = 0; i < ribben.length; i++) {
      for (let j = i + 1; j < ribben.length; j++) {
        const a = ribben[i], b = ribben[j];
        zet(
          a[1] * b[2] - a[2] * b[1],
          a[2] * b[0] - a[0] * b[2],
          a[0] * b[1] - a[1] * b[0],
        );
      }
    }
  } else {
    benaderd = true;
    zet(1, 0, 0); zet(0, 1, 0); zet(0, 0, 1);
    const gulden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < NET; i++) {
      const y = (i + 0.5) / NET;
      const r = Math.sqrt(1 - y * y);
      const t = gulden * i;
      zet(r * Math.cos(t), r * Math.sin(t), y);
    }
  }

  const meet = schil ? schil.hoekpunten.map((i) => lijst[i]) : lijst;
  let beste = [1, 0, 0], kleinste = Infinity;
  for (const d of richtingen.values()) {
    const b = breedte(meet, d[0], d[1], d[2]);
    if (b < kleinste) { kleinste = b; beste = d; }
  }

  if (benaderd) {
    let stap = 0.02;
    while (stap > 1e-6) {
      const [u, v] = loodrecht(beste);
      let beter = false;
      for (let k = 0; k < 8; k++) {
        const hoek = (k / 8) * 2 * Math.PI;
        const cos = Math.cos(hoek) * stap, sin = Math.sin(hoek) * stap;
        const d = [0, 1, 2].map((c) => beste[c] + cos * u[c] + sin * v[c]);
        const len = Math.hypot(...d);
        const b = breedte(meet, d[0] / len, d[1] / len, d[2] / len);
        if (b < kleinste) { kleinste = b; beste = d.map((x) => x / len); beter = true; }
      }
      if (!beter) stap *= 0.5;
    }
  }

  const doos = [0, 1, 2].map((c) => {
    let laag = Infinity, hoog = -Infinity;
    for (const p of lijst) { if (p[c] < laag) laag = p[c]; if (p[c] > hoog) hoog = p[c]; }
    return hoog - laag;
  });

  return {
    dikte: schil ? kleinste : 0,
    as: beste,
    doos,
    benaderd,
    driehoeken: groep.driehoeken.length,
    punten: lijst.length,
  };
}

const catalogus = JSON.parse(readFileSync(join(WORTEL, 'catalog/catalog.json'), 'utf8'));
const modellen = catalogus.models.filter((m) => !kitfilter || m.kit === kitfilter);

const rijen = [];
let vlakkeDelen = 0, dunneDelen = 0, gemetenDelen = 0, zonderDikOnderdeel = 0, benaderdeDelen = 0;
for (const model of modellen) {
  const glb = readGlb(join(MODELMAP, model.kit, `${model.name}.glb`));
  const mesh = wereldMesh(glb);
  const delen = onderdelen(mesh).map((g) => dikte(g, mesh.punten));
  gemetenDelen += delen.length;
  benaderdeDelen += delen.filter((d) => d.benaderd).length;

  const dik = delen.filter((d) => d.dikte >= ondergrens);
  vlakkeDelen += delen.filter((d) => d.dikte === 0).length;
  dunneDelen += delen.filter((d) => d.dikte > 0 && d.dikte < ondergrens).length;
  if (dik.length === 0) { zonderDikOnderdeel++; continue; }

  const dunste = dik.reduce((a, b) => (b.dikte < a.dikte ? b : a));
  rijen.push({
    kit: model.kit,
    naam: model.name,
    dikte: Math.round(dunste.dikte * 100000) / 100000,
    as: dunste.as.map((v) => Math.round(v * 1000) / 1000),
    deelDoos: dunste.doos.map((v) => Math.round(v * 100000) / 100000),
    deelDriehoeken: dunste.driehoeken,
    benaderd: dunste.benaderd,
    delen: delen.length,
    dikkeDelen: dik.length,
    modelDoos: model.wdh,
  });
}

rijen.sort((a, b) => a.dikte - b.dikte);

const mm = (v) => `${(v * 1000).toFixed(1)} mm`;
console.log(`${modellen.length} modellen, ${gemetenDelen} onderdelen — ${vlakkeDelen} vlak en niet meegeteld`);
if (dunneDelen) console.log(`${dunneDelen} onderdelen zijn wel massief maar dunner dan ${mm(ondergrens)} en tellen ook niet mee`);
if (benaderdeDelen) console.log(`${benaderdeDelen} onderdelen hebben een te fijne omhullende voor de exacte meting en zijn benaderd`);
if (zonderDikOnderdeel) console.log(`${zonderDikOnderdeel} modellen houden geen enkel onderdeel over en staan niet in de lijst`);
console.log('');
console.log('  #     dikte  model                                       dunste deel (mm)   drieh.   delen');
rijen.slice(0, aantal).forEach((r, i) => {
  console.log([
    String(i + 1).padStart(3),
    mm(r.dikte).padStart(9),
    `${r.kit}/${r.naam}`.padEnd(42),
    r.deelDoos.map((v) => (v * 1000).toFixed(0).padStart(4)).join(' ×').padEnd(17),
    String(r.deelDriehoeken).padStart(6),
    String(r.dikkeDelen).padStart(7),
  ].join('  '));
});

if (jsonpad) {
  writeFileSync(jsonpad, JSON.stringify(rijen, null, 1) + '\n');
  console.log(`\n${rijen.length} modellen → ${jsonpad}`);
}
