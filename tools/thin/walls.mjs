import { readGlb, wallParts } from '../../catalog/tools/glb.mjs';

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) {
  console.log(`walls.mjs <glb> [--under <wall>] [--json]
Lists every part the G27 wall check measures, thinnest first: mesh, primitive,
triangles, the part's wall (what the lint uses), its thinnest sampled spot and
where that is, and the part's bounds. Parts the check skips say why.`);
  process.exit(0);
}
const opt = (k) => { const i = args.indexOf(k); return i < 0 ? null : args[i + 1]; };
const under = Number(opt('--under') ?? Infinity);
const parts = wallParts(readGlb(args[0])).sort((a, b) => (a.wall ?? 9) - (b.wall ?? 9)).filter((p) => p.wall === null ? under === Infinity : p.wall < under);
if (args.includes('--json')) { console.log(JSON.stringify(parts, null, 1)); process.exit(0); }
const f = (v) => (v === null || v === undefined ? '-' : v.toFixed(4));
const xyz = (q) => q.map((v) => v.toFixed(3)).join(',');
for (const p of parts) {
  const head = `${p.mesh} #${p.primitive}  tris ${p.tris}`.padEnd(34);
  console.log(p.wall === null
    ? `${head} skipped (${p.skipped})  box ${xyz(p.min)} .. ${xyz(p.max)}`
    : `${head} wall ${f(p.wall)}  thinnest ${f(p.thinnest)} at ${xyz(p.at)}  box ${xyz(p.min)} .. ${xyz(p.max)}`);
}
