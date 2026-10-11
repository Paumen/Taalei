import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGlb, readAccessor, measureScene } from '../../catalog/tools/glb.mjs';
import { readAtlas, COLUMNS, ROWS } from '../../catalog/tools/measure.mjs';

const HELP = `review.mjs build <list.json> --out <dir> [--base <ref>] [--size 360]
review.mjs apply <verdicts.json> [--base <ref>]
review.mjs brief

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

brief   prints how often each change type, doubt level and kind branch was
        kept or undone across all reviews, and advises what to send: every
        change of a type undone 30% or more, only high-doubt ones of a type
        undone 10% or less (5 verdicts at least), and a follow-up round for
        changes like the ones undone in the last review.

verdicts: keep, keepbut, revert, retry, relax, other, later.`;

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
  const bands = new Set();
  const positions = [];
  for (const mesh of glb.json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      positions.push(readAccessor(glb, prim.attributes.POSITION).data);
      if (prim.attributes.TEXCOORD_0 === undefined) continue;
      const uv = readAccessor(glb, prim.attributes.TEXCOORD_0);
      for (let i = 0; i < uv.count; i++) {
        const x = Math.min(Math.max(Math.floor(uv.data[i * 2] * atlas.width), 0), atlas.width - 1);
        const y = Math.min(Math.max(Math.floor(uv.data[i * 2 + 1] * atlas.height), 0), atlas.height - 1);
        const cell = `${Math.floor(x / (atlas.width / COLUMNS))},${Math.floor(y / (atlas.height / ROWS))}`;
        bands.add(BAND_NAMES[cell] ?? cell);
      }
    }
  }
  return { tris: scene.triangles, wdh: scene.wdh, bands, positions };
}

const round = (v) => Math.round(v * 1000) / 1000;
const longest = (wdh) => Math.max(...wdh);

function diff(model, base, tagsBefore, tagsAfter) {
  const path = `${WORK}/${model}.glb`;
  const before = facts(atRef(base, path));
  const after = facts(existsSync(join(ROOT, path)) ? readFileSync(join(ROOT, path)) : null);
  const types = new Set();
  const lines = [];

  const tb = tagsOf(tagsBefore, model);
  const ta = tagsOf(tagsAfter, model);
  const kindB = Object.keys(tb).find((t) => tb[t] === 'kind');
  const kindA = Object.keys(ta).find((t) => ta[t] === 'kind');
  if (kindB !== kindA) lines.push(`kind ${kindB ?? '—'} → ${kindA ?? '—'}`);
  const added = Object.keys(ta).filter((t) => !(t in tb) && ta[t] !== 'kind');
  const removed = Object.keys(tb).filter((t) => !(t in ta) && tb[t] !== 'kind');
  if (added.length || removed.length) lines.push([...added.map((t) => `+${t}`), ...removed.map((t) => `−${t}`)].join(' '));
  if (kindB !== kindA || added.length || removed.length) types.add('tag');

  if (before && after) {
    const lb = longest(before.wdh);
    const la = longest(after.wdh);
    if (Math.abs(la / lb - 1) > 0.01) {
      types.add('size');
      lines.push(`longest ${round(lb)} → ${round(la)} m`);
    }
    if (before.tris !== after.tris) {
      types.add('geometry');
      lines.push(`tris ${before.tris} → ${after.tris}`);
    }
    const gone = [...before.bands].filter((b) => !after.bands.has(b));
    const come = [...after.bands].filter((b) => !before.bands.has(b));
    if (gone.length || come.length) {
      types.add('recolour');
      lines.push(`bands ${[...gone.map((b) => `−${b}`), ...come.map((b) => `+${b}`)].join(' ')}`);
    }
    if (!types.has('size') && !types.has('geometry') && moved(before, after)) {
      types.add('shape');
      lines.push('vertices moved');
    }
  }
  return { types: [...types], facts: lines, changedFile: Boolean(before && after) };
}

function moved(a, b) {
  if (a.positions.length !== b.positions.length) return true;
  const scale = longest(a.wdh) || 1;
  for (let p = 0; p < a.positions.length; p++) {
    const x = a.positions[p];
    const y = b.positions[p];
    if (x.length !== y.length) return true;
    for (let i = 0; i < x.length; i++) if (Math.abs(x[i] - y[i]) > scale * 1e-3) return true;
  }
  return false;
}

function render(dir, out, size) {
  execFileSync('node', [join(ROOT, 'tools/renders/render.mjs'), dir, '--out', out, '--views', 'iso,iso-back',
    '--width', String(size), '--height', String(size)], { cwd: ROOT, stdio: 'ignore' });
}

const webp = (png) =>
  existsSync(png) ? `data:image/webp;base64,${execFileSync('convert', [png, '-quality', '78', 'webp:-']).toString('base64')}` : null;

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
  const key = (model) => model.replace('/', '__');
  for (const item of list.items) {
    const path = `${WORK}/${item.model}.glb`;
    const old = atRef(base, path);
    if (old) writeFileSync(join(out, 'before', `${key(item.model)}.glb`), old);
    if (existsSync(join(ROOT, path))) copyFileSync(join(ROOT, path), join(out, 'after', `${key(item.model)}.glb`));
  }
  for (const side of ['before', 'after']) render(join(out, side), join(out, `r-${side}`), size);

  const items = list.items.map((item) => {
    const d = diff(item.model, base, tagsBefore, tagsAfter);
    const img = (side, view) => webp(join(out, `r-${side}`, key(item.model), `pbr_${view}.png`));
    return {
      model: item.model,
      group: item.group ?? '',
      change: item.change ?? '',
      note: item.note ?? '',
      doubt: item.doubt ?? 'low',
      types: item.types ?? d.types,
      facts: d.facts,
      img: { b1: img('before', 'iso'), a1: img('after', 'iso'), b2: img('before', 'iso-back'), a2: img('after', 'iso-back') },
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
  for (const { model, verdict, comment, types, doubt } of verdicts.items) {
    const kind = Object.entries(tagsOf(tags, model)).find(([, type]) => type === 'kind')?.[0] ?? null;
    log.push({ at, review: verdicts.review ?? null, model, kind, types: types ?? diff(model, base, baseTags, tags).types,
      doubt: doubt ?? null, verdict, comment: comment ?? '' });
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
  const log = existsSync(LOG) ? JSON.parse(readFileSync(LOG, 'utf8')) : [];
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
  console.log(`\nadvice\n${advice.length ? advice.map((a) => `- ${a}`).join('\n') : '- none yet'}`);
}

const command = args[0];
if (command === 'build' && args[1]) build();
else if (command === 'apply' && args[1]) apply();
else if (command === 'brief') brief();
else console.log(HELP);
