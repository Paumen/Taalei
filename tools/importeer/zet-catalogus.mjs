import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAGS = join(ROOT, 'catalog', 'data', 'tags.json');
const MANIFEST = join(ROOT, 'catalog', 'data', 'manifest.js');
const VARIANTEN = join(ROOT, 'catalog', 'data', 'asset_variants.json');

const configs = process.argv.slice(2).map((pad) => JSON.parse(readFileSync(pad, 'utf8')));

const tags = JSON.parse(readFileSync(TAGS, 'utf8'));
const opId = new Map(tags.tags.map((tag) => [tag.id, tag]));

for (const config of configs) {
  for (const rij of config.modellen) {
    const model = `${config.kit}/${rij.naam}`;
    const ids = [rij.kind, ...(rij.materialen ?? []), ...(rij.vlaggen ?? []), ...(rij.themas ?? [])];
    for (const id of ids) {
      const tag = opId.get(id);
      if (!tag) throw new Error(`${model}: no tag row for ${id}`);
      tag.models ??= [];
      if (!tag.models.includes(model)) tag.models.push(model);
    }
  }
}

writeFileSync(TAGS, JSON.stringify(tags, null, 1) + '\n');

const varianten = JSON.parse(readFileSync(VARIANTEN, 'utf8'));
const gezien = new Set(varianten.clusters.map((groep) => groep.members.join(' ')));

for (const config of configs) {
  for (const groep of config.varianten ?? []) {
    const leden = groep.leden.map((naam) => `${config.kit}/${naam}`);
    if (gezien.has(leden.join(' '))) continue;
    varianten.clusters.push({
      members: leden,
      main: leden[0],
      kits: [config.kit],
      type: groep.type ?? 'detail-variant',
      types: ['manual'],
    });
  }
}

writeFileSync(VARIANTEN, JSON.stringify(varianten, null, 1) + '\n');

const manifestBron = readFileSync(MANIFEST, 'utf8');
const sluit = manifestBron.lastIndexOf(']');

const rijen = configs
  .filter((config) => !manifestBron.includes(`"slug": "${config.kit}"`))
  .map((config) =>
    JSON.stringify(
      {
        slug: config.kit,
        name: config.kit,
        url: config.url ?? null,
        ...(config.licenseLabel ? { licenseLabel: config.licenseLabel } : {}),
        ...(config.note ? { note: config.note } : {}),
        models: config.modellen.map((m) => m.naam).sort(),
      },
      null,
      1,
    )
      .split('\n')
      .map((regel) => ` ${regel}`)
      .join('\n'),
  );

if (rijen.length) {
  writeFileSync(
    MANIFEST,
    `${manifestBron.slice(0, sluit).replace(/\s*$/, '')},\n${rijen.join(',\n')}\n${manifestBron.slice(sluit)}`,
  );
}
