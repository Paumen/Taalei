
import { readdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leesGlb, leesAccessor, nodeMatrix, maalMatrix, EENHEIDSMATRIX } from './glb.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KIT = join(ROOT, 'kits', 'modulair-terrein');
const UIT = join(KIT, 'aansluitingen.json');

export const VAK = 0.5;
export const LAAG = 0.5;

const VAK_SPELING = 0.05;

const KWANT = 0.005;

const VLAK_TOL = KWANT / 2;

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

  const uit = [];
  nodes.forEach((node, index) => {
    if (node.mesh === undefined || !wereld[index]) return;
    const m = wereld[index];

    for (const prim of json.meshes[node.mesh].primitives ?? []) {
      if ((prim.mode ?? 4) !== 4) continue;

      const pos = leesAccessor(glb, prim.attributes.POSITION);
      const idx = prim.indices !== undefined ? leesAccessor(glb, prim.indices) : null;
      const aantal = idx ? idx.count : pos.count;

      for (let i = 0; i + 2 < aantal; i += 3) {
        for (let k = 0; k < 3; k++) {
          const v = idx ? idx.data[i + k] : i + k;
          const x = pos.data[v * 3], y = pos.data[v * 3 + 1], z = pos.data[v * 3 + 2];
          uit.push(
            m[0] * x + m[4] * y + m[8] * z + m[12],
            m[1] * x + m[5] * y + m[9] * z + m[13],
            m[2] * x + m[6] * y + m[10] * z + m[14],
          );
        }
      }
    }
  });

  return Float64Array.from(uit);
}

function doorsnede(driehoeken, as, waarde, asA, asB, nulA, nulB) {
  const n = driehoeken.length / 9;
  const stukken = [];
  const vlakke = new Map();

  const kwant = (v) => Math.round(v / KWANT);
  const naarVlak = (p) => [
    kwant((p[asA[0]] - nulA) * asA[1]),
    kwant((p[asB[0]] - nulB) * asB[1]),
  ];
  const ribbeSleutel = (p, q) => (p[0] < q[0] || (p[0] === q[0] && p[1] <= q[1])
    ? `${p[0]},${p[1]}|${q[0]},${q[1]}`
    : `${q[0]},${q[1]}|${p[0]},${p[1]}`);

  for (let t = 0; t < n; t++) {
    const hoek = [0, 1, 2].map((k) => [
      driehoeken[t * 9 + k * 3], driehoeken[t * 9 + k * 3 + 1], driehoeken[t * 9 + k * 3 + 2],
    ]);
    const d = hoek.map((p) => p[as] - waarde);

    if (d.every((v) => Math.abs(v) <= VLAK_TOL)) {
      for (let k = 0; k < 3; k++) {
        const sleutel = ribbeSleutel(naarVlak(hoek[k]), naarVlak(hoek[(k + 1) % 3]));
        vlakke.set(sleutel, (vlakke.get(sleutel) ?? 0) + 1);
      }
      continue;
    }

    const punten = [];
    for (let k = 0; k < 3; k++) {
      const p = hoek[k], q = hoek[(k + 1) % 3];
      const dp = d[k], dq = d[(k + 1) % 3];

      if (Math.abs(dp) <= VLAK_TOL) punten.push(naarVlak(p));
      if (Math.abs(dp) > VLAK_TOL && Math.abs(dq) > VLAK_TOL && (dp < 0) !== (dq < 0)) {
        const s = dp / (dp - dq);
        punten.push(naarVlak([0, 1, 2].map((a) => p[a] + s * (q[a] - p[a]))));
      }
    }

    const uniek = [];
    for (const p of punten) {
      if (!uniek.some((q) => q[0] === p[0] && q[1] === p[1])) uniek.push(p);
    }
    if (uniek.length === 2) stukken.push([...uniek[0], ...uniek[1]]);
  }

  for (const [sleutel, aantal] of vlakke) {
    if (aantal % 2 === 0) continue;
    const [p, q] = sleutel.split('|').map((s) => s.split(',').map(Number));
    stukken.push([...p, ...q]);
  }

  return stukken;
}

const ggd = (a, b) => (b === 0 ? Math.abs(a) : ggd(b, a % b));

function schoon(stukken, a0, a1, b0, b1) {
  const banen = new Map();

  for (const [pa, pb, qa, qb] of stukken) {
    let da = qa - pa;
    let db = qb - pb;
    if (da === 0 && db === 0) continue;

    let s0 = 0, s1 = 1;
    for (const [p, dd, laag, hoog] of [[pa, da, a0, a1], [pb, db, b0, b1]]) {
      if (dd === 0) {
        if (p < laag || p > hoog) { s0 = 1; s1 = 0; break; }
        continue;
      }
      const t0 = (laag - p) / dd;
      const t1 = (hoog - p) / dd;
      s0 = Math.max(s0, Math.min(t0, t1));
      s1 = Math.min(s1, Math.max(t0, t1));
    }
    if (s1 <= s0) continue;

    const ka = Math.round(pa + s0 * da), kb = Math.round(pb + s0 * db);
    const la = Math.round(pa + s1 * da), lb = Math.round(pb + s1 * db);
    da = la - ka; db = lb - kb;
    if (da === 0 && db === 0) continue;

    const deler = ggd(Math.abs(da), Math.abs(db)) || 1;
    let ra = da / deler, rb = db / deler;
    if (ra < 0 || (ra === 0 && rb < 0)) { ra = -ra; rb = -rb; }
    const sleutel = `${ra},${rb},${ra * kb - rb * ka}`;

    if (!banen.has(sleutel)) banen.set(sleutel, { ra, rb, anker: [ka, kb], delen: [] });
    const baan = banen.get(sleutel);
    const langs = (a, b) => (ra !== 0 ? (a - baan.anker[0]) / ra : (b - baan.anker[1]) / rb);
    const s = langs(ka, kb);
    const e = langs(la, lb);
    baan.delen.push([Math.min(s, e), Math.max(s, e)]);
  }

  const uit = [];
  for (const { ra, rb, anker, delen } of banen.values()) {
    const punt = (s) => [anker[0] + s * ra, anker[1] + s * rb];
    delen.sort((p, q) => p[0] - q[0]);
    let [van, tot] = delen[0];
    for (const [s, e] of delen.slice(1)) {
      if (s <= tot) { tot = Math.max(tot, e); continue; }
      uit.push([...punt(van), ...punt(tot)]);
      [van, tot] = [s, e];
    }
    uit.push([...punt(van), ...punt(tot)]);
  }

  uit.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2] || p[3] - q[3]);
  return uit;
}

const ZIJDEN = [
  { naam: 'n', as: 2, kant: -1, langs: 0, richting: -1 },
  { naam: 'o', as: 0, kant: +1, langs: 2, richting: -1 },
  { naam: 'z', as: 2, kant: +1, langs: 0, richting: +1 },
  { naam: 'w', as: 0, kant: -1, langs: 2, richting: +1 },
];

const HORIZONTAAL = { asA: [0, +1], asB: [2, +1] };

function catalogus(voorvoegsel) {
  const opNummer = [];
  const opSleutel = new Map();

  return {
    neem(vorm) {
      const sleutel = JSON.stringify(vorm);
      if (opSleutel.has(sleutel)) return opSleutel.get(sleutel);
      const id = `${voorvoegsel}${String(opNummer.length + 1).padStart(3, '0')}`;
      opSleutel.set(sleutel, id);
      opNummer.push({ id, vorm });
      return id;
    },
    zoek(vorm) {
      return opSleutel.get(JSON.stringify(vorm)) ?? null;
    },
    alles: opNummer,
  };
}

function indeling(naam) {
  const delen = naam.split('-');
  const familie = delen[0];
  const soort = delen[1] === 'terrain' ? 'terrein'
    : delen[1] === 'prop' ? 'prop'
      : familie === 'mountain' ? 'landmark' : 'terrein';
  const laatste = delen[delen.length - 1];
  const trap = ['base', 'mid', 'top'].includes(laatste) ? laatste : null;
  return { familie, soort, trap };
}

const toon = process.argv.includes('--toon');

const bestanden = readdirSync(KIT).filter((n) => n.endsWith('.glb')).sort();
if (bestanden.length === 0) throw new Error(`geen .glb-bestanden in ${KIT}`);

const randen = catalogus('r');
const vlakken = catalogus('v');
const modellen = [];

function vakBereik(min, max, as) {
  const laag = Math.floor((min[as] + VAK / 2) / VAK + VAK_SPELING);
  const hoog = Math.ceil((max[as] + VAK / 2) / VAK - VAK_SPELING) - 1;
  return [laag, Math.max(laag, hoog)];
}

const half = Math.round(VAK / 2 / KWANT);

for (const bestand of bestanden) {
  const naam = bestand.replace(/\.glb$/, '');
  const driehoeken = leesDriehoeken(leesGlb(join(KIT, bestand)));
  if (driehoeken.length === 0) throw new Error(`${naam}: geen driehoeken`);

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < driehoeken.length; i += 3) {
    for (let as = 0; as < 3; as++) {
      if (driehoeken[i + as] < min[as]) min[as] = driehoeken[i + as];
      if (driehoeken[i + as] > max[as]) max[as] = driehoeken[i + as];
    }
  }

  const [u0, u1] = vakBereik(min, max, 0);
  const [v0, v1] = vakBereik(min, max, 2);

  const zijden = { n: {}, o: {}, z: {}, w: {} };
  const boven = {};
  const onder = {};
  const gevuld = [];

  for (let u = u0; u <= u1; u++) {
    for (let v = v0; v <= v1; v++) {
      const sleutel = `${u},${v}`;

      for (const [waar, doel] of [[0, onder], [LAAG, boven]]) {
        const ruw = doorsnede(driehoeken, 1, waar, HORIZONTAAL.asA, HORIZONTAAL.asB, u * VAK, v * VAK);
        doel[sleutel] = vlakken.neem(schoon(ruw, -half, half, -half, half));
      }

      for (const zijde of ZIJDEN) {
        const buiten = zijde.as === 0
          ? (zijde.kant < 0 ? u === u0 : u === u1)
          : (zijde.kant < 0 ? v === v0 : v === v1);
        if (!buiten) continue;

        const waarde = (zijde.as === 0 ? u : v) * VAK + zijde.kant * VAK / 2;
        const nul = (zijde.langs === 0 ? u : v) * VAK;
        const ruw = doorsnede(
          driehoeken, zijde.as, waarde,
          [zijde.langs, zijde.richting], [1, +1], nul, 0,
        );
        zijden[zijde.naam][sleutel] = randen.neem(schoon(ruw, -half, half, -Infinity, Infinity));
      }

      const raakt = (() => {
        const xl = (u - 0.5) * VAK - 1e-6, xh = (u + 0.5) * VAK + 1e-6;
        const zl = (v - 0.5) * VAK - 1e-6, zh = (v + 0.5) * VAK + 1e-6;
        for (let t = 0; t < driehoeken.length / 9; t++) {
          let a = Infinity, b = -Infinity, c = Infinity, e = -Infinity;
          for (let k = 0; k < 3; k++) {
            const x = driehoeken[t * 9 + k * 3], z = driehoeken[t * 9 + k * 3 + 2];
            a = Math.min(a, x); b = Math.max(b, x); c = Math.min(c, z); e = Math.max(e, z);
          }
          if (b >= xl && a <= xh && e >= zl && c <= zh) return true;
        }
        return false;
      })();
      if (raakt) gevuld.push([u, v]);
    }
  }

  modellen.push({
    naam,
    ...indeling(naam),
    vakken: [u1 - u0 + 1, v1 - v0 + 1],
    oorsprong: [u0, v0],
    gevuld,
    lagen: [Math.floor(min[1] / LAAG + 1e-6), Math.max(0, Math.ceil(max[1] / LAAG - 1e-6) - 1)],
    doos: {
      min: min.map((v) => Number(v.toFixed(4))),
      max: max.map((v) => Number(v.toFixed(4))),
    },
    driehoeken: driehoeken.length / 9,
    zijden,
    boven,
    onder,
  });
}

for (const rand of randen.alles) {
  rand.spiegel = randen.zoek(
    schoon(rand.vorm.map(([a, b, c, d]) => [-a, b, -c, d]), -Infinity, Infinity, -Infinity, Infinity),
  );
}

const naarUnits = (vorm) => vorm.map((s) => s.map((v) => Number((v * KWANT).toFixed(3))));

const uit = {
  gegenereerd: 'node tools/aansluitingen.mjs',
  kit: 'modulair-terrein',
  raster: { vak: VAK, laag: LAAG },
  meting: { kwant: KWANT, vlakTol: VLAK_TOL },
  randen: Object.fromEntries(randen.alles.map((r) => [r.id, { spiegel: r.spiegel, vorm: naarUnits(r.vorm) }])),
  vlakken: Object.fromEntries(vlakken.alles.map((v) => [v.id, naarUnits(v.vorm)])),
  modellen,
};

writeFileSync(UIT, `${JSON.stringify(uit, null, 1)}\n`);

const perRand = new Map();
for (const model of modellen) {
  for (const zijde of Object.values(model.zijden)) {
    for (const id of Object.values(zijde)) {
      if (!perRand.has(id)) perRand.set(id, new Set());
      perRand.get(id).add(model.naam);
    }
  }
}

const leeg = randen.alles.filter((r) => r.vorm.length === 0).map((r) => r.id);
const dood = randen.alles.filter((r) => !r.spiegel && perRand.has(r.id));

console.log(`${modellen.length} modellen uit kits/modulair-terrein/`);
console.log(`${randen.alles.length} verschillende zijprofielen, ${vlakken.alles.length} verschillende horizontale vlakken`);
console.log(`${dood.length} zijprofielen hebben geen tegenhanger in de kit`);
console.log(`→ ${UIT.replace(`${ROOT}/`, '')}`);

if (!toon) process.exit(0);

console.log('\nzijprofielen, meest gebruikt eerst:');
for (const rand of [...randen.alles].sort((a, b) => (perRand.get(b.id)?.size ?? 0) - (perRand.get(a.id)?.size ?? 0))) {
  const gebruikers = perRand.get(rand.id);
  if (!gebruikers) continue;
  const past = rand.spiegel === rand.id ? 'op zichzelf' : rand.spiegel ? `op ${rand.spiegel}` : 'nergens op';
  const wat = leeg.includes(rand.id) ? 'open lucht' : `${rand.vorm.length} lijnstuk(ken)`;
  console.log(`  ${rand.id}  ${String(gebruikers.size).padStart(3)} stukken  ${wat.padEnd(16)} past ${past}`);
}

console.log('\ndoodlopende zijden (geen enkel stuk past hiertegenaan):');
for (const rand of dood) {
  console.log(`  ${rand.id}  ${[...perRand.get(rand.id)].join(', ')}`);
}
