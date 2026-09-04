// Een mesh opdelen in zijn losse samenhangende delen, en die een naam geven waar
// je op de opdrachtregel naar kunt wijzen.
//
// In een samenstelling zit alles in één mesh en deelt een colormap-baan meerdere
// voorwerpen: op 13,0 ligt zowel een lapje leer als de kurk van een fles, of
// zowel een riem als een laag stof. Een baan alleen kan die niet uit elkaar
// houden; een los stuk geometrie wel.
//
// De naam van een stuk is het midden van zijn omhullende doos op twee decimalen.
// Dat is een aanwijzer, geen drempel: welk deel meedoet volgt uit de samenhang
// van de mesh, en welke driehoek licht of donker is blijft uit de banen komen.
//
// Twee stukken kunnen hetzelfde midden hebben — de twee riemen om iron-bars
// liggen gekruist om hetzelfde punt. Een sleutel wijst dan beide aan, en --lijst
// zegt dat erbij, zodat je niet denkt er één te pakken.
import { readAccessor } from '../catalog/tools/glb.mjs';

// -0.00 en 0.00 moeten dezelfde naam opleveren, anders is een sleutel niet te typen.
const rond = (v) => (Math.abs(v) < 0.005 ? '0.00' : v.toFixed(2));

export const stukSleutel = (min, max) => min.map((v, i) => rond((v + max[i]) / 2)).join(',');

export function verdeelInStukken(glb, prim) {
  const pos = readAccessor(glb, prim.attributes.POSITION).data;
  const idx = readAccessor(glb, prim.indices).data;
  const aantal = pos.length / 3;

  // Vertices gelast op hun positie: een mesh die per vlak eigen vertices heeft
  // valt anders in evenveel stukken uiteen als hij driehoeken telt.
  const zelfde = new Map();
  const las = new Int32Array(aantal);
  for (let i = 0; i < aantal; i++) {
    const sleutel = `${Math.round(pos[i * 3] * 1e5)},${Math.round(pos[i * 3 + 1] * 1e5)},${Math.round(pos[i * 3 + 2] * 1e5)}`;
    if (!zelfde.has(sleutel)) zelfde.set(sleutel, i);
    las[i] = zelfde.get(sleutel);
  }

  const ouder = new Int32Array(aantal);
  for (let i = 0; i < aantal; i++) ouder[i] = i;
  const wortel = (x) => {
    while (ouder[x] !== x) x = ouder[x] = ouder[ouder[x]];
    return x;
  };
  const verbind = (a, b) => {
    const wa = wortel(a);
    const wb = wortel(b);
    if (wa !== wb) ouder[wb] = wa;
  };
  for (let t = 0; t < idx.length; t += 3) {
    verbind(las[idx[t]], las[idx[t + 1]]);
    verbind(las[idx[t]], las[idx[t + 2]]);
  }

  const doos = new Map();
  const vanVertex = new Int32Array(aantal).fill(-1);
  for (let t = 0; t < idx.length; t += 3) {
    const stuk = wortel(las[idx[t]]);
    let d = doos.get(stuk);
    if (!d) doos.set(stuk, (d = { tris: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }));
    d.tris++;
    for (const v of [idx[t], idx[t + 1], idx[t + 2]]) {
      vanVertex[v] = stuk;
      for (let a = 0; a < 3; a++) {
        d.min[a] = Math.min(d.min[a], pos[v * 3 + a]);
        d.max[a] = Math.max(d.max[a], pos[v * 3 + a]);
      }
    }
  }

  const sleutelVan = new Map();
  for (const [stuk, d] of doos) sleutelVan.set(stuk, stukSleutel(d.min, d.max));
  return { vanVertex, sleutelVan, doos };
}

// De enige primitive van een model, voor --stuk en --lijst. Modellen met meer
// primitives zijn al langs andere weg te scheiden en hebben dit niet nodig.
export function enigePrimitive(json, pad) {
  const prims = (json.meshes ?? []).flatMap((m) => m.primitives ?? []);
  if (prims.length !== 1) throw new Error(`${pad}: --stuk/--lijst verwacht één primitive, niet ${prims.length}`);
  return prims[0];
}

// De regels van --lijst: elk stuk met zijn sleutel, grootte en banen. `prim` moet
// dezelfde primitive zijn als die aan verdeelInStukken is gegeven — met --mesh is
// dat niet de eerste mesh van het bestand.
export function lijstRegels(glb, stukInfo, baanVan, prim) {
  const uv = readAccessor(glb, prim.attributes.TEXCOORD_0).data;
  const banenPer = new Map();
  for (let v = 0; v < uv.length / 2; v++) {
    const stuk = stukInfo.vanVertex[v];
    if (stuk < 0) continue;
    const per = banenPer.get(stuk) ?? new Map();
    const { cel } = baanVan(uv.subarray(v * 2, v * 2 + 2));
    per.set(cel, (per.get(cel) ?? 0) + 1);
    banenPer.set(stuk, per);
  }
  // Op sleutel samengenomen, want dat is ook wat --stuk selecteert.
  const perSleutel = new Map();
  for (const [stuk, d] of stukInfo.doos) {
    const sleutel = stukInfo.sleutelVan.get(stuk);
    const r = perSleutel.get(sleutel) ?? { delen: 0, tris: 0, maten: new Set(), banen: new Map() };
    r.delen++;
    r.tris += d.tris;
    r.maten.add(d.max.map((v, i) => (v - d.min[i]).toFixed(2)).join('×'));
    for (const [c, n] of banenPer.get(stuk) ?? []) r.banen.set(c, (r.banen.get(c) ?? 0) + n);
    perSleutel.set(sleutel, r);
  }

  return [...perSleutel]
    .sort((a, b) => b[1].tris - a[1].tris)
    .map(([sleutel, r]) => {
      const banen = [...r.banen].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}×${n}`).join(' ');
      const hoeveel = r.delen > 1 ? ` (${r.delen} delen)` : '';
      return `   --stuk ${sleutel.padEnd(18)} ${String(r.tris).padStart(5)} tri  ${[...r.maten].join(' / ')}  ${banen}${hoeveel}`;
    });
}
