// Toetst de ballon-GLB's aan de mechanisch controleerbare regels uit
// asset_style_guide.md. Draaien vanuit de repo-root.
import { readFileSync } from 'node:fs';

const PALET = JSON.parse(readFileSync('kits/palet.json', 'utf8'));
const gedeeld = PALET.paletten.find((p) => p.id === 'gedeeld');
const CELLEN = new Set(gedeeld.cellen.map((c) => `${c.cel[0]}/${c.cel[1]}`));
const CEL_KLEUR = new Map(gedeeld.cellen.map((c) => [`${c.cel[0]}/${c.cel[1]}`, c.kleur]));

function leesGlb(pad) {
  const buf = readFileSync(pad);
  let off = 12, json = null, bin = null;
  const eind = buf.readUInt32LE(8);
  while (off + 8 <= eind) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    else if (type === 0x004e4942) bin = Buffer.from(data);
    off += 8 + len;
  }
  return { json, bin, bytes: buf.length };
}

function leesAccessor(json, bin, i) {
  const a = json.accessors[i];
  const comp = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type];
  const view = json.bufferViews[a.bufferView];
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const basis = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const stap = view.byteStride ?? comp * (a.componentType === 5126 ? 4 : 2);
  const uit = [];
  for (let n = 0; n < a.count; n++) {
    const rij = [];
    for (let c = 0; c < comp; c++) {
      const off = basis + n * stap + c * (a.componentType === 5126 ? 4 : 2);
      rij.push(a.componentType === 5126 ? dv.getFloat32(off, true) : dv.getUint16(off, true));
    }
    uit.push(rij);
  }
  return uit;
}

let fouten = 0, waarschuwingen = 0;
const ok = (t) => console.log('  ok    ' + t);
const fout = (t) => { fouten++; console.log('  FOUT  ' + t); };
const let_op = (t) => { waarschuwingen++; console.log('  let op ' + t); };

for (const naam of ['balloon', 'balloon-basket']) {
  const pad = `kits/taalei-kit/${naam}.glb`;
  const { json, bin, bytes } = leesGlb(pad);
  console.log(`\n=== ${naam} (${(bytes / 1024).toFixed(1)} kB)`);

  /* 1. Kleur — elke uv moet in een cel uit palet.json vallen */
  const gebruikt = new Set();
  let buitenPalet = 0;
  for (const prim of json.meshes[0].primitives) {
    if (prim.attributes.TEXCOORD_0 === undefined) continue;
    for (const [u, v] of leesAccessor(json, bin, prim.attributes.TEXCOORD_0)) {
      const cel = `${Math.floor(u * 16)}/${Math.floor(v * 4)}`;
      if (CELLEN.has(cel)) gebruikt.add(cel); else buitenPalet++;
    }
  }
  if (buitenPalet === 0) ok(`alle uv's in paletcellen: ${[...gebruikt].map((c) => `${c} ${CEL_KLEUR.get(c)}`).join(', ')}`);
  else fout(`${buitenPalet} uv's buiten een paletcel`);

  /* 1b. Materiaaldefaults: metallic 0, geen transparantie, geen emissive */
  for (const mat of json.materials) {
    const pbr = mat.pbrMetallicRoughness ?? {};
    if ((pbr.metallicFactor ?? 1) !== 0) fout(`${mat.name}: metallicFactor ${pbr.metallicFactor ?? 1}, moet 0`);
    if ((pbr.roughnessFactor ?? 1) !== 1) fout(`${mat.name}: roughnessFactor ${pbr.roughnessFactor}, moet 1`);
    if ((mat.alphaMode ?? 'OPAQUE') !== 'OPAQUE') fout(`${mat.name}: alphaMode ${mat.alphaMode}`);
    if (mat.emissiveTexture || (mat.emissiveFactor ?? [0, 0, 0]).some((c) => c > 0)) fout(`${mat.name}: emissive gezet`);
    if ((pbr.baseColorFactor ?? [1, 1, 1, 1])[3] !== 1) fout(`${mat.name}: alpha < 1`);
  }
  ok(`${json.materials.length} materialen: metallic 0, roughness 1, OPAQUE, geen emissive`);

  /* 2. Geometrie — hoeveel vlakke stukken per volledige cirkel? */
  const posities = leesAccessor(json, bin, json.meshes[0].primitives[0].attributes.POSITION);
  // Groepeer op (hoogte, straal): één ring van één gedraaide vorm. Zonder de
  // straal erbij vallen losse onderdelen op dezelfde hoogte — ring, kabels,
  // stijlen — in één hoop en telt de controle veel te veel stukken.
  //
  // Ook mét de straal erbij kunnen twee onderdelen elkaar overlappen. Een
  // echte ring van een gedraaide vorm heeft gelijke hoekafstanden; een
  // toevallige hoop van losse delen niet. Alleen gelijkmatige ringen tellen
  // dus mee, de rest wordt gemeld als informatie.
  const hoeken = new Map();
  for (const [x, y, z] of posities) {
    const r = Math.hypot(x, z);
    if (r < 0.02) continue;
    const sleutel = `${y.toFixed(2)}@${r.toFixed(2)}`;
    if (!hoeken.has(sleutel)) hoeken.set(sleutel, new Set());
    hoeken.get(sleutel).add(Math.round(Math.atan2(z, x) * 200));
  }
  const gelijkmatig = (hoekSet) => {
    const a = [...hoekSet].map((h) => h / 200).sort((p, q) => p - q);
    if (a.length < 3) return true;
    const stappen = a.map((h, i) => (i === 0 ? h + Math.PI * 2 - a[a.length - 1] : h - a[i - 1]));
    const gem = stappen.reduce((s, v) => s + v, 0) / stappen.length;
    return stappen.every((s) => Math.abs(s - gem) < gem * 0.1);
  };
  const ringen = [...hoeken.entries()].sort((a, b) => b[1].size - a[1].size);
  const echte = ringen.filter(([, s]) => gelijkmatig(s));
  const gemengd = ringen.filter(([, s]) => !gelijkmatig(s) && s.size > 16);
  const ergste = echte[0];
  if (ergste[1].size <= 16) ok(`max ${ergste[1].size} vlakke stukken per cirkel (limiet 16)`);
  else fout(`${ergste[1].size} stukken per cirkel op ${ergste[0]}, limiet is 16`);
  if (gemengd.length) console.log(`  info  ${gemengd.length} hoogte/straal-groep(en) met overlappende losse delen, niet als cirkel geteld`);

  /* 3. Outlines — hoeveel lijnprimitives? */
  const lijnen = json.meshes[0].primitives.filter((p) => p.mode === 1);
  if (lijnen.length) let_op(`${lijnen.length} lijnprimitive(s) — alleen toegestaan als onderscheidend kenmerk, met PO-notitie`);

  /* 4. Schaal — driehoeken per kubieke eenheid en oorsprong */
  const acc = json.accessors[json.meshes[0].primitives[0].attributes.POSITION];
  const [bx, by, bz] = acc.max.map((v, i) => v - acc.min[i]);
  let tris = 0, calls = 0;
  for (const prim of json.meshes[0].primitives) {
    calls++;
    if ((prim.mode ?? 4) === 4) tris += json.accessors[prim.indices].count / 3;
  }
  const volume = Math.max(bx * by * bz, 1);
  const dichtheid = tris / volume;
  if (dichtheid <= 1000) ok(`${tris} tri in ${bx.toFixed(2)}x${bz.toFixed(2)}x${by.toFixed(2)} = ${dichtheid.toFixed(0)} tri/unit³ (limiet 1000)`);
  else fout(`${dichtheid.toFixed(0)} tri per kubieke eenheid, limiet 1000`);
  console.log(`  info  ${calls} tekenopdrachten`);

  /* 5. Oorsprong: Y=0 onderaan, spil in het midden van de voetafdruk */
  const yOnder = acc.min[1];
  if (Math.abs(yOnder) < 0.001) ok('laagste punt op Y = 0');
  else let_op(`laagste punt op Y = ${yOnder.toFixed(3)} (bewuste afwijking?)`);
  const spilX = (acc.min[0] + acc.max[0]) / 2, spilZ = (acc.min[2] + acc.max[2]) / 2;
  if (Math.abs(spilX) < 0.01 && Math.abs(spilZ) < 0.01) ok('spil in het midden van de voetafdruk');
  else fout(`spil uit het midden: x ${spilX.toFixed(3)}, z ${spilZ.toFixed(3)}`);

  /* 4b. Dunste massieve onderdeel: kortste driehoekszijde als indicatie */
  let kortste = Infinity;
  const idx = leesAccessor(json, bin, json.meshes[0].primitives[0].indices).map((r) => r[0]);
  for (let i = 0; i < idx.length; i += 3) {
    const P = [0, 1, 2].map((k) => posities[idx[i + k]]);
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
      const l = Math.hypot(P[a][0] - P[b][0], P[a][1] - P[b][1], P[a][2] - P[b][2]);
      if (l > 1e-6) kortste = Math.min(kortste, l);
    }
  }
  if (kortste >= 0.015) ok(`kortste ribbe ${kortste.toFixed(3)} ≥ 0.015`);
  else fout(`kortste ribbe ${kortste.toFixed(3)} < 0.015`);
}

console.log(`\n${fouten} fouten, ${waarschuwingen} aandachtspunten`);
