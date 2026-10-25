import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb } from '../../catalog/tools/glb.mjs';
import { gather, deform } from './door-open.mjs';

const HELP = `floor-slab.mjs [--to <thickness>] [--dry] <floor.glb> [...]

Sets the slab of a floor tile to <thickness> (0.05 by default). The slab top
is the height with the most upward-facing area; everything between the
bottom and that top is squeezed or stretched to the new thickness, and
everything above it, such as spikes, graves or rocks, moves with the top
unchanged. Prints the slab before and after per file, as JSON.`;

export function slabTop(shape) {
  const areas = new Map();
  for (const part of shape.parts) for (const { world, index } of part.prims) for (let t = 0; t < index.length; t += 3) {
    const [a, b, c] = [index[t], index[t + 1], index[t + 2]].map((i) => [world[i * 3], world[i * 3 + 1], world[i * 3 + 2]]);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const area = Math.hypot(...n) / 2;
    if (area < 1e-9 || n[1] / (2 * area) < 0.95) continue;
    const key = Math.round((a[1] + b[1] + c[1]) / 3 / 0.005);
    areas.set(key, (areas.get(key) ?? 0) + area);
  }
  const best = [...areas].sort((p, q) => q[1] - p[1])[0];
  return best ? best[0] * 0.005 : null;
}

export function setSlab(glb, to = 0.05) {
  const shape = gather(glb);
  const base = shape.min[1];
  const top = slabTop(shape);
  if (top === null || top - base < 0.003) return { slab: top === null ? null : top - base, changed: false };
  const k = to / (top - base);
  const v = (y) => (y <= top ? { v: base + (y - base) * k, s: k } : { v: y - (top - base) + to, s: 1 });
  deform(glb, shape, (x) => ({ v: x, s: 1 }), v);
  return { slab: top - base, changed: Math.abs(k - 1) > 0.01 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (!args.length || args.includes('--help')) { console.log(HELP); process.exit(args.length ? 0 : 1); }
  const dry = args.includes('--dry'); if (dry) args.splice(args.indexOf('--dry'), 1);
  const at = args.indexOf('--to'); const to = at < 0 ? 0.05 : Number(args.splice(at, 2)[1]);
  let failed = 0;
  for (const file of args) {
    try {
      const glb = readGlb(file);
      const r = setSlab(glb, to);
      if (r.changed && !dry) writeGlb(file, glb.json, glb.bin, writeFileSync);
      console.log(JSON.stringify({ file, slab: r.slab === null ? null : +r.slab.toFixed(3), to: r.changed ? to : null }));
    } catch (e) {
      console.log(JSON.stringify({ file, error: e.message }));
      failed++;
    }
  }
  if (failed) process.exitCode = 1;
}
