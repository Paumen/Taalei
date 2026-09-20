import { BRONKITS } from '../../catalog/tools/bronkits.mjs';
import { bronModellen, kebab } from '../../catalog/tools/bronmodellen.mjs';
import { leerBanden } from './leerbanden.mjs';
import { readGlb } from '../../catalog/tools/glb.mjs';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const KITS = [
  'quat-blood-ring', 'quat-dun-1', 'quat-dun-2', 'quat-fish', 'quat-food',
  'quat-nature', 'quat-ocean', 'quat-pirate', 'quat-props', 'quat-rpg',
  'quat-ships', 'quat-skeleton', 'quat-town',
];

const materialen = JSON.parse(readFileSync(new URL('../../lint/materials.json', import.meta.url)));
const tagsBestand = JSON.parse(readFileSync(new URL('../../catalog/tags.json', import.meta.url)));

const bandenVan = new Map();
const loop = (knopen) => {
  for (const knoop of knopen) {
    if (knoop.bands) bandenVan.set(knoop.id, knoop.bands);
    if (knoop.children) loop(knoop.children);
  }
};
loop(materialen.materials);

const perModel = new Map();
for (const rij of tagsBestand.tags) {
  for (const model of rij.models ?? []) {
    const post = perModel.get(model) ?? { kind: null, materialen: [], tags: [] };
    if (rij.type === 'kind') post.kind = rij.id;
    else if (rij.type === 'material') post.materialen.push(rij.id);
    else post.tags.push(rij.id);
    perModel.set(model, post);
  }
}

const materiaalVoor = (band, kandidaten) => {
  const passend = kandidaten.filter((id) => (bandenVan.get(id) ?? []).includes(band));
  if (passend.length) return passend[0];
  const vrij = kandidaten.filter((id) => !bandenVan.has(id));
  if (vrij.length) return vrij[0];
  for (const [id, banden] of bandenVan) if (banden.includes(band)) return id;
  return kandidaten[0] ?? null;
};

export function specVoor(kit) {
  const bron = BRONKITS.find((b) => b.kit === kit);
  if (!bron) throw new Error(`${kit}: no BRONKITS row`);
  const { modellen, uitgepakt } = bronModellen(bron);

  const dir = join(ROOT, 'kits', 'workfiles', kit);
  const bestanden = existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.glb')) : [];
  const opBronmodel = new Map();
  const knoop = new Map();
  for (const naam of bestanden) {
    const { json } = readGlb(join(dir, naam));
    const bm = json.asset?.extras?.taaleiland?.bronmodel;
    if (bm) opBronmodel.set(bm, naam);
    knoop.set(naam, {
      knopen: (json.nodes ?? []).length,
      geanimeerd: Boolean((json.animations ?? []).length || (json.skins ?? []).length),
      rotatie: (json.nodes ?? []).length === 1 ? (json.nodes[0].rotation ?? null) : null,
    });
  }
  const werkNaam = (model) => {
    const kebabNaam = `${kebab(model.naam)}.glb`;
    const bestand = opBronmodel.get(model.naam)
      ?? opBronmodel.get(`${model.naam}.gltf`)
      ?? (bestanden.includes(kebabNaam) ? kebabNaam : null);
    return bestand ? bestand.replace(/\.glb$/, '') : null;
  };

  const uit = [];
  const open = [];
  const gedekt = new Set();
  const samengesteld = [];
  for (const model of modellen) {
    const naam = werkNaam(model);
    if (!naam) continue;
    const vorm = knoop.get(`${naam}.glb`);
    if (vorm.knopen > 1 || vorm.geanimeerd) {
      samengesteld.push(naam);
      gedekt.add(`${naam}.glb`);
      continue;
    }
    const { tabel } = leerBanden(bron, [model], uitgepakt, null);
    if (!tabel.size) continue;
    gedekt.add(`${naam}.glb`);

    const kleuren = {};
    const telling = new Map();
    let meeste = null;
    for (const [hex, counts] of tabel) {
      const gesorteerd = [...counts].sort((a, b) => b[1] - a[1]);
      const [band, n] = gesorteerd[0];
      if (gesorteerd.length > 1) open.push(`${kit}/${model.naam} ${hex} ${gesorteerd.map(([b, c]) => `${b}:${c}`).join('/')}`);
      kleuren[hex] = band;
      const som = [...counts.values()].reduce((t, c) => t + c, 0);
      telling.set(band, (telling.get(band) ?? 0) + som);
      if (!meeste || n > meeste[1]) meeste = [band, n];
    }

    const post = perModel.get(`${kit}/${naam}`) ?? {};
    uit.push({
      naam,
      bronmodel: model.naam,
      kleuren,
      val: meeste[0],
      rotatie: vorm.rotatie,
      kind: post.kind ?? null,
      materialen: post.materialen ?? [],
      tags: post.tags ?? [],
    });
  }
  const ongedekt = bestanden.filter((n) => !gedekt.has(n));
  return { kit, bron: bron.map, modellen: uit, open, ongedekt, samengesteld };
}

export function bandNaarMateriaal(band, kandidaten) {
  return materiaalVoor(band, kandidaten);
}

if (process.argv[1] && process.argv[1].endsWith('quat-specs.mjs')) {
  const gevraagd = process.argv.slice(2).length ? process.argv.slice(2) : KITS;
  let totaal = 0;
  let openTotaal = 0;
  let ongedekt = 0;
  for (const kit of gevraagd) {
    const spec = specVoor(kit);
    totaal += spec.modellen.length;
    openTotaal += spec.open.length;
    ongedekt += spec.ongedekt.length;
    console.log(`${kit.padEnd(18)} ${String(spec.modellen.length).padStart(3)} covered  ${String(spec.ongedekt.length).padStart(3)} not reachable  ${String(spec.open.length).padStart(3)} colours split`);
    if (spec.ongedekt.length) console.log(`   ${spec.ongedekt.join(' ')}`);
  }
  console.log(`\n${totaal} models covered, ${ongedekt} not reachable from source, ${openTotaal} split colours to dominant band`);
}
