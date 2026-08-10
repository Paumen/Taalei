
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));

const INHOUD = [
  join(HIER, 'tool.css'),
  join(HIER, 'tool.js'),
  join(HIER, 'aansluiting.js'),
  join(HIER, 'bouwsels.json'),
  join(HIER, 'oordelen.json'),
  join(HIER, '..', '..', 'kits', 'modulair-terrein', 'aansluitingen.json'),
];

export function stempel() {
  const hash = createHash('sha256');
  for (const pad of INHOUD) hash.update(readFileSync(pad));
  return hash.digest('hex').slice(0, 10);
}

export function metStempel(html, versie) {
  return html.replace(
    /(href|src)="(tool\.css|tool\.js)(\?v=[0-9a-f]+)?"/g,
    (_, attribuut, bestand) => `${attribuut}="${bestand}?v=${versie}"`,
  );
}

if (process.argv[1] && process.argv[1].endsWith('stempel.mjs')) {
  const pad = join(HIER, 'index.html');
  const oud = readFileSync(pad, 'utf8');
  const versie = stempel();
  const nieuw = metStempel(oud, versie);
  writeFileSync(pad, nieuw);
  console.log(oud === nieuw ? `stempel stond al goed: ${versie}` : `gestempeld: ${versie}`);
}
