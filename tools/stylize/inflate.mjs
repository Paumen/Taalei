import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadModel, saveModel, bounds, weldedNormals } from './mesh.mjs';

const HELP = `inflate.mjs <batch.json> [name,...]

Pushes every surface of each model outward along its welded vertex normal by
k times the model's second-largest side, then scales it back to its old longest
side, from the batch's "out" folder into its "inflated" folder. Walls, rims,
rods and edges get fuller and softer; outer size stays. Gaps narrow by twice
the push, so holes, slots, tines and joints can close.

batch.json, next to the keys stylize.mjs reads:
  "inflate": { "default": 0.03, "models": { name: k } }
  "inflateUv": { name: { "u": 0.406, "tol": 0.02 } }
    pushes only vertices whose texture u lies within tol of u, so one
    material of a model gets fuller and the rest keeps its shape.`;

const [file, only] = process.argv.slice(2);
if (!file || file === '--help') { console.log(HELP); process.exit(file ? 0 : 1); }
const B = JSON.parse(readFileSync(file, 'utf8'));
const conf = B.inflate ?? {};
mkdirSync(B.inflated, { recursive: true });

for (const n of only ? only.split(',') : Object.keys(B.models)) {
  const model = loadModel(join(B.out, `${n}.glb`));
  const { P, F, UV } = model;
  const b = bounds(P);
  const L = Math.max(...b.size);
  const k = conf.models?.[n] ?? conf.default ?? 0.03;
  const push = k * [...b.size].sort((x, y) => x - y)[1];
  const mask = B.inflateUv?.[n];
  const G = weldedNormals(P, F);
  const Q = P.slice();
  for (let v = 0; v < P.length / 3; v++) {
    if (mask && Math.abs(UV[v * 2] - mask.u) >= mask.tol) continue;
    for (let a = 0; a < 3; a++) Q[v * 3 + a] += G[v * 3 + a] * push;
  }
  const g = L / Math.max(...bounds(Q).size);
  const centre = [(b.min[0] + b.max[0]) / 2, 0, (b.min[2] + b.max[2]) / 2];
  saveModel(model, Q, null, g, centre, join(B.inflated, `${n}.glb`));
  console.log(JSON.stringify({ n, k }));
}
