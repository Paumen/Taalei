import { withHash } from './stamps.js?v=04e3ee3113';

const ROOT = new URL('../../', import.meta.url).href;
const FLAT_ENVIRONMENT = new URL('effen-omgeving.png', import.meta.url).href;
const SOFT_ENVIRONMENT = new URL('zachte-omgeving.png', import.meta.url).href;

export const number = new Intl.NumberFormat('en-GB');
export const unit = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });

export const readableBytes = (bytes) =>
  bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} kB`;

export const dimensions = (wdh) =>
  Array.isArray(wdh) ? `${wdh.map((v) => unit.format(v)).join(' × ')} units` : '—';

export const longest = (m) => Math.max(...m.wdh);

export const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.content ?? '';

export const kindParent = (id) => (id.includes('-') ? id.slice(0, id.lastIndexOf('-')) : null);

export const kindChain = (id) => {
  const chain = [];
  for (let k = id; k; k = kindParent(k)) chain.unshift(k);
  return chain;
};

const ROOT_ORDER = ['obj', 'char', 'env', 'str', 'sym', 'set'];
export const rootRank = (id) => ROOT_ORDER.indexOf(id.split('-')[0]);

export const SIZE_CLASSES = [
  { id: 's', sign: 'S', short: 'Small', hint: 'small — under half a unit' },
  { id: 'm', sign: 'M', short: 'Medium', hint: 'medium — half to one and a half units' },
  { id: 'l', sign: 'L', short: 'Large', hint: 'large — over one and a half units' },
];

export const LINT_LEVELS = [
  { id: 'error', name: 'Errors', hint: 'Breaks a rule, or outside a size limit by more than the warning band' },
  { id: 'warning', name: 'Warnings', hint: 'Outside a size limit but within the warning band' },
];

export const LINT_CHECKS = [
  { id: 'size', name: 'Size', hint: 'Extents, per kind' },
  { id: 'tpu', name: 'Triangles', hint: 'Triangle budget, per kind' },
  { id: 'mat', name: 'Materials', hint: 'The materials a kind is asked to carry' },
  { id: 'palette', name: 'Palette', hint: 'The bands a material may draw from' },
  { id: 'bands', name: 'Bands', hint: 'The bands a kind may draw from' },
  { id: 'measures', name: 'Measures', hint: 'Rows that assert on one recorded field' },
  { id: 'backface', name: 'Backfaces', hint: 'Share of a view that shows back faces' },
];

export const lintLevels = (m) => [...new Set((m.lint ?? []).map((f) => f.level))];
export const lintChecks = (m) => [...new Set((m.lint ?? []).map((f) => f.check))];
export const lintText = (f) => `${f.check} · ${f.text}`;

export const TAG_TYPES = [
  { type: 'material', head: 'Material' },
  { type: 'attribute', head: 'Attributes', extra: true },
  { type: 'tag', head: 'Tags' },
  { type: 'theme', head: 'Theme', extra: true },
  { type: 'artist', head: 'Artist', extra: true },
];

export function withParents(ids, parentOf) {
  const own = new Set(ids);
  for (const id of ids) {
    for (let p = parentOf.get(id); p && !own.has(p); p = parentOf.get(p)) own.add(p);
  }
  return [...own];
}

export function collectColors(models, bandNames) {
  const counts = new Map();
  for (const model of models) {
    for (const hex of model.colors ?? []) counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  return [...counts]
    .map(([hex, count]) => ({ hex, count, name: bandNames.get(hex) ?? 'no band' }))
    .sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex));
}

export function hydrate(m, modelPath) {
  m.id = `${m.kit}/${m.name}`;
  m.path = `${modelPath}/${m.kit}/${m.name}.glb`;
  m.group = m.collection ?? m.kit;
  return m;
}

export const WORKFILES = 'kits/workfiles';

export const modelUrl = (model) => withHash(`${ROOT}${model.path}`, model.hash);

export function foldVariants(models, mainOf) {
  const perGroup = new Map();
  const out = [];
  for (const model of models) {
    const existing = model.variant ? perGroup.get(model.variant) : null;
    if (existing) {
      if (model.id === mainOf.get(model.variant)) {
        existing.variants.push(existing.model);
        existing.model = model;
      } else {
        existing.variants.push(model);
      }
      continue;
    }
    const item = { model, variants: [] };
    if (model.variant) perGroup.set(model.variant, item);
    out.push(item);
  }
  return out;
}

export function span(className, text) {
  const element = document.createElement('span');
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function glyph(kind, sign, hint) {
  const element = span(`glyf glyf-${kind}`, sign);
  element.title = hint;
  return element;
}

export const flatMode = { on: false };

export function setLighting(viewer, shadow = '0.7') {
  viewer.setAttribute('tone-mapping', 'neutral');
  if (flatMode.on) {
    viewer.setAttribute('environment-image', FLAT_ENVIRONMENT);
    viewer.setAttribute('shadow-intensity', '0');
    viewer.setAttribute('exposure', '1.3');
  } else {
    viewer.setAttribute('environment-image', SOFT_ENVIRONMENT);
    viewer.setAttribute('shadow-intensity', shadow);
    viewer.setAttribute('exposure', '1.5');
  }
}

export function attachViewer(box) {
  if (box.querySelector('model-viewer')) return;
  const viewer = document.createElement('model-viewer');
  viewer.src = box.dataset.src;
  viewer.alt = box.dataset.alt;
  viewer.setAttribute('camera-orbit', '35deg 68deg auto');
  viewer.setAttribute('shadow-softness', '0.9');
  setLighting(viewer, '0.6');
  viewer.setAttribute('interaction-prompt', 'none');
  viewer.setAttribute('disable-zoom', '');
  viewer.setAttribute('loading', 'eager');
  box.replaceChildren(viewer);
}

const soon = globalThis.requestIdleCallback ?? ((f) => setTimeout(f, 1));

function showSnapshot(box) {
  const image = document.createElement('img');
  image.src = box.dataset.momentopname;
  image.alt = box.dataset.alt;
  image.loading = 'lazy';
  box.replaceChildren(image);
}

function detachViewer(box) {
  const viewer = box.querySelector('model-viewer');
  if (!viewer) return;

  if (viewer.loaded && !box.dataset.momentopname) {
    soon(() => {
      if (box.dataset.momentopname || !viewer.loaded) return;
      try {
        box.dataset.momentopname = viewer.toDataURL('image/webp', 0.72);
        if (!box.contains(viewer)) showSnapshot(box);
      } catch {}
    });
  }

  if (box.dataset.momentopname) showSnapshot(box);
  else box.replaceChildren();
}

export const watchViewers = () => new IntersectionObserver(
  (observations) => {
    for (const { target, isIntersecting } of observations) {
      if (isIntersecting) attachViewer(target);
      else detachViewer(target);
    }
  },
  { rootMargin: '800px 0px' },
);

export function makeSelection(onChange) {
  const chosen = new Set();
  const cardsPerPath = new Map();
  const set = (paths, on) => {
    for (const path of paths) {
      if (on) chosen.add(path);
      else chosen.delete(path);
      for (const sibling of cardsPerPath.get(path) ?? []) sibling.checkbox.checked = on;
    }
    onChange();
  };
  return { chosen, cardsPerPath, set };
}

export function choiceChip(text, active, action, container, path, selection) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'keuzechip';
  chip.textContent = text;
  chip.setAttribute('aria-pressed', String(active));
  chip.addEventListener('click', () => {
    for (const sibling of container.querySelectorAll('.keuzechip')) sibling.setAttribute('aria-pressed', 'false');
    chip.setAttribute('aria-pressed', 'true');
    action();
  });
  if (path) {
    const pick = document.createElement('input');
    pick.type = 'checkbox';
    pick.className = 'keuzechip-kies';
    pick.checked = selection.chosen.has(path);
    pick.setAttribute('aria-label', `Select ${text}`);
    pick.addEventListener('click', (e) => {
      e.stopPropagation();
      selection.set([path], pick.checked);
    });
    chip.prepend(pick);
  }
  return chip;
}

async function toClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {}

  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;top:0;left:-9999px';
  document.body.append(field);
  field.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
  }
}

export function copyPathsOnClick(button, chosen) {
  button.addEventListener('click', async () => {
    const count = chosen.size;
    const ok = await toClipboard([...chosen].join('\n'));
    button.textContent = ok
      ? `${count} path${count === 1 ? '' : 's'} copied`
      : 'Copy failed';
    setTimeout(() => { button.textContent = 'Copy paths'; }, 1600);
  });
}

export async function copyWithFeedback(text, button) {
  const old = button.textContent;
  button.textContent = (await toClipboard(text)) ? 'Copied' : 'Copy failed';
  setTimeout(() => { button.textContent = old; }, 1400);
}

export function saveFile(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readStore(key) {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (stored && typeof stored === 'object') return stored;
  } catch {}
  return {};
}

export function writeStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
