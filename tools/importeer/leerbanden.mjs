import { readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { readPng } from '../../catalog/tools/png.mjs';
import { alleBestanden, kebab } from '../../catalog/tools/bronmodellen.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const BANDEN = {
  tan: [0, 0],
  camel: [1, 0],
  chestnut: [2, 0],
  umber: [3, 0],
  terracotta: [5, 0],
  amber: [6, 0],
  sienna: [8, 0],
  hunter: [1, 1],
  moss: [3, 1],
  slate: [6, 1],
  azure: [4, 2],
  ivory: [5, 2],
  basalt: [13, 3],
  taupe: [14, 3],
  nickel: [15, 3],
};

const bandVanCel = new Map(Object.entries(BANDEN).map(([naam, [k, r]]) => [`${k},${r}`, naam]));

export const hexVan = (kleur) => '#' + kleur.map((k) => k.toString(16).padStart(2, '0')).join('');

const gelezen = new Map();
function png(pad) {
  if (!gelezen.has(pad)) {
    let beeld = null;
    try {
      if (pad && pad.toLowerCase().endsWith('.png') && existsSync(pad)) beeld = readPng(pad);
    } catch {
      beeld = null;
    }
    gelezen.set(pad, beeld);
  }
  return gelezen.get(pad);
}

function beeldKleur(pad, u, v) {
  const beeld = png(pad);
  if (!beeld) return null;
  const x = Math.min(Math.max(Math.floor(u * beeld.width), 0), beeld.width - 1);
  const y = Math.min(Math.max(Math.floor(v * beeld.height), 0), beeld.height - 1);
  const i = (y * beeld.width + x) * 4;
  return hexVan([0, 1, 2].map((k) => beeld.pixels[i + k]));
}

export function textuurZoeker(uitgepakt) {
  const plaatjes = alleBestanden(uitgepakt).filter((pad) => pad.toLowerCase().endsWith('.png'));
  return (naam) => {
    if (!naam) return null;
    if (naam.includes('/') && existsSync(naam)) return naam;
    const gezocht = basename(naam).toLowerCase();
    return plaatjes.find((pad) => basename(pad).toLowerCase() === gezocht) ?? null;
  };
}

export function bronDriehoeken(model, zoekTextuur, raster = null) {
  const uit = [];
  for (const primitief of model.primitieven) {
    const materiaal = primitief.materiaal ?? {};
    const textuur = zoekTextuur(materiaal.textuur);
    for (let t = 0; t < primitief.indices.length / 3; t++) {
      const midden = [0, 0, 0];
      let u = 0;
      let v = 0;
      for (let k = 0; k < 3; k++) {
        const i = primitief.indices[t * 3 + k];
        for (let a = 0; a < 3; a++) midden[a] += primitief.posities[i * 3 + a] / 3;
        if (primitief.uvs) {
          u += primitief.uvs[i * 2] / 3;
          v += primitief.uvs[i * 2 + 1] / 3;
        }
      }
      let sleutel = null;
      if (raster && primitief.uvs) {
        const kolom = Math.min(Math.max(Math.floor(u * raster[0]), 0), raster[0] - 1);
        const rij = Math.min(Math.max(Math.floor(v * raster[1]), 0), raster[1] - 1);
        sleutel = `${kolom},${rij}`;
      }
      if (!sleutel && textuur && primitief.uvs) sleutel = beeldKleur(textuur, u, v);
      if (!sleutel) sleutel = materiaal.kleur ? hexVan(materiaal.kleur) : `mat:${materiaal.naam ?? '?'}`;
      uit.push({ midden, sleutel, u, v });
    }
  }
  return uit;
}

function werkDriehoeken(pad) {
  const glb = readGlb(pad);
  const uit = [];
  for (const mesh of glb.json.meshes ?? []) {
    for (const primitief of mesh.primitives ?? []) {
      const posities = readAccessor(glb, primitief.attributes.POSITION);
      const uvs = readAccessor(glb, primitief.attributes.TEXCOORD_0);
      const indices = readAccessor(glb, primitief.indices);
      for (let t = 0; t < indices.count / 3; t++) {
        const midden = [0, 0, 0];
        let u = 0;
        let v = 0;
        for (let k = 0; k < 3; k++) {
          const i = indices.data[t * 3 + k];
          for (let a = 0; a < 3; a++) midden[a] += posities.data[i * 3 + a] / 3;
          u += uvs.data[i * 2] / 3;
          v += uvs.data[i * 2 + 1] / 3;
        }
        const cel = `${Math.min(Math.floor(u * 16), 15)},${Math.min(Math.floor(v * 4), 3)}`;
        const band = bandVanCel.get(cel);
        if (band) uit.push({ midden, band });
      }
    }
  }
  return uit;
}

function genormaliseerd(lijst) {
  const laag = [Infinity, Infinity, Infinity];
  const hoog = [-Infinity, -Infinity, -Infinity];
  for (const item of lijst) {
    for (let k = 0; k < 3; k++) {
      if (item.midden[k] < laag[k]) laag[k] = item.midden[k];
      if (item.midden[k] > hoog[k]) hoog[k] = item.midden[k];
    }
  }
  const spanne = Math.max(...[0, 1, 2].map((k) => hoog[k] - laag[k])) || 1;
  for (const item of lijst) {
    item.plek = [0, 1, 2].map((k) => (item.midden[k] - (laag[k] + hoog[k]) / 2) / spanne);
  }
  return lijst;
}

const DREMPEL = 0.004;

export function leerBanden(bronkit, modellen, uitgepakt, raster = null) {
  const zoekTextuur = textuurZoeker(uitgepakt);
  const dir = join(ROOT, 'kits', 'workfiles', bronkit.kit);
  if (!existsSync(dir)) return { tabel: new Map(), zoekTextuur, uit: 0 };

  const bestanden = readdirSync(dir).filter((naam) => naam.endsWith('.glb'));
  const opBronmodel = new Map();
  for (const naam of bestanden) {
    const bronmodel = readGlb(join(dir, naam)).json.asset?.extras?.taaleiland?.bronmodel;
    if (bronmodel) opBronmodel.set(bronmodel, naam);
  }

  const tabel = new Map();
  let uit = 0;
  for (const model of modellen) {
    const kebabNaam = `${kebab(model.naam)}.glb`;
    const bestand = opBronmodel.get(model.naam)
      ?? opBronmodel.get(`${model.naam}.gltf`)
      ?? (bestanden.includes(kebabNaam) ? kebabNaam : null);
    if (!bestand) continue;

    const doel = werkDriehoeken(join(dir, bestand));
    const bron = bronDriehoeken(model, zoekTextuur, raster);
    if (!doel.length || !bron.length) continue;
    genormaliseerd(bron);
    genormaliseerd(doel);

    for (const driehoek of bron) {
      let beste = null;
      let afstand = Infinity;
      for (const kandidaat of doel) {
        const som = [0, 1, 2].reduce((t, k) => t + (driehoek.plek[k] - kandidaat.plek[k]) ** 2, 0);
        if (som < afstand) {
          afstand = som;
          beste = kandidaat;
        }
      }
      if (afstand > DREMPEL) continue;
      const telling = tabel.get(driehoek.sleutel) ?? new Map();
      telling.set(beste.band, (telling.get(beste.band) ?? 0) + 1);
      tabel.set(driehoek.sleutel, telling);
    }
    uit++;
  }

  return { tabel, zoekTextuur, uit };
}

export const besteBand = (telling) =>
  [...telling].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
