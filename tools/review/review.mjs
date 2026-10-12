import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGlb, readAccessor, measureScene } from '../../catalog/tools/glb.mjs';
import { readAtlas, COLUMNS, ROWS } from '../../catalog/tools/measure.mjs';
import { buildLimits, buildScales, limitsForModel } from '../../lint/rules.mjs';
import { read, VARS } from '../../lint/report.mjs';

const HELP = `review.mjs build <list.json> --out <dir> [--base <ref>] [--size 360]
review.mjs apply <verdicts.json> [--base <ref>]
review.mjs brief [--review <text>]

build   renders every listed model before (at --base, default the list's
        base) and after (working tree) from two angles, diffs tags, size,
        triangles, bands and vertices, and writes <out>/review.html, a single
        page to publish as an artifact.

        list.json:
        { "title": "short name", "base": "<git ref>",
          "items": [ { "model": "kit/name", "group": "heading",
                       "change": "what was done", "note": "why it is doubtful",
                       "doubt": "high" | "low", "types": ["size", …] } ] }
        types is optional: size, tag, recolour, shape, geometry; derived when left out.

apply   takes the page's copied verdicts, or lines of "kit/name: verdict".
        revert, retry and relax put the model's file and its tags back as they
        were at base; keepbut, retry, relax and other are printed with their
        comment as the work left.

        Every verdict is logged in tools/review/log.json with the model's
        kind and change types.

brief   with --review, only the reviews whose title holds that text, and
        every one of their verdicts with its change and comment.
        prints how often each change type, doubt level and kind branch was
        kept or undone across all reviews, and advises what to send: every
        change of a type undone 30% or more, only high-doubt ones of a type
        undone 10% or less (5 verdicts at least), and a follow-up round for
        changes like the ones undone in the last review.

verdicts: keep, keepbut, revert, retry, relax, other, later.
marks:    great (spot on, beyond expectations) or bad (opposite of the goal,
          high impact), next to the verdict; brief lists the latest of each.`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORK = 'kits/workfiles';
const TAGS = 'catalog/data/tags.json';
const COLORMAP = join(ROOT, 'kits', 'colormap.png');
const PAGE = join(dirname(fileURLToPath(import.meta.url)), 'page.html');
const BAND_NAMES = Object.fromEntries(
  Object.entries(JSON.parse(readFileSync(join(ROOT, 'lint', 'materials.json'), 'utf8')).bands)
    .filter(([, cell]) => cell)
    .map(([name, cell]) => [cell, name]),
);
const REVERTS = new Set(['revert', 'retry', 'relax']);
const LOG = join(dirname(fileURLToPath(import.meta.url)), 'log.json');
const MIN_SAMPLE = 5;
const SEND_ALL = 0.3;
const SEND_FEW = 0.1;

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const git = (...a) => execFileSync('git', a, { cwd: ROOT, maxBuffer: 1 << 28 });
const atRef = (ref, path) => {
  try { return git('show', `${ref}:${path}`); } catch { return null; }
};

function tagsOf(tagsJson, model) {
  const out = {};
  for (const tag of tagsJson.tags) if (tag.models?.includes(model)) out[tag.id] = tag.type;
  return out;
}

function facts(buf) {
  if (!buf) return null;
  const glb = parseGlb(buf);
  const scene = measureScene(glb);
  const atlas = readAtlas(COLORMAP);
  const area = new Map();
  const positions = [];
  for (const mesh of glb.json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      const pos = readAccessor(glb, prim.attributes.POSITION).data;
      positions.push(pos);
      if (prim.attributes.TEXCOORD_0 === undefined) continue;
      const uv = readAccessor(glb, prim.attributes.TEXCOORD_0).data;
      const idx = prim.indices === undefined
        ? Array.from({ length: pos.length / 3 }, (_, i) => i)
        : Array.from(readAccessor(glb, prim.indices).data);
      for (let t = 0; t < idx.length; t += 3) {
        const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
        const e1 = [0, 1, 2].map((k) => pos[b * 3 + k] - pos[a * 3 + k]);
        const e2 = [0, 1, 2].map((k) => pos[c * 3 + k] - pos[a * 3 + k]);
        const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const u = (uv[a * 2] + uv[b * 2] + uv[c * 2]) / 3;
        const v = (uv[a * 2 + 1] + uv[b * 2 + 1] + uv[c * 2 + 1]) / 3;
        const cell = `${Math.min(COLUMNS - 1, Math.max(0, Math.floor(u * COLUMNS)))},${Math.min(ROWS - 1, Math.max(0, Math.floor(v * ROWS)))}`;
        area.set(cell, (area.get(cell) ?? 0) + Math.hypot(...cr) / 2);
      }
    }
  }
  const total = [...area.values()].reduce((s, a) => s + a, 0) || 1;
  const bands = new Map([...area].map(([cell, a]) => [cell, a / total]));
  return { tris: scene.triangles, wdh: scene.wdh, bands, positions };
}

function bandInfo(cell) {
  const atlas = readAtlas(COLORMAP);
  const [col, row] = cell.split(',').map(Number);
  const x = Math.floor((col + 0.5) * atlas.width / COLUMNS);
  const y = Math.floor((row + 0.5) * atlas.height / ROWS);
  const i = (y * atlas.width + x) * 4;
  const hex = '#' + [0, 1, 2].map((k) => atlas.pixels[i + k].toString(16).padStart(2, '0')).join('');
  return { name: BAND_NAMES[cell] ?? cell, hex };
}

const round = (v) => Math.round(v * 1000) / 1000;
const longest = (wdh) => Math.max(...wdh);
const strength = (value, mid, high) => (value >= high ? 'strong' : value >= mid ? 'mid' : 'low');

function diff(model, base, tagsBefore, tagsAfter) {
  const path = `${WORK}/${model}.glb`;
  const before = facts(atRef(base, path));
  const after = facts(existsSync(join(ROOT, path)) ? readFileSync(join(ROOT, path)) : null);
  const types = new Set();
  const out = [];

  const tb = tagsOf(tagsBefore, model);
  const ta = tagsOf(tagsAfter, model);
  const kindB = Object.keys(tb).find((t) => tb[t] === 'kind') ?? null;
  const kindA = Object.keys(ta).find((t) => ta[t] === 'kind') ?? null;
  if (kindB !== kindA) out.push({ f: 'kind', from: kindB, to: kindA, s: 'strong' });
  const add = Object.keys(ta).filter((t) => !(t in tb) && ta[t] !== 'kind').map((id) => ({ id, type: ta[id] }));
  const remove = Object.keys(tb).filter((t) => !(t in ta) && tb[t] !== 'kind').map((id) => ({ id, type: tb[id] }));
  if (add.length || remove.length) {
    out.push({ f: 'tags', add, remove, s: [...add, ...remove].some((t) => t.type === 'material') ? 'mid' : 'low' });
  }
  if (kindB !== kindA || add.length || remove.length) types.add('tag');

  if (before && after) {
    const lb = longest(before.wdh);
    const la = longest(after.wdh);
    if (Math.abs(la / lb - 1) > 0.01) {
      types.add('size');
      out.push({ f: 'size', from: round(lb), to: round(la), factor: Math.round((la / lb) * 100) / 100,
        s: strength(Math.abs(Math.log(la / lb)), 0.15, 0.4) });
    }
    if (before.tris !== after.tris) {
      types.add('geometry');
      const pct = Math.round(((after.tris - before.tris) / before.tris) * 100);
      out.push({ f: 'tris', from: before.tris, to: after.tris, pct, s: strength(Math.abs(pct), 10, 40) });
    }
    const cells = new Set([...before.bands.keys(), ...after.bands.keys()]);
    const shift = [...cells].reduce((s, c) => s + Math.abs((after.bands.get(c) ?? 0) - (before.bands.get(c) ?? 0)), 0) / 2;
    const row = (bands) => [...bands].filter(([, share]) => share >= 0.005).sort((a, b) => b[1] - a[1])
      .map(([cell, share]) => ({ ...bandInfo(cell), share: Math.round(share * 100) }));
    const gone = [...before.bands.keys()].filter((c) => !after.bands.has(c));
    const come = [...after.bands.keys()].filter((c) => !before.bands.has(c));
    if (gone.length || come.length || shift >= 0.02) {
      types.add('recolour');
      out.push({ f: 'colour', from: row(before.bands), to: row(after.bands), changed: Math.round(shift * 100),
        s: strength(shift, 0.1, 0.35) });
    }
    if (!types.has('size') && !types.has('geometry')) {
      const move = maxMove(before, after);
      if (move > 1e-3) {
        types.add('shape');
        out.push({ f: 'shape', move: Math.round(move * 1000) / 10, s: strength(move, 0.01, 0.05) });
      }
    }
  }
  return { types: [...types], facts: out, wdh: { before: before?.wdh.map(round), after: after?.wdh.map(round) } };
}

function maxMove(a, b) {
  if (a.positions.length !== b.positions.length) return 1;
  const scale = longest(a.wdh) || 1;
  let most = 0;
  for (let p = 0; p < a.positions.length; p++) {
    const x = a.positions[p];
    const y = b.positions[p];
    if (x.length !== y.length) return 1;
    for (let i = 0; i < x.length; i++) most = Math.max(most, Math.abs(x[i] - y[i]) / scale);
  }
  return most;
}

function kindLimits(model) {
  const kinds = read(VARS.kinds);
  const m = read(VARS.models).models.find((x) => `${x.kit}/${x.name}` === model);
  if (!m?.kind) return null;
  const { limits } = limitsForModel(m, buildLimits(kinds).get(m.kind), buildScales(kinds));
  if (!limits) return null;
  const pick = (measure) => {
    const min = limits[`${measure}.min`];
    const max = limits[`${measure}.max`];
    const own = (l) => (l && l.from !== 'defaults' ? l.value : null);
    return own(min) !== null || own(max) !== null ? { measure, min: own(min), max: own(max) } : null;
  };
  return pick('longest') ?? pick('high') ?? { measure: 'longest', min: null, max: null };
}

function frontView(dir, out, size) {
  execFileSync('node', [join(ROOT, 'tools/renders/render.mjs'), dir, '--out', out, '--views', 'front', '--ortho',
    '--width', String(size * 2), '--height', String(size * 2), '--bg', 'transparent'], { cwd: ROOT, stdio: 'ignore' });
}

const trimmed = (png) => {
  if (!existsSync(png)) return null;
  return `data:image/webp;base64,${execFileSync('convert', [png, '-trim', '+repage', '-resize', '480x480>', '-quality', '82', 'webp:-']).toString('base64')}`;
};

function render(dir, out, size) {
  execFileSync('node', [join(ROOT, 'tools/renders/render.mjs'), dir, '--out', out, '--views', 'iso,iso-back',
    '--width', String(size), '--height', String(size)], { cwd: ROOT, stdio: 'ignore' });
}

const webp = (png) =>
  existsSync(png) ? `data:image/webp;base64,${execFileSync('convert', [png, '-quality', '78', 'webp:-']).toString('base64')}` : null;

function pixelDiff(before, after, mask) {
  if (!existsSync(before) || !existsSync(after)) return { share: null, boxes: [] };
  let changed = 0;
  try {
    execFileSync('compare', ['-fuzz', '6%', '-metric', 'AE', '-highlight-color', 'white', '-lowlight-color', 'black',
      '-compose', 'src', before, after, mask], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    changed = Number(String(e.stderr).trim().split(/\s/)[0]) || 0;
  }
  if (!existsSync(mask) || !changed) return { share: 0, boxes: [] };
  const [w, h] = execFileSync('identify', ['-format', '%w %h', mask]).toString().split(' ').map(Number);
  const report = execFileSync('convert', [mask, '-morphology', 'Open', 'Disk:1.5', '-morphology', 'Dilate', 'Disk:6', '-define', 'connected-components:verbose=true',
    '-define', 'connected-components:area-threshold=60', '-connected-components', '8', 'null:']).toString();
  const boxes = report.split('\n')
    .map((l) => l.match(/^\s*\d+: (\d+)x(\d+)\+(\d+)\+(\d+) \S+ (\d+) gray\(255\)/))
    .filter(Boolean)
    .map((m) => ({ bw: +m[1], bh: +m[2], x: +m[3], y: +m[4], area: +m[5] }))
    .sort((p, q) => q.area - p.area)
    .slice(0, 4)
    .map(({ bw, bh, x, y }) => [x / w, y / h, bw / w, bh / h].map((v) => Math.round(v * 1000) / 1000));
  const covered = Number(execFileSync('convert', [after, '-fuzz', '4%', '-fill', 'black', '+opaque', '#f2f2f0',
    '-fill', 'white', '-opaque', '#f2f2f0', '-negate', '-format', '%[fx:mean*w*h]', 'info:']).toString()) || 1;
  return { share: Math.round((changed / covered) * 1000) / 10, boxes };
}
const basenameOf = (p) => p.split('/').pop();

function build() {
  const listPath = args[1];
  const out = resolve(flag('--out', 'review-out'));
  const size = Number(flag('--size', 360));
  const list = JSON.parse(readFileSync(listPath, 'utf8'));
  const base = flag('--base', list.base);
  if (!base) throw new Error('no base ref: give --base or "base" in the list');
  const tagsBefore = JSON.parse(atRef(base, TAGS));
  const tagsAfter = JSON.parse(readFileSync(join(ROOT, TAGS), 'utf8'));

  rmSync(out, { recursive: true, force: true });
  for (const side of ['before', 'after']) {
    mkdirSync(join(out, side, 'Textures'), { recursive: true });
    copyFileSync(COLORMAP, join(out, side, 'colormap.png'));
    copyFileSync(COLORMAP, join(out, side, 'Textures', 'colormap.png'));
  }
  mkdirSync(join(out, 'diff'), { recursive: true });
  const key = (model) => model.replace('/', '__');
  for (const item of list.items) {
    const path = `${WORK}/${item.model}.glb`;
    const old = atRef(base, path);
    if (old) writeFileSync(join(out, 'before', `${key(item.model)}.glb`), old);
    if (existsSync(join(ROOT, path))) copyFileSync(join(ROOT, path), join(out, 'after', `${key(item.model)}.glb`));
  }
  for (const side of ['before', 'after']) render(join(out, side), join(out, `r-${side}`), size);
  const sized = list.items.filter((item) => diff(item.model, base, tagsBefore, tagsAfter).types.includes('size'));
  for (const side of ['before', 'after']) {
    if (!sized.length) break;
    const dir = join(out, `s-${side}`);
    mkdirSync(join(dir, 'Textures'), { recursive: true });
    copyFileSync(COLORMAP, join(dir, 'colormap.png'));
    copyFileSync(COLORMAP, join(dir, 'Textures', 'colormap.png'));
    for (const item of sized) {
      const src = join(out, side, `${key(item.model)}.glb`);
      if (existsSync(src)) copyFileSync(src, join(dir, `${key(item.model)}.glb`));
    }
    frontView(dir, join(out, `f-${side}`), size);
  }

  const items = list.items.map((item) => {
    const d = diff(item.model, base, tagsBefore, tagsAfter);
    const png = (side, view) => join(out, `r-${side}`, key(item.model), `pbr_${view}.png`);
    const img = (side, view) => webp(png(side, view));
    const d1 = pixelDiff(png('before', 'iso'), png('after', 'iso'), join(out, 'diff', `${key(item.model)}-iso.png`));
    const d2 = pixelDiff(png('before', 'iso-back'), png('after', 'iso-back'), join(out, 'diff', `${key(item.model)}-back.png`));
    const pixels = Math.max(d1.share ?? 0, d2.share ?? 0);
    const visual = (item.types ?? d.types).includes('recolour') || d1.boxes.length + d2.boxes.length > 0;
    return {
      model: item.model,
      group: item.group ?? '',
      change: item.change ?? '',
      note: item.note ?? '',
      doubt: item.doubt ?? 'low',
      types: item.types ?? d.types,
      facts: d.facts,
      pixels,
      visual,
      scale: d.types.includes('size') ? {
        ...kindLimits(item.model),
        before: { wdh: d.wdh.before, img: trimmed(join(out, 'f-before', key(item.model), 'pbr_front.png')) },
        after: { wdh: d.wdh.after, img: trimmed(join(out, 'f-after', key(item.model), 'pbr_front.png')) },
      } : null,
      boxes: { front: d1.boxes, back: d2.boxes },
      img: visual
        ? { b1: img('before', 'iso'), a1: img('after', 'iso'), b2: img('before', 'iso-back'), a2: img('after', 'iso-back') }
        : { a1: img('after', 'iso'), a2: img('after', 'iso-back') },
    };
  });
  const data = JSON.stringify({ title: list.title, base, items }).replace(/</g, '\\u003c');
  const page = readFileSync(PAGE, 'utf8').replace('%%TITLE%%', () => list.title).replace('%%DATA%%', () => data);
  writeFileSync(join(out, 'review.html'), page);
  console.log(`${items.length} items → ${join(out, 'review.html')}`);
}

function apply() {
  const text = readFileSync(args[1], 'utf8');
  const verdicts = text.trim().startsWith('{')
    ? JSON.parse(text)
    : {
        items: text.split('\n').filter((l) => l.includes(':')).map((l) => {
          const [model, rest] = [l.slice(0, l.indexOf(':')).trim(), l.slice(l.indexOf(':') + 1).trim()];
          const [verdict, ...comment] = rest.split(/\s+[—-]\s+/);
          return { model, verdict: verdict.trim().toLowerCase(), comment: comment.join(' — ') };
        }),
      };
  const base = flag('--base', verdicts.base);
  const baseTags = JSON.parse(atRef(base, TAGS));
  const tags = JSON.parse(readFileSync(join(ROOT, TAGS), 'utf8'));
  const left = [];
  const reverted = [];
  const log = existsSync(LOG) ? JSON.parse(readFileSync(LOG, 'utf8')) : [];
  const at = new Date().toISOString().slice(0, 10);
  for (const { model, verdict, mark, comment, change, types, doubt } of verdicts.items) {
    const kind = Object.entries(tagsOf(tags, model)).find(([, type]) => type === 'kind')?.[0] ?? null;
    log.push({ at, review: verdicts.review ?? null, model, kind, types: types ?? diff(model, base, baseTags, tags).types,
      doubt: doubt ?? null, verdict, ...(mark ? { mark } : {}), ...(change ? { change } : {}), comment: comment ?? '' });
    if (REVERTS.has(verdict)) {
      reverted.push(model);
      const path = `${WORK}/${model}.glb`;
      const old = atRef(base, path);
      if (old) writeFileSync(join(ROOT, path), old);
      const want = tagsOf(baseTags, model);
      for (const tag of tags.tags) {
        const has = tag.models?.includes(model);
        if (tag.id in want && !has) (tag.models ??= []).push(model);
        if (!(tag.id in want) && has) tag.models = tag.models.filter((m) => m !== model);
      }
    }
    if (!['keep', 'later', 'revert'].includes(verdict)) left.push(`${verdict.padEnd(8)} ${model}${comment ? `  — ${comment}` : ''}`);
  }
  writeFileSync(join(ROOT, TAGS), JSON.stringify(tags, null, 1) + '\n');
  writeFileSync(LOG, JSON.stringify(log, null, 1) + '\n');
  console.log(`reverted ${reverted.length}: ${reverted.join(' ') || '—'}`);
  console.log(left.length ? `work left:\n${left.join('\n')}` : 'no work left');
}

function brief() {
  const only = flag('--review', null)?.toLowerCase();
  const all = existsSync(LOG) ? JSON.parse(readFileSync(LOG, 'utf8')) : [];
  const log = only ? all.filter((e) => e.review?.toLowerCase().includes(only)) : all;
  const decided = log.filter((e) => e.verdict !== 'later');
  const tally = (rows) => {
    const n = rows.length;
    const back = rows.filter((e) => REVERTS.has(e.verdict)).length;
    const kept = rows.filter((e) => e.verdict === 'keep').length;
    return { n, back, kept, share: n ? back / n : 0 };
  };
  const line = (label, t) => `${label.padEnd(28)} ${String(t.n).padStart(4)}  kept ${String(t.kept).padStart(3)}  undone ${String(t.back).padStart(3)}  ${Math.round(t.share * 100)}%`;
  const groupBy = (key) => {
    const map = new Map();
    for (const e of decided) for (const k of [].concat(key(e) ?? [])) (map.get(k) ?? map.set(k, []).get(k)).push(e);
    return [...map].sort((a, b) => b[1].length - a[1].length);
  };
  console.log(`${decided.length} verdicts in ${new Set(log.map((e) => e.review)).size} reviews\n\nby type`);
  const advice = [];
  for (const [type, rows] of groupBy((e) => e.types)) {
    const t = tally(rows);
    console.log(line(type, t));
    if (t.n >= MIN_SAMPLE && t.share >= SEND_ALL) advice.push(`send every ${type} change`);
    if (t.n >= MIN_SAMPLE && t.share <= SEND_FEW) advice.push(`send only high-doubt ${type} changes`);
  }
  console.log('\nby doubt');
  for (const [doubt, rows] of groupBy((e) => e.doubt ?? 'unset')) console.log(line(doubt, tally(rows)));
  console.log('\nby kind branch');
  for (const [branch, rows] of groupBy((e) => e.kind?.split('-').slice(0, 2).join('-'))) console.log(line(branch, tally(rows)));
  const last = log.at(-1)?.review;
  const undone = log.filter((e) => e.review === last && REVERTS.has(e.verdict));
  if (undone.length) {
    advice.push(`follow up "${last}": put the not yet reviewed changes like these in a next round: ` +
      undone.map((e) => `${e.model} (${e.types.join('+') || 'tag'})`).join(', '));
  }
  for (const [mark, label] of [['great', 'spot on, copy this'], ['bad', 'big no, never again']]) {
    const rows = log.filter((e) => e.mark === mark);
    if (!rows.length) continue;
    console.log(`\nmarked ${label} (${rows.length})`);
    for (const e of rows.slice(-12)) console.log(`  ${e.model} [${e.types.join('+') || 'tag'}] ${e.change ?? ''}${e.comment ? `  — ${e.comment}` : ''}`);
  }
  if (only) {
    console.log(`\nverdicts of reviews matching "${only}"`);
    for (const e of log) console.log(`  ${e.verdict.padEnd(7)} ${e.mark === 'great' ? '★ ' : e.mark === 'bad' ? '✕✕ ' : ''}${e.model}: ${e.change ?? ''}${e.comment ? `  — ${e.comment}` : ''}`);
  }
  console.log(`\nadvice\n${advice.length ? advice.map((a) => `- ${a}`).join('\n') : '- none yet'}`);
}

const command = args[0];
if (command === 'build' && args[1]) build();
else if (command === 'apply' && args[1]) apply();
else if (command === 'brief') brief();
else console.log(HELP);
