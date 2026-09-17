import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
const fail = (what) => { throw new Error(`kinds: ${what}`); };

const kebab = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const segments = (text) => kebab(text).split('-').filter(Boolean);

const NODES = new Map();
const NOUNS = [];

const addNoun = (raw, id) => {
  const [, qualifier = ''] = raw.match(/\(([^)]*)\)/) ?? [];
  const base = segments(raw.replace(/\([^)]*\)/g, ''));
  if (!base.length) fail(`noun "${raw}" on ${id} says nothing outside its brackets`);
  NOUNS.push({ id, raw, base, qualifier: segments(qualifier) });
};

const addNode = (node, parent) => {
  const { id } = node;
  if (typeof id !== 'string' || !id) fail('a kind has no id');
  if (NODES.has(id)) fail(`${id} appears twice`);
  const tail = parent ? (id.startsWith(`${parent.id}-`) ? id.slice(parent.id.length + 1) : null) : id;
  if (!tail || tail.includes('-')) fail(`${id} does not read as one segment under ${parent ? parent.id : 'the roots'}`);

  const self = { id, parent: parent?.id ?? null, depth: parent ? parent.depth + 1 : 1, children: [] };
  NODES.set(id, self);
  parent?.children.push(id);
  for (const raw of node.nouns ?? []) addNoun(raw, id);
  for (const child of node.children ?? []) addNode(child, self);
};

for (const root of read('lint/kinds.json').kinds) addNode(root, null);

const seen = new Map();
for (const { raw, id } of NOUNS) {
  const key = kebab(raw);
  if (seen.has(key)) fail(`noun "${raw}" is claimed by both ${seen.get(key)} and ${id}`);
  seen.set(key, id);
}

const DISPLAY = read('lint/kind-display.json');
for (const id of Object.keys(DISPLAY.kinds)) if (!NODES.has(id)) fail(`${id} has display data but is not a kind`);
for (const [id, { name }] of Object.entries(DISPLAY.kinds)) {
  if (name) NODES.get(id).name = name;
}

const SIZE_LIMITS = read('lint/variables.json').sizes;
const SIZE_NAMES = new Map(DISPLAY.sizes.map((size) => [size.id, size]));
for (const { id } of DISPLAY.sizes) {
  if (!SIZE_LIMITS.some((size) => size.id === id)) fail(`size ${id} has a name but no limit in lint/variables.json`);
}

export const SIZES = SIZE_LIMITS.map(({ id, limit }) => {
  const { name, description } = SIZE_NAMES.get(id) ?? fail(`size ${id} has no name in lint/kind-display.json`);
  return { id, limit, name, description };
});
if (!SIZES.length) fail('no sizes');
if (SIZES.at(-1).limit !== null) fail('the largest size must be open-ended');
if (SIZES.slice(0, -1).some((size, i) => size.limit === null || (i && size.limit <= SIZES[i - 1].limit)))
  fail('size limits must rise, and only the largest may be open-ended');

export const sizeOf = (wdh) => (SIZES.find((size) => size.limit !== null && Math.max(...wdh) < size.limit) ?? SIZES.at(-1)).id;

const node = (id) => NODES.get(id) ?? fail(`${id} is not a kind`);

export const kindName = (id) => node(id).name ?? (([last]) => last[0].toUpperCase() + last.slice(1))([id.split('-').at(-1)]);
export const kindParent = (id) => node(id).parent;
export const kindIs = (id, ancestor) => id === ancestor || Boolean(id?.startsWith(`${ancestor}-`));
export const kindAncestors = (id) => {
  const out = [];
  for (let p = kindParent(id); p; p = kindParent(p)) out.push(p);
  return out;
};

export function readKindTree() {
  const nouns = new Map([...NODES.keys()].map((id) => [id, []]));
  for (const { raw, id } of NOUNS) nouns.get(id).push(raw);
  return new Map([...nouns].map(([id, list]) => [id, list.join(', ')]));
}

const matches = (name, base) => {
  const last = base.length - 1;
  return name.some((_, at) => base.every((word, i) =>
    at + i < name.length && (i < last ? name[at + i] === word : new RegExp(`^${word}(s|es)?$`).test(name[at + i]))));
};

export function kindFromName(name, within = null) {
  const words = segments(name);
  if (!words.length) return null;

  let best = 0;
  let found = new Set();
  for (const { id, base, qualifier } of NOUNS) {
    if (within && !kindIs(id, within)) continue;
    if (!matches(words, base)) continue;
    const score = base.length + (qualifier.length && qualifier.some((word) => words.includes(word)) ? 0.5 : 0);
    if (score < best) continue;
    if (score > best) { best = score; found = new Set(); }
    found.add(id);
  }

  const [deepest] = [...found].sort((a, b) => node(b).depth - node(a).depth);
  return found.size && [...found].every((id) => kindIs(deepest, id)) ? deepest : null;
}
