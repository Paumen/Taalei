import { readFileSync, writeFileSync } from 'node:fs';
import { loadMesh, faceWall, directions, isVisible, extentOf, catalogModel, catalogModels, g27, targetOf, measure } from './lib.mjs';
import { dot } from '../import/mesh-edit.mjs';

const HELP = `triage.mjs [kit/name ...] [--kit <kit>] [--from <dir>] [--out <triage.json>]
Sorts thin-part models (lint G27) for the lod quick pass, with no renders. Per
model: the target wall (the kind's thin.min, at least 0.006), how much of the
thin area is hidden inside the model, what the thin part is (flat, sheet,
shell, local spot), and the route:
  hidden   walls hidden inside: drop the hidden faces first
  tool     thicken modes in the listed order, next only when one fails
  careful  straight to a sub agent (blade or point, type detail, or a PO
           verdict that asks for something)
A model thin all over gets a whole-model scale-up as its last mode.
Without names, every G27 model (of --kit) is sorted. --from reads the glbs
from <dir>/<kit>/<name>.glb instead of kits/workfiles.`;

const MODES = {
  flat: ['--flat', '--sheet', '--local'],
  sheet: ['--sheet', '--flat', '--local'],
  shell: ['--inward', '--inward --radial', '--sheet --inward', '--sheet', '--local'],
  local: ['--local', '--local --away', '--sheet --local'],
  other: ['', '--local', '--sheet'],
};
const SHARP = /knife|blade|sword|dagger|spear|arrow|axe|razor|scissor|cleaver|sickle|scythe|katana|machete|needle|saber|sabre|halberd|glaive|shuriken|kunai|scalpel/;
const DETAIL = /sign|letter|number|dart-?board|string|thread|rope|cord|chain|wire|spring|cable|harp|guitar|violin|banjo/;

const args = process.argv.slice(2);
if (args.includes('--help')) { console.log(HELP); process.exit(0); }
const opt = (k) => { const i = args.indexOf(k); return i < 0 ? null : args[i + 1]; };
const named = args.filter((a, i) => !a.startsWith('--') && !['--kit', '--out', '--from'].includes(args[i - 1]));
const kit = opt('--kit');

const verdicts = new Map();
for (const v of JSON.parse(readFileSync('tools/review/log.json', 'utf8'))) verdicts.set(v.model, v);

const ids = named.length ? named : catalogModels()
  .filter((m) => (!kit || m.kit === kit) && g27(m).length)
  .map((m) => `${m.kit}/${m.name}`);

function principal(tris) {
  let v = [0.3, 0.8, 0.5];
  for (let it = 0; it < 30; it++) {
    const n = [0, 0, 0];
    for (const t of tris) { const s = dot(t.n, v) * t.area; for (let k = 0; k < 3; k++) n[k] += t.n[k] * s; }
    const l = Math.hypot(...n) || 1;
    v = n.map((x) => x / l);
  }
  return v;
}

function shapeOf(part, thinArea, target) {
  const area = part.reduce((s, t) => s + t.area, 0);
  if (thinArea < 0.25 * area) return 'local';
  const axis = principal(part);
  const planar = part.filter((t) => Math.abs(dot(t.n, axis)) > 0.9).reduce((s, t) => s + t.area, 0) / area;
  const along = part.flatMap((t) => t.p.map((p) => dot(p, axis)));
  const span = Math.max(...along) - Math.min(...along);
  const pts = part.flatMap((t) => t.p);
  const size = [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k])) - Math.min(...pts.map((p) => p[k])));
  const across = size.sort((a, b) => b - a)[1];
  if (planar > 0.6 && span < 0.25 * across) return 'flat';
  if (size[2] > 3 * target) return 'shell';
  return 'sheet';
}

const rows = [];
for (const id of ids) {
  const model = catalogModel(id);
  if (!model) { console.error(`not in catalogue: ${id}`); continue; }
  const target = targetOf(model);
  const file = `${opt('--from') ?? 'kits/workfiles'}/${id}.glb`;
  const now = { ...model, ...measure(file) };
  const mesh = loadMesh(file);
  const thin = mesh.tris.filter((t) => faceWall(mesh, t) < target);
  const total = mesh.tris.reduce((s, t) => s + t.area, 0);
  const thinArea = thin.reduce((s, t) => s + t.area, 0);
  const dirs = directions(256);
  const far = extentOf(mesh).diag * 2;
  const hiddenArea = thin.filter((t) => !isVisible(mesh, t, dirs, far)).reduce((s, t) => s + t.area, 0);
  const byPart = new Map();
  for (const t of thin) byPart.set(t.part, (byPart.get(t.part) ?? 0) + t.area);
  const [partId, partThin] = [...byPart].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  const shape = partId === null ? 'other' : shapeOf(mesh.parts.get(partId), partThin, target);
  const hidden = thinArea ? hiddenArea / thinArea : 0;
  const words = `${model.name} ${model.kind}`;
  if (!g27(now).length) { console.log(`ok      -     ${id.padEnd(44)} no G27 finding`); continue; }
  const last = verdicts.get(id);
  let route = hidden >= 0.8 ? 'hidden' : 'tool';
  let why = '';
  if (route === 'tool') {
    if (SHARP.test(words)) [route, why] = ['careful', 'blade or point'];
    else if (DETAIL.test(words)) [route, why] = ['careful', 'type detail (lettering, strings)'];
  }
  if (last && last.verdict !== 'keep') [route, why] = ['careful', `PO ${last.verdict}${last.comment ? `: ${last.comment}` : ''}`];
  rows.push({
    id, kind: model.kind, target, minWall: now.minWall, minTube: now.minTube,
    findings: g27(now).map((f) => `${f.level} ${f.field} ${f.actual}`),
    thinShare: +(thinArea / total).toFixed(3), hiddenShare: +hidden.toFixed(3),
    shape, route, why, modes: route === 'careful' ? [] : [...MODES[shape], ...(thinArea > 0.7 * total ? ['scale'] : [])],
  });
  const r = rows[rows.length - 1];
  console.log(`${r.route.padEnd(7)} ${r.shape.padEnd(5)} ${id.padEnd(44)} wall ${String(r.minWall).padEnd(6)} target ${r.target}  hidden ${Math.round(r.hiddenShare * 100)}%${r.why ? `  ${r.why}` : ''}`);
}
const count = (k) => rows.filter((r) => r.route === k).length;
console.log(`\n${rows.length} models: ${count('hidden')} hidden, ${count('tool')} tool, ${count('careful')} careful`);
if (opt('--out')) writeFileSync(opt('--out'), JSON.stringify(rows, null, 1));
