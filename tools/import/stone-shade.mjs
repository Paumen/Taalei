import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds, editablePrimitives, primitiveMatrix, welder, buildTree, hitBox, hitTriangle } from './mesh-edit.mjs';

const HELP = `stone-shade.mjs [options] <workfile.glb> [...]

Shades the stone of a model from scratch: every vertex in a stone band keeps
its cell of kits/colormap.png and its u, and gets a new v within the cell from
six terms, each from the model's own geometry. Other bands are left as they
are, but all geometry blocks light.

  height    lighter at the top of each piece, darker at its bottom
  facing    faces that look up lighter, faces that look down darker
  recess    darker where nearby geometry closes in around the surface
  overhang  darker where geometry sits right above
  trim      lighter where the surface stands out from the surface around it,
            darker where it is set back
  variety   a fixed shift per piece, so separate stones differ a little

Height, facing and trim only lighten as far as the surface is open, so a
ceiling inside an opening does not light up. A piece is a run of triangles
joined on shared positions. Distances scale with
the model's longest side.

  --cells <band,band>  stone bands to shade (default taupe,taupe-dark,ivory)
  --base <f>           v before the terms (default 0.42)
  --height <f>         top-to-bottom swing per piece (default 0.50)
  --up <f> --down <f>  facing shifts (default 0.16, 0.22)
  --recess <f>         weight of the recess term (default 0.95)
  --overhang <f>       weight of the overhang term (default 0.40)
  --trim <f>           weight of the trim term (default 0.40)
  --variety <f>        largest shift per piece (default 0.07)
  --reach <f>          short recess ray length, share of the longest side; the long
                       rays reach three times as far (default 0.10)
  --lift <f>           overhang ray length, share of the height (default 0.25)
  --step <f>           trim sample distance, share of the longest side (default 0.035)
  --centre <f>         share of the model's median shift taken back out, so a
                       model mostly in shade still keeps its light (default 0.5)
  --light <f> --dark <f>  v limits, reached softly (default 0.03, 0.94)
  --inset <f,f>        points between a vertex and the middle of its face where
                       recess, overhang and trim are measured and averaged, so a
                       big face is not judged by its corners (default 0.08,0.4,0.7)
  --only <term>        use only that term, to see what it does
  --dry                print the spread per term, write nothing`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BANDS = JSON.parse(readFileSync(resolve(ROOT, 'lint', 'materials.json'), 'utf8')).bands;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

function firstHit(tree, tris, o, d, far) {
  const inv = d.map((x) => 1 / x);
  let best = far;
  const stack = [tree.root];
  while (stack.length) {
    const node = stack.pop();
    if (!hitBox(node.b, o, inv, best)) continue;
    if (node.left) { stack.push(node.left, node.right); continue; }
    for (let i = node.start; i < node.end; i++) {
      const at = hitTriangle(o, d, tris[tree.order[i]]);
      if (at > 1e-7 && at < best) best = at;
    }
  }
  return best < far ? best : null;
}

function frame(n) {
  const t = norm(Math.abs(n[1]) < 0.9 ? cross(n, [0, 1, 0]) : cross(n, [1, 0, 0]));
  return [t, cross(n, t)];
}

const RECESS_RAYS = (() => {
  const out = [];
  const count = 32;
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt((i + 0.5) / count), phi = i * 2.399963;
    out.push([r * Math.cos(phi), r * Math.sin(phi), Math.sqrt(1 - r * r)]);
  }
  return out;
})();

const UP_RAYS = [[0, 1, 0], ...[0, 1, 2, 3, 4, 5].map((i) => {
  const a = (i * Math.PI) / 3, s = Math.sin(0.4);
  return [s * Math.cos(a), Math.cos(0.4), s * Math.sin(a)];
})];

function hash(x) {
  let h = 2166136261;
  for (const c of x) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

function shade(file, o) {
  const glb = readGlb(file);
  const stone = new Set(o.cells.map((b) => {
    if (!BANDS[b]) throw new Error(`no such band: ${b}`);
    return BANDS[b];
  }));
  const prims = editablePrimitives(glb.json);
  const world = [];
  for (const prim of prims) {
    const pos = readAccessor(glb, prim.attributes.POSITION).data;
    const m = primitiveMatrix(glb.json, prim);
    const count = pos.length / 3;
    const p = new Array(count);
    for (let i = 0; i < count; i++) {
      const [x, y, z] = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
      p[i] = [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
    }
    world.push({ prim, pos, p, idx: readAccessor(glb, prim.indices).data });
  }
  const tris = [];
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const w of world) {
    for (const q of w.p) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], q[k]); hi[k] = Math.max(hi[k], q[k]); }
    for (let t = 0; t < w.idx.length; t += 3) tris.push([w.p[w.idx[t]], w.p[w.idx[t + 1]], w.p[w.idx[t + 2]]]);
  }
  const size = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1;
  const height = hi[1] - lo[1] || size;
  const tree = buildTree(tris);
  const eps = 1e-4 * size;
  const reach = o.reach * size, lift = o.lift * height, step = o.step * size;

  const replaced = new Map();
  const spread = { height: [], facing: [], recess: [], overhang: [], trim: [], variety: [], v: [] };
  let moved = 0;
  const jobs = [];
  for (const { prim, pos, p, idx } of world) {
    const uvIndex = prim.attributes.TEXCOORD_0;
    if (uvIndex === undefined || glb.json.accessors[uvIndex].componentType !== 5126) continue;
    const uv = Float32Array.from(readAccessor(glb, uvIndex).data);
    const count = p.length;
    const cellOf = (i) => `${Math.floor(uv[2 * i] * 16)},${Math.floor(uv[2 * i + 1] * 4)}`;
    const isStone = new Uint8Array(count);
    let any = false;
    for (let i = 0; i < count; i++) if (stone.has(cellOf(i))) { isStone[i] = 1; any = true; }
    if (!any) continue;

    const faceN = new Array(count).fill(null).map(() => [0, 0, 0]);
    const faceC = new Array(count).fill(null).map(() => [0, 0, 0]);
    const faces = new Uint32Array(count);
    const { weld } = welder(pos);
    const point = Array.from({ length: count }, (_, i) => weld(i));
    const parent = new Map();
    const find = (a) => { while (parent.has(a) && parent.get(a) !== a) a = parent.get(a); return a; };
    const join = (a, b) => { a = find(a); b = find(b); if (a !== b) parent.set(a, b); };
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
      join(point[a], point[b]); join(point[b], point[c]);
      const n = cross(sub(p[b], p[a]), sub(p[c], p[a]));
      const cen = [0, 1, 2].map((k) => (p[a][k] + p[b][k] + p[c][k]) / 3);
      for (const v of [a, b, c]) { faceN[v] = add(faceN[v], n); faceC[v] = add(faceC[v], cen); faces[v]++; }
    }
    const span = new Map(), centre = new Map();
    for (let i = 0; i < count; i++) {
      const piece = find(point[i]);
      const s = span.get(piece) ?? [Infinity, -Infinity];
      span.set(piece, [Math.min(s[0], p[i][1]), Math.max(s[1], p[i][1])]);
      const c = centre.get(piece) ?? [0, 0, 0, 0];
      centre.set(piece, [c[0] + p[i][0], c[1] + p[i][1], c[2] + p[i][2], c[3] + 1]);
    }
    const shift = new Map();
    for (const [piece, c] of centre) {
      const key = c.slice(0, 3).map((x) => Math.round((x / c[3]) / (0.01 * size))).join(',');
      shift.set(piece, (hash(key) * 2 - 1) * o.variety);
    }

    for (let i = 0; i < count; i++) {
      if (!isStone[i]) continue;
      const n = norm(faceN[i]);
      const w = faces[i] || 1;
      const toward = sub(faceC[i].map((x) => x / w), p[i]);
      const piece = find(point[i]);
      const [low, high] = span.get(piece);
      const h = high - low > 1e-9 ? (high - p[i][1]) / (high - low) : 0.5;
      const hTerm = o.height * (h - 0.5);
      const fTerm = n[1] > 0 ? -o.up * n[1] : o.down * -n[1];
      const [t1, t2] = frame(n);

      let closed = 0, cover = 0, relief = 0, rays = 0, ups = 0, samples = 0;
      for (const f of o.inset) {
        const inner = add(p[i], toward, f);
        const from = add(inner, n, eps * 10);
        for (const r of RECESS_RAYS) {
          const d = norm(add(add([t1[0] * r[0], t1[1] * r[0], t1[2] * r[0]], t2, r[1]), n, r[2]));
          const at = firstHit(tree, tris, from, d, reach * 3);
          if (at !== null) closed += Math.max(0, 1 - at / reach) + (1 - at / (reach * 3));
          rays += 2;
        }
        if (n[1] > -0.5) {
          for (const d of UP_RAYS) {
            if (d[0] * n[0] + d[1] * n[1] + d[2] * n[2] < -0.02) continue;
            const at = firstHit(tree, tris, add(from, n, eps * 40), d, lift);
            if (at !== null) cover += 1 - (at / lift) * 0.5;
            ups++;
          }
        }
        for (let k = 0; k < 8; k++) {
          const a = (k * Math.PI) / 4;
          const lat = norm(add([t1[0] * Math.cos(a), t1[1] * Math.cos(a), t1[2] * Math.cos(a)], t2, Math.sin(a)));
          for (const s of [step, step * 2.5]) {
            const top = add(add(inner, lat, s), n, s * 2);
            const at = firstHit(tree, tris, top, [-n[0], -n[1], -n[2]], s * 4);
            const out = at === null ? -2 * s : s * 2 - at;
            relief += Math.max(-1, Math.min(1, out / s));
            samples++;
          }
        }
      }
      const occ = Math.min(1, closed / rays * 2);
      const rTerm = o.recess * (closed / rays);
      const oTerm = ups ? o.overhang * (cover / (UP_RAYS.length * o.inset.length)) : 0;
      const tTerm = o.trim * (relief / samples);

      const vTerm = shift.get(piece);
      const open = (x) => (x < 0 ? x * (1 - occ) : x);
      jobs.push({ uv, i, terms: [open(hTerm), open(fTerm), rTerm, oTerm, open(tTerm), vTerm] });
    }
    replaced.set(uvIndex, uv);
  }
  const NAMES = ['height', 'facing', 'recess', 'overhang', 'trim', 'variety'];
  const middle = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[b.length >> 1] : 0; };
  const trimMean = jobs.reduce((s, j) => s + j.terms[4], 0) / (jobs.length || 1);
  for (const j of jobs) j.terms[4] -= trimMean;
  const sums = jobs.map((j) => j.terms.reduce((s, x, t) => s + (!o.only || o.only === NAMES[t] ? x : 0), 0));
  const centre = o.centre * middle(sums);
  const mid = (o.light + o.dark) / 2, half = (o.dark - o.light) / 2;
  jobs.forEach((j, k) => {
    const v = mid + half * Math.tanh((o.base + sums[k] - centre - mid) / half);
    NAMES.forEach((name, t) => spread[name].push(j.terms[t]));
    spread.v.push(v);
    const row = Math.floor(j.uv[2 * j.i + 1] * 4);
    j.uv[2 * j.i + 1] = (row + v) / 4;
    moved++;
  });
  for (const [index, uv] of replaced) replaced.set(index, Buffer.from(uv.buffer));
  if (o.dry) {
    for (const [k, a] of Object.entries(spread)) {
      if (!a.length) continue;
      a.sort((x, y) => x - y);
      console.log(`  ${k.padEnd(9)} p5 ${a[Math.floor(a.length * 0.05)].toFixed(2)}  median ${a[a.length >> 1].toFixed(2)}  p95 ${a[Math.floor(a.length * 0.95)].toFixed(2)}`);
    }
  } else if (moved) {
    repack(glb, replaced);
    fixBounds(glb);
    writeGlb(file, glb.json, glb.bin, writeFileSync);
  }
  return moved;
}

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) {
  console.log(HELP);
  process.exit(0);
}
const take = (flag, fallback) => {
  const i = args.indexOf(flag);
  if (i < 0) return fallback;
  const value = args[i + 1];
  args.splice(i, 2);
  return typeof fallback === 'number' ? Number(value) : value;
};
const o = {
  cells: take('--cells', 'taupe,taupe-dark,ivory').split(','),
  base: take('--base', 0.42), height: take('--height', 0.50),
  up: take('--up', 0.16), down: take('--down', 0.22),
  recess: take('--recess', 0.95), overhang: take('--overhang', 0.40),
  trim: take('--trim', 0.40), variety: take('--variety', 0.07),
  reach: take('--reach', 0.10), lift: take('--lift', 0.25), step: take('--step', 0.035),
  inset: take('--inset', '0.08,0.4,0.7').split(',').map(Number),
  centre: take('--centre', 0.5), light: take('--light', 0.03), dark: take('--dark', 0.94),
  only: take('--only', ''),
  dry: args.includes('--dry'),
};
for (const file of args.filter((a) => !a.startsWith('--'))) console.log(`${file}: ${shade(file, o)} vertices`);
