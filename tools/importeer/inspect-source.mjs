import { BRONKITS } from '../../catalog/tools/bronkits.mjs';
import { bronModellen, meet } from '../../catalog/tools/bronmodellen.mjs';
import { celVan, atlasKleur, hexVan } from './bouwer.mjs';
import { scaleTarget } from './scale-factors.mjs';

const USAGE = `inspect-source <pack|kit> [model...] [--raster CxR]

  Measures source models before an import is written: triangles, extents at the
  pack's factor, primitives, and the source cells or colours each model uses with
  a triangle count per cell. A name that does not resolve prints MISSING.

  <pack|kit>    a BRONKITS folder name or a kit slug
  model...      source model names; without any, the whole pack is measured
  --raster CxR  the source atlas grid, for a pack whose texture is a band grid
                (KayKit 8x4, Kenney 16x4, Tiny Treats 8x8)
`;

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) {
  console.log(USAGE);
  process.exit(args.length ? 0 : 1);
}

let raster = null;
const names = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--raster') {
    const match = /^(\d+)x(\d+)$/.exec(args[++i] ?? '');
    if (!match) throw new Error('--raster wants CxR, for example 8x4');
    raster = [Number(match[1]), Number(match[2])];
    continue;
  }
  names.push(args[i]);
}

const [target, ...wanted] = names;
const source = BRONKITS.find((b) => b.map === target || b.kit === target);
if (!source) throw new Error(`${target}: no such pack or kit in bronkits.mjs`);

const { modellen } = bronModellen(source);
const byName = new Map(modellen.map((m) => [m.naam, m]));
const factor = source.kit ? scaleTarget(source.kit) : null;

console.log(`\n${source.map}${source.kit ? ` → ${source.kit}` : ''}   ${source.formaat}   `
  + `factor ${factor ?? '—'}   raster ${raster ? raster.join('x') : '—'}`);

const cells = (model) => {
  const counts = new Map();
  for (const primitive of model.primitieven) {
    for (let t = 0; t < primitive.indices.length / 3; t++) {
      let u = 0;
      let v = 0;
      for (let k = 0; k < 3; k++) {
        const i = primitive.indices[t * 3 + k];
        u += primitive.uvs[i * 2] / 3;
        v += primitive.uvs[i * 2 + 1] / 3;
      }
      const key = celVan(primitive, t, raster);
      const seen = counts.get(key) ?? { n: 0, texture: primitive.materiaal?.textuur, u, v };
      seen.n++;
      seen.u = u;
      seen.v = v;
      counts.set(key, seen);
    }
  }
  return [...counts]
    .sort((a, b) => b[1].n - a[1].n)
    .map(([key, c]) => `${key}:${c.n}${c.texture ? `=${atlasKleur(c.texture, c.u, c.v)}` : ''}`);
};

const colours = (model) => {
  const counts = new Map();
  for (const primitive of model.primitieven) {
    const key = primitive.materiaal?.kleur
      ? hexVan(primitive.materiaal.kleur.map((c) => Math.round(c)))
      : `tex:${primitive.materiaal?.textuur ?? '?'}`;
    counts.set(key, (counts.get(key) ?? 0) + primitive.indices.length / 3);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).map(([key, n]) => `${key}:${n}`);
};

for (const name of wanted.length ? wanted : modellen.map((m) => m.naam)) {
  const model = byName.get(name);
  if (!model) { console.log(`  MISSING ${name}`); continue; }
  const m = meet(model.primitieven);
  const wdh = m.wdh.map((v) => (factor ? v * factor : v).toFixed(3)).join(' × ');
  console.log(`\n  ${name}`);
  console.log(`      ${m.driehoeken} tris   wdh ${wdh}${factor ? '' : ' (source units)'}`
    + `   ${model.primitieven.length} primitive(s)`);
  const usable = raster && model.primitieven.every((p) => p.uvs);
  console.log(`      ${usable ? 'cells' : 'mats '} ${(usable ? cells(model) : colours(model)).join('  ')}`);
}
