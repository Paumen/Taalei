import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP_DIR = join(ROOT, 'catalog', 'app');

const DATA = [
  'catalog/build/catalog.json', 'catalog/build/thumbs.json', 'catalog/build/scale-groups.json',
  'catalog/build/size-curves.json', 'catalog/build/tbd.json', 'catalog/build/reject.json',
  'catalog/build/npc.json', 'catalog/build/packs.json',
  'lint/kinds.json', 'lint/measures.json', 'lint/variables.json',
];

export const hashOf = (bytes) => createHash('sha256').update(bytes).digest('hex').slice(0, 10);

const IMPORT = /((?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"])((?![^'"]*\/vendor\/)\.{1,2}\/[^'"?]+\.m?js)(?:\?v=[a-f0-9]+)?(['"])/g;
const ATTR = /(\b(?:src|href)=")((?!https?:|data:|\/\/|#|[^"]*\bvendor\/)[^"?]+\.(?:css|m?js))(?:\?v=[a-f0-9]+)?(")/g;

function pages() {
  return [join(ROOT, 'index.html'), ...readdirSync(APP_DIR).filter((f) => f.endsWith('.html')).map((f) => join(APP_DIR, f))];
}

function setMeta(html, name, content) {
  const tag = `<meta name="${name}" content="${content}">`;
  const own = new RegExp(`<meta name="${name}" content="[^"]*">`);
  if (own.test(html)) return html.replace(own, tag);
  return html.replace(/(<meta name="catalogus-versie" content="[^"]*">)/, `$1\n${tag}`);
}

export function stampPages() {
  const hashes = new Map();
  const visiting = new Set();

  const assetHash = (abs) => {
    if (hashes.has(abs)) return hashes.get(abs);
    if (!existsSync(abs)) throw new Error(`stamp: ${relative(ROOT, abs)} is referenced but missing`);
    if (visiting.has(abs)) throw new Error(`stamp: import cycle through ${relative(ROOT, abs)}`);
    visiting.add(abs);
    let text = readFileSync(abs, 'utf8');
    const own = abs.startsWith(APP_DIR + sep) && /\.m?js$/.test(abs);
    if (own) {
      const after = text.replace(IMPORT, (_, head, path, tail) =>
        `${head}${path}?v=${assetHash(resolve(dirname(abs), path))}${tail}`);
      if (after !== text) writeFileSync(abs, after);
      text = after;
    }
    visiting.delete(abs);
    const hash = hashOf(text);
    hashes.set(abs, hash);
    return hash;
  };

  const data = DATA.filter((path) => existsSync(join(ROOT, path)))
    .map((path) => [basename(path), hashOf(readFileSync(join(ROOT, path)))]);
  const dataMeta = data.map(([name, hash]) => `${name}:${hash}`).join(' ');

  const builtAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  for (const page of pages()) {
    let html = readFileSync(page, 'utf8');
    const used = [];
    html = html.replace(ATTR, (_, head, path, tail) => {
      const hash = assetHash(resolve(dirname(page), path));
      used.push(hash);
      return `${head}${path}?v=${hash}${tail}`;
    });
    const version = hashOf(used.join('') + dataMeta);
    html = setMeta(html, 'catalogus-versie', version);
    html = setMeta(html, 'catalogus-hashes', dataMeta);
    html = setMeta(html, 'catalogus-gebouwd', builtAt);
    writeFileSync(page, html);
  }
  console.log(`stamped ${pages().length} pages, ${hashes.size} scripts and stylesheets, ${data.length} data files`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) stampPages();
