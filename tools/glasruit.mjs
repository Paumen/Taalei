// Zet doorzichtige ruiten vóór het lichaam dat op één colormap-cel staat: per zijde één
// ruit, zo groot als dat lichaam er vandaan gezien is, een stukje naar buiten geschoven
// en op het glasmateriaal gezet. Het lichaam zelf blijft staan.
//
//   node tools/glasruit.mjs --cel 6,0 --marge 0.04 --ruiten 4 halloween/lantern-hanging.glb
//   node tools/glasruit.mjs --cel 6,0 --marge 0.01 --staand village-kit/lamp-street.glb
//
// Waarvoor: een lantaarn heeft hier vaak wel een geel lichtlichaam binnenin, maar geen
// glas — de zijkanten van het huis staan open. Regel M17 van bijlage A vraagt om glas
// dat doorzichtig is; een ruit vóór het licht geeft dat zonder de gloed weg te nemen.
// Wie het gele licht zelf doorzichtig zou maken, haalt de lamp uit de lamp.
//
// Een ruit is de omtrek van het lichaam gezien langs de normaal van die zijde: alle
// hoekpunten van de cel plat geslagen op dat vlak, met de omhullende veelhoek eromheen.
// Dat is precies de opening die je van buiten ziet — een kopie van het zijvlak alleen zou
// de afgeschuinde hoeken en de schuine boven- en onderkant onbedekt laten, en dan staat er
// een rand licht tussen het glas en het metaal.
//
// --marge is hoever de ruit naar buiten staat, in meters. De lantaarns hier hebben hun
// lichtlichaam tegen de binnenkant van de stijlen; een ruit hoort halverwege de stijl te
// hangen, niet tegen het licht aan. Meet de stijl (van binnenvlak tot buitenvlak) en kijk
// het na op een render.
//
// --staand laat alleen de opstaande vlakken meedoen: driehoeken waarvan de vlaknormaal
// meer dan --vlak (standaard 0.5) van de y-as af staat. Het dak en de bodem van een
// lantaarn zitten dicht, en een ruit daar zou alleen maar in het metaal steken.
//
// --kozijn maakt de ruit even groot als de opening zelf in plaats van als het lichaam: hij
// spant van rand tot rand, waar de cel aan de rest van het model vastzit. Op deze lantaarns
// ligt het gele lichaam terug tussen een bovenrand en een onderrand — de ruit hoort in dat
// vlak te staan, zoals glas in een sponning, en niet tegen het terugliggende licht aan.
// De randpunten zijn hoekpunten die zowel aan de cel als aan de rest van het model zitten;
// elk hoort bij de zijde waar het het meest naar toe wijst, en die vier punten spannen het
// vlak van de ruit. Niets geraden: het model zegt zelf waar zijn opening zit.
//
// --overlap d legt de rand van een ruit d meter verder naar buiten, zodat hij achter het
// metaal van het frame eindigt en er geen streepje licht of glas langs de stijl te zien is.
// Blijf onder de dikte van de stijl, anders steekt het glas erdoorheen.
//
// --ruiten N houdt de N grootste vlakken over. Een lichtlichaam heeft naast zijn vier
// zijden ook afgeschuinde hoeken — smalle strookjes die achter de stijlen van het frame
// zitten en geen eigen ruit horen te krijgen. Vlakken zijn hier driehoeken die in hetzelfde
// platte vlak liggen (zelfde normaal, zelfde afstand tot de oorsprong), en de maat is
// hun oppervlak: de vier zijden van een lantaarn zijn een veelvoud van de hoekstrookjes,
// dus de grens ligt niet op een gok maar tussen twee groottes in.
//
// Draaien op een model dat het glasmateriaal al heeft doet niets.
import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../catalog/tools/glb.mjs';
import { herbouwGlb } from './glb-herbouw.mjs';

const KOLOMMEN = 16;
const RIJEN = 4;

// Hetzelfde materiaal als glasmateriaal.mjs zet: wit met alpha 0.2, BLEND — de ene
// doorzichtige glaskleur die bijlage A toestaat.
const GLAS = {
  name: 'glas',
  pbrMetallicRoughness: {
    baseColorFactor: [1, 1, 1, 0.20000000298023224],
    metallicFactor: 0,
    roughnessFactor: 0.5,
  },
  alphaMode: 'BLEND',
  doubleSided: true,
};

const argumenten = process.argv.slice(2);
let cel = null, marge = 0.02, staand = false, vlak = 0.5, ruitenAantal = null, overlap = 0, kozijn = false;
const bestanden = [];
for (let i = 0; i < argumenten.length; i++) {
  if (argumenten[i] === '--cel') cel = argumenten[++i];
  else if (argumenten[i] === '--marge') marge = Number(argumenten[++i]);
  else if (argumenten[i] === '--staand') staand = true;
  else if (argumenten[i] === '--vlak') vlak = Number(argumenten[++i]);
  else if (argumenten[i] === '--ruiten') ruitenAantal = Number(argumenten[++i]);
  else if (argumenten[i] === '--overlap') overlap = Number(argumenten[++i]);
  else if (argumenten[i] === '--kozijn') kozijn = true;
  else bestanden.push(argumenten[i]);
}
if (!cel || bestanden.length === 0 || !(marge >= 0) || (ruitenAantal !== null && !(ruitenAantal > 0))) {
  console.error('gebruik: node tools/glasruit.mjs --cel k,r [--marge 0.02] [--staand [--vlak 0.5]] [--ruiten 4] [--kozijn] [--overlap 0.015] <glb...>');
  process.exit(1);
}
const [celK, celR] = cel.split(',').map(Number);

function vlaknormaal(pos, h) {
  const [a, b, c] = h.map((i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]);
  const u = b.map((v, i) => v - a[i]);
  const w = c.map((v, i) => v - a[i]);
  const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  const lengte = Math.hypot(...n);
  return lengte === 0 ? null : n.map((v) => v / lengte);
}

function oppervlak(pos, h) {
  const [a, b, c] = h.map((i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]);
  const u = b.map((v, i) => v - a[i]);
  const w = c.map((v, i) => v - a[i]);
  return Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2;
}

// Twee assen in het vlak van een normaal, om op plat te slaan.
function assen(n) {
  const hulp = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = [n[1] * hulp[2] - n[2] * hulp[1], n[2] * hulp[0] - n[0] * hulp[2], n[0] * hulp[1] - n[1] * hulp[0]];
  const lu = Math.hypot(...u);
  const ue = u.map((v) => v / lu);
  const v = [n[1] * ue[2] - n[2] * ue[1], n[2] * ue[0] - n[0] * ue[2], n[0] * ue[1] - n[1] * ue[0]];
  return [ue, v];
}

// Omhullende veelhoek van platgeslagen punten (monotone chain). Het lichtlichaam is bol,
// dus dit is precies zijn omtrek van die kant gezien — geen benadering.
function omhulsel(punten) {
  const p = [...punten].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const kruis = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const bouw = (lijst) => {
    const uit = [];
    for (const q of lijst) {
      while (uit.length >= 2 && kruis(uit[uit.length - 2], uit[uit.length - 1], q) <= 0) uit.pop();
      uit.push(q);
    }
    return uit;
  };
  const onder = bouw(p);
  const boven = bouw([...p].reverse());
  return [...onder.slice(0, -1), ...boven.slice(0, -1)];
}

// Het vlak door een groep punten: de grootste driehoek eruit geeft de normaal, gedraaid
// zodat hij dezelfde kant op wijst als de zijde waar de punten bij horen.
function besteNormaal(punten, heen) {
  let beste = null, besteOpp = 0;
  for (let a = 0; a < punten.length; a++) {
    for (let b = a + 1; b < punten.length; b++) {
      for (let c = b + 1; c < punten.length; c++) {
        const u = punten[b].map((v, i) => v - punten[a][i]);
        const w = punten[c].map((v, i) => v - punten[a][i]);
        const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
        const l = Math.hypot(...n);
        if (l > besteOpp) { besteOpp = l; beste = n.map((v) => v / l); }
      }
    }
  }
  if (!beste) return null;
  const heenop = beste.reduce((s, v, i) => s + v * heen[i], 0);
  return heenop < 0 ? beste.map((v) => -v) : beste;
}

// De omtrek een stukje naar buiten leggen, zodat de rand van een ruit achter het metaal
// van het frame valt in plaats van er precies tegenaan te eindigen: elke zijde schuift d
// naar buiten en de hoekpunten volgen op het snijpunt (miter). Alleen zinnig op een bolle
// veelhoek, en dat is het omhulsel altijd.
function verwijd(rand, d) {
  if (d <= 0 || rand.length < 3) return rand;
  const opp = rand.reduce((s, p, i) => {
    const q = rand[(i + 1) % rand.length];
    return s + p[0] * q[1] - q[0] * p[1];
  }, 0) / 2;
  const p = opp < 0 ? [...rand].reverse() : rand;
  const buiten = p.map((a, i) => {
    const b = p[(i + 1) % p.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [(b[1] - a[1]) / l, -(b[0] - a[0]) / l];
  });
  return p.map((v, i) => {
    const n1 = buiten[(i - 1 + p.length) % p.length];
    const n2 = buiten[i];
    const noemer = 1 + n1[0] * n2[0] + n1[1] * n2[1];
    if (noemer < 1e-6) return v;
    return [v[0] + d * (n1[0] + n2[0]) / noemer, v[1] + d * (n1[1] + n2[1]) / noemer];
  });
}

// De ruiten van één primitief: per gekozen vlak één veelhoek, zo groot als het lichaam
// er vandaan gezien is, op --marge voor dat vlak.
function ruiten(glb, prim) {
  const pos = readAccessor(glb, prim.attributes.POSITION).data;
  const uv = readAccessor(glb, prim.attributes.TEXCOORD_0).data;
  const idx = readAccessor(glb, prim.indices).data;
  const inCel = (i) => Math.min(Math.floor(uv[i * 2] * KOLOMMEN), KOLOMMEN - 1) === celK
    && Math.min(Math.floor(uv[i * 2 + 1] * RIJEN), RIJEN - 1) === celR;

  // De vlakken van het lichaam, en alle hoekpunten ervan: het eerste bepaalt waar een ruit
  // komt te staan, het tweede hoe groot hij is.
  const vlakken = new Map();
  const lichaam = new Set();
  const punt = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
  const sleutelVanPunt = (i) => punt(i).map((c) => c.toFixed(4)).join(',');
  // Hoekpunten liggen per vlak apart in het bestand; op positie samengenomen is te zien
  // welke punten zowel aan de cel als aan de rest vastzitten — dat is de rand.
  const aanCel = new Set(), aanRest = new Set();
  for (let d = 0; d + 2 < idx.length; d += 3) {
    const h = [idx[d], idx[d + 1], idx[d + 2]];
    const doel = h.every(inCel) ? aanCel : aanRest;
    for (const i of h) doel.add(sleutelVanPunt(i));
  }
  for (let d = 0; d + 2 < idx.length; d += 3) {
    const h = [idx[d], idx[d + 1], idx[d + 2]];
    if (!h.every(inCel)) continue;
    for (const i of h) lichaam.add(i);
    const n = vlaknormaal(pos, h);
    if (!n) continue;
    if (staand && Math.abs(n[1]) > vlak) continue;
    const afstand = [0, 1, 2].reduce((s, a) => s + n[a] * pos[h[0] * 3 + a], 0);
    const sleutel = `${n.map((v) => v.toFixed(2)).join(',')}@${afstand.toFixed(3)}`;
    const vl = vlakken.get(sleutel) ?? { n, afstand, opp: 0 };
    vl.opp += oppervlak(pos, h);
    vlakken.set(sleutel, vl);
  }

  let gekozen = [...vlakken.values()].sort((a, b) => b.opp - a.opp);
  if (ruitenAantal !== null) gekozen = gekozen.slice(0, ruitenAantal);

  // Met --kozijn spant elke ruit tot de rand van de opening: de randpunten gaan naar de
  // zijde waar ze het meest naartoe wijzen, en die punten geven zowel het vlak als de maat.
  const randPunten = [...lichaam].filter((i) => aanRest.has(sleutelVanPunt(i)) && aanCel.has(sleutelVanPunt(i)));
  const bijZijde = new Map(gekozen.map((z) => [z, []]));
  if (kozijn) {
    for (const i of randPunten) {
      const p = punt(i);
      let beste = null, besteScore = -Infinity;
      for (const z of gekozen) {
        const score = (p[0] * z.n[0] + p[2] * z.n[2]) / (Math.hypot(p[0], p[2]) || 1);
        if (score > besteScore) { besteScore = score; beste = z; }
      }
      bijZijde.get(beste).push(p);
    }
  }

  const posities = [], normalen = [], uvs = [], indices = [];
  for (const zijde of gekozen) {
    let { n, afstand } = zijde;
    let bron = [...lichaam].map(punt);
    if (kozijn) {
      bron = bijZijde.get(zijde);
      if (bron.length < 3) continue;
      // Het vlak van de opening volgt uit de randpunten zelf; de normaal van het zijvlak
      // zegt alleen nog welke kant naar buiten is.
      const vlakN = besteNormaal(bron, n);
      if (!vlakN) continue;
      n = vlakN;
      afstand = [0, 1, 2].reduce((s, a) => s + n[a] * bron[0][a], 0);
    }
    const [u, v] = assen(n);
    const plat = bron.map((p) => [p[0] * u[0] + p[1] * u[1] + p[2] * u[2], p[0] * v[0] + p[1] * v[1] + p[2] * v[2]]);
    const rand = verwijd(omhulsel(plat), overlap);
    if (rand.length < 3) continue;
    const nul = posities.length / 3;
    for (const [a, b] of rand) {
      for (let as = 0; as < 3; as++) posities.push(u[as] * a + v[as] * b + n[as] * (afstand + marge));
      normalen.push(...n);
      // De uv's gaan mee, maar het glasmateriaal heeft geen textuur; ze staan er zodat
      // het primitief dezelfde attributen heeft als de rest van het model.
      uvs.push(0, 0);
    }
    for (let k = 1; k + 1 < rand.length; k++) indices.push(nul, nul + k, nul + k + 1);
  }
  return indices.length ? { posities, normalen, uvs, indices } : null;
}

for (const pad of bestanden) {
  const glb = readGlb(pad);
  const json = glb.json;
  if (json.materials?.some((m) => m.name === GLAS.name)) {
    console.log(`${pad}: heeft het glasmateriaal al`);
    continue;
  }

  const vervangen = new Map();
  const nieuweAccessor = (waarden, Type, type, componentType, breedte, grens) => {
    const index = json.accessors.push({ type, componentType, count: waarden.length / breedte,
      ...(grens ? { min: [], max: [] } : {}) }) - 1;
    vervangen.set(index, { waarden, breedte, Type });
    return index;
  };

  let tellen = 0;
  for (const mesh of json.meshes) {
    const erbij = [];
    for (const prim of mesh.primitives) {
      const ruit = ruiten(glb, prim);
      if (!ruit) continue;
      tellen += ruit.indices.length / 3;
      const kort = ruit.posities.length / 3 <= 65535;
      erbij.push({
        attributes: {
          POSITION: nieuweAccessor(ruit.posities, Float32Array, 'VEC3', 5126, 3, true),
          NORMAL: nieuweAccessor(ruit.normalen, Float32Array, 'VEC3', 5126, 3),
          TEXCOORD_0: nieuweAccessor(ruit.uvs, Float32Array, 'VEC2', 5126, 2),
        },
        indices: nieuweAccessor(ruit.indices, kort ? Uint16Array : Uint32Array, 'SCALAR', kort ? 5123 : 5125, 1),
        material: json.materials.length,
      });
    }
    mesh.primitives.push(...erbij);
  }
  if (!tellen) {
    console.log(`${pad}: geen driehoeken op ${cel}${staand ? ' die opstaan' : ''}`);
    continue;
  }
  json.materials.push(GLAS);

  const bin = herbouwGlb(glb, { vervangen });
  writeGlb(pad, json, bin, writeFileSync);
  console.log(`${pad}: ${tellen} driehoeken glas op ${marge} m voor ${cel}`);
}
