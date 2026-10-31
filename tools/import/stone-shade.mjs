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

A face is a run of stone triangles in one plane that touch at least at a
corner. Recess, overhang and trim are
measured at points spread over each face and fitted with a straight ramp by
height (upright faces) or one tone (flat faces), so a face reads clean and a vertex is never coloured
by geometry far from it. A vertex shared by faces takes their mean.

  height    lighter at the top of each solid column, darker toward its foot,
            the dark end softer than the light end. A column runs from a
            point straight up and down through the stone, and through stone
            that touches it, to where it ends, so a tower, a wall or a stack
            of courses each ramp as one
  facing    faces that look up lighter, faces that look down darker
  recess    darker where nearby geometry closes in around the surface, less so
            on faces that look up
  overhang  darker where geometry sits right above
  trim      lighter where the surface stands out from the surface around it,
            darker where it is set back
  variety   a fixed shift per piece, so separate stones differ a little

Facing and trim only lighten as far as the surface is open. A piece is a run of triangles
joined on shared positions. Distances scale with
the model's longest side.

  --cells <band,band>  stone bands to shade (default taupe,taupe-dark,ivory)
  --base <f>           v before the terms (default 0.42)
  --height <f>         top-to-bottom swing per column (default 0.70)
  --up <f> --down <f>  facing shifts (default 0.16, 0.12)
  --recess <f>         weight of the recess term (default 0.95)
  --overhang <f>       weight of the overhang term (default 0.60)
  --trim <f>           weight of the trim term (default 0.40)
  --variety <f>        largest shift per piece (default 0.07)
  --reach <f>          short recess ray length, share of the longest side; the long
                       rays reach three times as far (default 0.10)
  --lift <f>           overhang ray length, share of the height (default 0.15)
  --step <f>           trim sample distance, share of the longest side (default 0.035)
  --centre <f>         share of the model's median shift taken back out, so a
                       model mostly in shade still keeps its light (default 0.5)
  --light <f> --dark <f>  v limits, reached softly (default 0.03, 0.94)
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

function allHits(tree, tris, normals, o, d, far) {
  const inv = d.map((x) => 1 / x);
  const out = [];
  const stack = [tree.root];
  while (stack.length) {
    const node = stack.pop();
    if (!hitBox(node.b, o, inv, far)) continue;
    if (node.left) { stack.push(node.left, node.right); continue; }
    for (let i = node.start; i < node.end; i++) {
      const t = tree.order[i];
      const at = hitTriangle(o, d, tris[t]);
      const n = normals[t];
      if (at > 1e-7 && at < far) out.push([at, n[0] * d[0] + n[1] * d[1] + n[2] * d[2]]);
    }
  }
  return out.sort((a, b) => a[0] - b[0]);
}

function runOut(tree, tris, normals, o, d, far, gap) {
  const hits = allHits(tree, tris, normals, o, d, far);
  let depth = 1;
  for (let k = 0; k < hits.length; k++) {
    depth += hits[k][1] > 0 ? -1 : 1;
    if (depth > 0) continue;
    const next = hits[k + 1];
    if (next && next[1] < 0 && next[0] - hits[k][0] < gap) continue;
    return hits[k][0];
  }
  return null;
}

function column(tree, tris, normals, at, n, eps, size) {
  const inside = add(at, n, -eps * 40);
  const along = Math.abs(n[1]) > 0.7 ? [0, 1, 0] : norm(add([0, 1, 0], n, -n[1]));
  const up = runOut(tree, tris, normals, inside, along, size * 3, 0.01 * size);
  const down = runOut(tree, tris, normals, inside, along.map((x) => -x), size * 3, 0.01 * size);
  if (up === null || down === null || up + down < eps * 50) return null;
  return up / (up + down);
}

function measure(tree, tris, normals, at, n, eps, reach, lift, step, size, fallback) {
  const [t1, t2] = frame(n);
  const from = add(at, n, eps * 10);
  let closed = 0;
  for (const r of RECESS_RAYS) {
    const d = norm(add(add([t1[0] * r[0], t1[1] * r[0], t1[2] * r[0]], t2, r[1]), n, r[2]));
    const hit = firstHit(tree, tris, from, d, reach * 3);
    if (hit !== null) closed += Math.max(0, 1 - hit / reach) + (1 - hit / (reach * 3));
  }
  let cover = 0;
  if (n[1] > -0.5) {
    for (const d of UP_RAYS) {
      if (d[0] * n[0] + d[1] * n[1] + d[2] * n[2] < -0.02) continue;
      const hit = firstHit(tree, tris, add(from, n, eps * 40), d, lift);
      if (hit !== null) cover += 1 - hit / lift;
    }
  }
  let relief = 0, samples = 0;
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const lat = norm(add([t1[0] * Math.cos(a), t1[1] * Math.cos(a), t1[2] * Math.cos(a)], t2, Math.sin(a)));
    for (const s of [step, step * 2.5]) {
      const top = add(add(at, lat, s), n, s * 2);
      const hit = firstHit(tree, tris, top, [-n[0], -n[1], -n[2]], s * 4);
      const out = hit === null ? -2 * s : s * 2 - hit;
      relief += Math.max(-1, Math.min(1, out / s));
      samples++;
    }
  }
  return [closed / (RECESS_RAYS.length * 2), cover / UP_RAYS.length, relief / samples, column(tree, tris, normals, at, n, eps, size) ?? fallback(at)];
}

function fitLine(points, upright) {
  const width = points[0].y.length;
  const lo = new Array(width).fill(Infinity), hi = new Array(width).fill(-Infinity);
  let sw = 0, sx = 0, sxx = 0;
  const sy = new Array(width).fill(0), sxy = new Array(width).fill(0);
  for (const { h, y, weight } of points) {
    sw += weight; sx += weight * h; sxx += weight * h * h;
    y.forEach((v, k) => { sy[k] += weight * v; sxy[k] += weight * h * v; lo[k] = Math.min(lo[k], v); hi[k] = Math.max(hi[k], v); });
  }
  const d = sw * sxx - sx * sx;
  const coef = sy.map((_, k) => {
    if (!upright || Math.abs(d) < 1e-12 * Math.max(1, sw * sw)) return [sy[k] / sw, 0];
    const b = (sw * sxy[k] - sx * sy[k]) / d;
    return [(sy[k] - b * sx) / sw, b];
  });
  return (h) => coef.map(([a, b], k) => Math.max(lo[k], Math.min(hi[k], a + b * h)));
}

const SPOTS = [[1 / 3, 1 / 3, 1 / 3], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6]];

function shade(file, o) {
  const glb = readGlb(file);
  const stone = new Set(o.cells.map((b) => {
    if (!BANDS[b]) throw new Error(`no such band: ${b}`);
    return BANDS[b];
  }));
  const world = [];
  for (const prim of editablePrimitives(glb.json)) {
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
  const tris = [], normals = [];
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const w of world) {
    for (const q of w.p) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], q[k]); hi[k] = Math.max(hi[k], q[k]); }
    for (let t = 0; t < w.idx.length; t += 3) {
      const tri = [w.p[w.idx[t]], w.p[w.idx[t + 1]], w.p[w.idx[t + 2]]];
      tris.push(tri);
      normals.push(norm(cross(sub(tri[1], tri[0]), sub(tri[2], tri[0]))));
    }
  }
  const size = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1;
  const height = hi[1] - lo[1] || size;
  const tree = buildTree(tris);
  const eps = 1e-4 * size;
  const reach = o.reach * size, lift = o.lift * height, step = o.step * size;

  const replaced = new Map();
  const spread = { height: [], facing: [], recess: [], overhang: [], trim: [], variety: [], v: [] };
  const jobs = [];
  for (const { prim, pos, p, idx } of world) {
    const uvIndex = prim.attributes.TEXCOORD_0;
    if (uvIndex === undefined || glb.json.accessors[uvIndex].componentType !== 5126) continue;
    const uv = Float32Array.from(readAccessor(glb, uvIndex).data);
    const count = p.length;
    const isStone = new Uint8Array(count);
    for (let i = 0; i < count; i++) if (stone.has(`${Math.floor(uv[2 * i] * 16)},${Math.floor(uv[2 * i + 1] * 4)}`)) isStone[i] = 1;
    if (!isStone.some((x) => x)) continue;

    const { weld } = welder(pos);
    const point = Array.from({ length: count }, (_, i) => weld(i));
    const unions = () => {
      const parent = new Map();
      const find = (a) => { while (parent.has(a) && parent.get(a) !== a) a = parent.get(a); return a; };
      const join = (a, b) => { a = find(a); b = find(b); if (a !== b) parent.set(a, b); };
      return { find, join };
    };
    const pieces = unions();
    for (let t = 0; t < idx.length; t += 3) { pieces.join(point[idx[t]], point[idx[t + 1]]); pieces.join(point[idx[t + 1]], point[idx[t + 2]]); }
    const span = new Map(), centre = new Map();
    for (let i = 0; i < count; i++) {
      const piece = pieces.find(point[i]);
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

    const triN = [], triArea = [], stoneTris = [];
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
      const n = cross(sub(p[b], p[a]), sub(p[c], p[a]));
      const area = Math.hypot(...n) / 2;
      triN[t / 3] = norm(n); triArea[t / 3] = area;
      if (isStone[a] && isStone[b] && isStone[c] && area > 0) stoneTris.push(t / 3);
    }
    const faces = unions();
    const corners = new Map();
    const plane = (f) => { const q = p[idx[3 * f]], n = triN[f]; return q[0] * n[0] + q[1] * n[1] + q[2] * n[2]; };
    for (const f of stoneTris) {
      for (let e = 0; e < 3; e++) {
        const key = point[idx[3 * f + e]];
        for (const g of corners.get(key) ?? []) {
          const n = triN[f], m = triN[g];
          if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] > 0.995 && Math.abs(plane(f) - plane(g)) < 1e-3 * size) faces.join(`t${f}`, `t${g}`);
        }
        if (!corners.has(key)) corners.set(key, []);
        corners.get(key).push(f);
      }
    }
    const pieceHeight = (q, i) => {
      const [low, high] = span.get(pieces.find(point[i]));
      return high - low > 1e-9 ? (high - q[1]) / (high - low) : 0.5;
    };
    const groups = new Map();
    for (const f of stoneTris) {
      const root = faces.find(`t${f}`);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(f);
    }
    const perVertex = Array.from({ length: count }, () => []);
    for (const members of groups.values()) {
      let N = [0, 0, 0];
      for (const f of members) N = add(N, triN[f], triArea[f]);
      N = norm(N);
      const points = [];
      for (const f of members) {
        const [A, B, C] = [p[idx[3 * f]], p[idx[3 * f + 1]], p[idx[3 * f + 2]]];
        for (const [x, y, z] of SPOTS) {
          const at = [0, 1, 2].map((k) => A[k] * x + B[k] * y + C[k] * z);
          points.push({ h: at[1], y: measure(tree, tris, normals, at, N, eps, reach, lift, step, size, (q) => pieceHeight(q, idx[3 * f])), weight: triArea[f] / SPOTS.length });
        }
      }
      const upright = Math.abs(N[1]) < 0.7;
      const fit = fitLine(points, upright);
      const occ = Math.min(1, (points.reduce((s, q) => s + q.weight * q.y[0], 0) / points.reduce((s, q) => s + q.weight, 0)) * 2);
      const facing = N[1] > 0 ? -o.up * N[1] : o.down * -N[1];
      const done = new Set();
      for (const f of members) for (let k = 0; k < 3; k++) {
        const i = idx[3 * f + k];
        if (done.has(i)) continue;
        done.add(i);
        const [closed, cover, relief, h] = fit(p[i][1]);
        perVertex[i].push([facing, o.recess * closed * (1 - 0.6 * Math.max(0, N[1])), o.overhang * cover, o.trim * relief, occ, o.height * (Math.sqrt(Math.max(0, h)) - 0.6)]);
      }
    }

    for (let i = 0; i < count; i++) {
      if (!isStone[i] || !perVertex[i].length) continue;
      const mean = [0, 1, 2, 3, 4, 5].map((k) => perVertex[i].reduce((s, x) => s + x[k], 0) / perVertex[i].length);
      const [fTerm, rTerm, oTerm, tTerm, occ, hTerm] = mean;
      const piece = pieces.find(point[i]);
      const open = (x) => (x < 0 ? x * (1 - occ) : x);
      jobs.push({ uv, i, terms: [hTerm, open(fTerm), rTerm, oTerm, open(tTerm), shift.get(piece)] });
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
  let moved = 0;
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
  base: take('--base', 0.42), height: take('--height', 0.70),
  up: take('--up', 0.16), down: take('--down', 0.12),
  recess: take('--recess', 0.95), overhang: take('--overhang', 0.60),
  trim: take('--trim', 0.40), variety: take('--variety', 0.07),
  reach: take('--reach', 0.10), lift: take('--lift', 0.15), step: take('--step', 0.035),
  centre: take('--centre', 0.5), light: take('--light', 0.03), dark: take('--dark', 0.94),
  only: take('--only', ''),
  dry: args.includes('--dry'),
};
for (const file of args.filter((a) => !a.startsWith('--'))) console.log(`${file}: ${shade(file, o)} vertices`);
