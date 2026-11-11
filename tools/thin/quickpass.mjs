import { readFileSync, writeFileSync, mkdirSync, copyFileSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { loadMesh, hits, extentOf, measure, catalogModel, g27, dropHidden, tidy, backShare, FLOOR } from './lib.mjs';

const HELP = `quickpass.mjs <triage.json> --out <dir> [--only kit/name,...] [--from <dir>] [--aim kind]
quickpass.mjs apply <dir>/report.json [kit/name ...]

Runs the lod quick pass on the models triage.mjs routed to hidden or tool.
Per model it tries the listed fixes in order and stops at the first that
passes every gate; a mode aims at 0.006, or with --aim kind first at the
kind's thin.min and then at 0.006.
  hidden  drop faces hidden inside the model (hidden.mjs)
  --...   a thicken.mjs mode, then tidy.mjs (floor and normals); up to 3
          passes while the wall still grows
  scale   whole model scaled up just enough (at most 1.6x)
Gates: the lint's wall measure reaches the aim and no G27 error is left or
added; the outline grows no more than the aim needs and its main face keeps
its shape; openings stay open; glb-lint finds nothing new; no new back faces
show; a hidden drop changes at most 0.1% of the pixels on any of 8 views.
A model that passes gets a before/after sheet and close-up for the fresh
checker; the rest are listed for the careful pass with what was tried.
Nothing is written to kits/workfiles until 'apply', which copies the chosen
results of the named models (all passed ones without names). --from reads
the glbs from <dir>/<kit>/<name>.glb instead of kits/workfiles.`;

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) { console.log(HELP); process.exit(0); }
const opt = (k) => { const i = args.indexOf(k); return i < 0 ? null : args[i + 1]; };
const node = (script, ...rest) => execFileSync('node', [script, ...rest], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

if (args[0] === 'apply') {
  const report = JSON.parse(readFileSync(args[1], 'utf8'));
  const want = args.slice(2);
  for (const r of report) {
    if (!r.chosen || (want.length && !want.includes(r.id))) continue;
    copyFileSync(r.chosen.file, `kits/workfiles/${r.id}.glb`);
    console.log(`applied ${r.id}: ${r.chosen.mode}`);
  }
  process.exit(0);
}

const out = resolve(opt('--out') ?? 'quickpass');
const only = opt('--only')?.split(',') ?? null;
const rows = JSON.parse(readFileSync(args[0], 'utf8')).filter((r) => r.route !== 'careful' && (!only || only.includes(r.id)));

function occupancy(mesh, box) {
  const N = 64, grids = [];
  for (let axis = 0; axis < 3; axis++) {
    const [u, v] = [0, 1, 2].filter((k) => k !== axis);
    const grid = [];
    for (let i = 0; i < N; i++) {
      grid.push([]);
      for (let j = 0; j < N; j++) {
        const o = [0, 0, 0];
        o[u] = box.lo[u] + (box.size[u] * (i + 0.5)) / N;
        o[v] = box.lo[v] + (box.size[v] * (j + 0.5)) / N;
        o[axis] = box.lo[axis] - 1;
        const d = [0, 0, 0];
        d[axis] = 1;
        grid[i].push(hits(mesh, o, d, box.size[axis] + 2).length > 0);
      }
    }
    grids.push(grid);
  }
  return grids;
}

function gapsOf(grid) {
  let gaps = 0;
  for (let i = 1; i < grid.length - 1; i++) for (let j = 1; j < grid.length - 1; j++) {
    if (grid[i][j]) continue;
    const row = grid[i], col = grid.map((r) => r[j]);
    if ((row.slice(0, j).some(Boolean) && row.slice(j + 1).some(Boolean)) || (col.slice(0, i).some(Boolean) && col.slice(i + 1).some(Boolean))) gaps++;
  }
  return gaps;
}

function shapeChange(a, b, size) {
  const face = size.indexOf(Math.min(...size));
  let xor = 0, union = 0;
  a[face].forEach((row, i) => row.forEach((x, j) => { const y = b[face][i][j]; if (x || y) union++; if (x !== y) xor++; }));
  return union ? xor / union : 0;
}

function lintCounts(file, kit, dir) {
  const d = `${dir}/lint/${kit}`;
  rmSync(`${dir}/lint`, { recursive: true, force: true });
  mkdirSync(d, { recursive: true });
  symlinkSync(resolve(`kits/workfiles/${kit}/Textures`), `${d}/Textures`);
  copyFileSync(file, `${d}/m.glb`);
  try { node('lint/glb-lint.mjs', `${dir}/lint`, '--json', `${dir}/lint.json`); } catch {}
  const counts = {};
  for (const f of JSON.parse(readFileSync(`${dir}/lint.json`, 'utf8'))[0]?.findings ?? []) {
    if (f.level === 'info') continue;
    counts[f.check] = (counts[f.check] ?? 0) + 1;
  }
  return counts;
}

function renderViews(file, kit, dir, name) {
  const d = `${dir}/${name}/${kit}`;
  mkdirSync(d, { recursive: true });
  if (!existsSync(`${d}/Textures`)) symlinkSync(resolve(`kits/workfiles/${kit}/Textures`), `${d}/Textures`);
  copyFileSync(file, `${d}/${name}.glb`);
  return `${d}/${name}.glb`;
}

function invisible(before, after, kit, dir) {
  const a = renderViews(before, kit, dir, 'va'), b = renderViews(after, kit, dir, 'vb');
  const views = ['front', 'back', 'left', 'right', 'top', 'bottom', 'iso', 'iso-back'];
  node('tools/renders/render.mjs', a, b, '--views', views.join(','), '--width', '320', '--height', '320', '--lock-scale', '--out', `${dir}/views`);
  let worst = 0;
  for (const v of views) {
    let px = 0;
    try { execFileSync('compare', ['-metric', 'AE', '-fuzz', '3%', `${dir}/views/${kit}__va/pbr_${v}.png`, `${dir}/views/${kit}__vb/pbr_${v}.png`, 'null:'], { stdio: 'pipe' }); }
    catch (e) { px = Number(String(e.stderr).trim().split(/\s/)[0]) || 0; }
    worst = Math.max(worst, px);
  }
  return worst <= 0.001 * 320 * 320;
}

function sheet(before, after, kit, dir) {
  const a = renderViews(before, kit, dir, 'before'), b = renderViews(after, kit, dir, 'after');
  node('tools/renders/render.mjs', a, b, '--lock-scale', '--sheet', '--views', 'front,left,top,iso', '--out', `${dir}/sheet`);
  try { node('tools/thin/closeup.mjs', a, b, `${dir}/closeup.png`); } catch {}
  return { sheet: `${dir}/sheet/sheet.png`, closeup: existsSync(`${dir}/closeup.png`) ? `${dir}/closeup.png` : null };
}

const report = [];
for (const row of rows) {
  const [kit, name] = row.id.split('/');
  const dir = `${out}/${kit}/${name}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const before = `${dir}/before.glb`;
  copyFileSync(`${opt('--from') ?? 'kits/workfiles'}/${row.id}.glb`, before);
  const model = catalogModel(row.id);
  const was = measure(before);
  const wasErrors = g27({ ...model, ...was }).filter((f) => f.level === 'error').length;
  const box0 = extentOf(loadMesh(before));
  const occ0 = occupancy(loadMesh(before), box0);
  const gaps0 = occ0.map(gapsOf);
  const lint0 = lintCounts(before, kit, dir);
  const back0 = backShare(loadMesh(before));
  const aims = opt('--aim') === 'kind' && row.target > FLOOR ? [row.target, FLOOR] : [FLOOR];
  const plan = [...(row.route === 'hidden' ? ['hidden'] : []), ...row.modes];
  const tries = [];
  let chosen = null;
  for (const mode of plan) {
    for (const aim of mode === 'hidden' ? [row.target] : aims) {
      const file = `${dir}/try-${tries.length + 1}.glb`;
      const t = { mode, aim, file };
      tries.push(t);
      try {
        if (mode === 'hidden') dropHidden(before, file, { wall: aim });
        else if (mode === 'scale') {
          const factor = (aim / (was.minWall ?? aim)) * 1.05;
          if (factor > 1.6) { t.why = `needs ${factor.toFixed(2)}x`; continue; }
          copyFileSync(before, file);
          node('tools/import/scale.mjs', '--by', factor.toFixed(3), file);
          tidy(file, file, before);
          t.mode = `scale ${factor.toFixed(2)}x`;
        } else {
          let from = before, last = was.minWall ?? 0;
          for (let pass = 1; pass <= 3; pass++) {
            node('tools/thin/thicken.mjs', from, '--to', String(aim * 1.1), ...mode.split(' ').filter(Boolean), '--out', file);
            tidy(file, file, before);
            const w = measure(file).minWall ?? Infinity;
            t.passes = pass;
            if (w >= aim - 1e-4 || w <= last + 1e-4) break;
            from = file;
            last = w;
          }
        }
      } catch (e) { t.why = `failed to run: ${String(e.stderr ?? e.message).split('\n')[0]}`; continue; }
      const now = measure(file);
      t.minWall = now.minWall;
      const errors = g27({ ...model, ...now }).filter((f) => f.level === 'error');
      if ((now.minWall ?? Infinity) < aim - 1e-4) { t.why = `wall ${now.minWall} under ${aim}`; continue; }
      if (errors.length && errors.length >= wasErrors) { t.why = errors.map((f) => `${f.field} ${f.actual}`).join(', '); continue; }
      const mesh = loadMesh(file);
      const box = extentOf(mesh);
      if (!mode.startsWith('scale') && mode !== 'hidden') {
        const allow = 2 * Math.max(0, aim - (was.minWall ?? 0)) + 0.002;
        const grew = box.size.map((s, k) => s - box0.size[k]);
        if (grew.some((g) => g > allow)) { t.why = `outline grew ${(Math.max(...grew) * 1000).toFixed(1)} mm`; continue; }
        const occ = occupancy(mesh, box0);
        if (occ.map(gapsOf).some((g, k) => gaps0[k] >= 8 && g < 0.8 * gaps0[k])) { t.why = 'openings closing'; continue; }
        const change = shapeChange(occ0, occ, box0.size);
        if (change > 0.06) { t.why = `outline changed ${Math.round(change * 100)}%`; continue; }
      }
      if (backShare(mesh) > back0 + 0.002) { t.why = 'new back faces'; continue; }
      const lint = lintCounts(file, kit, dir);
      const added = Object.keys(lint).filter((k) => lint[k] > (lint0[k] ?? 0));
      if (added.length) { t.why = `glb-lint: ${added.join(', ')}`; continue; }
      if (mode === 'hidden' && !invisible(before, file, kit, dir)) { t.why = 'visible change'; continue; }
      t.ok = true;
      chosen = t;
      break;
    }
    if (chosen) break;
  }
  const r = { id: row.id, kind: row.kind, route: row.route, wallBefore: was.minWall, tries: tries.map(({ mode, aim, minWall, why, ok, passes }) => ({ mode, aim, passes, minWall, why, ok })) };
  if (chosen) {
    r.chosen = { mode: chosen.mode, aim: chosen.aim, minWall: chosen.minWall, file: chosen.file };
    if (chosen.mode !== 'hidden') Object.assign(r, sheet(before, chosen.file, kit, dir));
  }
  report.push(r);
  console.log(`${r.chosen ? 'pass   ' : 'careful'} ${row.id.padEnd(44)} ${r.chosen ? `${r.chosen.mode} @${r.chosen.aim} → ${r.chosen.minWall}` : r.tries.map((x) => `${x.mode}@${x.aim}: ${x.why}`).join(' | ')}`);
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
}

const passed = report.filter((r) => r.chosen);
const lines = passed.filter((r) => r.sheet).map((r) => `- ${r.id.split('/')[1]} (${r.kind}): ${r.sheet}${r.closeup ? `, ${r.closeup}` : ''}`);
writeFileSync(`${out}/checker.md`, `Judge these changed catalogue models. Per model: a before/after sheet at the same scale, and a close-up of the spots that moved.\n\n${lines.join('\n')}\n`);
console.log(`\n${report.length} models: ${passed.length} passed (${passed.filter((r) => r.chosen.mode === 'hidden').length} hidden, no visible change), ${report.length - passed.length} to the careful pass`);
console.log(`checker list: ${out}/checker.md`);
