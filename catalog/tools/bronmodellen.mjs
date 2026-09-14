import { writeFileSync, readdirSync, statSync, existsSync, rmSync } from 'node:fs';
import { join, dirname, resolve, relative, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leesFbx } from './fbx.mjs';
import { pakUit } from './zip.mjs';
import { leesGltf, leesObj } from '../../tools/importeer/bron.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BRON_DIR = join(ROOT, 'kits', 'sources');
const UITPAK_DIR = join(BRON_DIR, '.uitgepakt');

export const kebab = (naam) =>
  naam
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_.\s]+/g, '-')
    .toLowerCase();

export function alleBestanden(dir, uit = []) {
  for (const naam of readdirSync(dir)) {
    const pad = join(dir, naam);
    if (statSync(pad).isDirectory()) alleBestanden(pad, uit);
    else uit.push(pad);
  }
  return uit;
}

function vindModelmappen(dir, formaat, alleMappen) {
  const perMap = new Map();
  for (const pad of alleBestanden(dir)) {
    if (extname(pad).toLowerCase() !== `.${formaat}`) continue;
    const map = dirname(pad);
    perMap.set(map, (perMap.get(map) ?? 0) + 1);
  }
  if (perMap.size === 0) return null;
  const gesorteerd = [...perMap].sort(
    (a, b) => b[1] - a[1] || a[0].split('/').length - b[0].split('/').length || a[0].localeCompare(b[0]),
  );
  return alleMappen ? gesorteerd.map(([map]) => map).sort() : [gesorteerd[0][0]];
}

function gemeenschappelijkeMap(mappen) {
  const delen = mappen.map((map) => map.split('/'));
  const eerste = delen[0];
  let n = 0;
  while (n < eerste.length && delen.every((d) => d[n] === eerste[n])) n++;
  return eerste.slice(0, n).join('/');
}

export const bronId = (bronkit) => (bronkit.submap ? `${bronkit.map}/${bronkit.submap}` : bronkit.map);

function pakBronUit(bronkit) {
  const doel = join(UITPAK_DIR, bronkit.map);
  const map = join(BRON_DIR, bronkit.map);
  const zips = readdirSync(map).filter((n) => n.toLowerCase().endsWith('.zip')).sort();
  if (zips.length === 0) throw new Error(`${bronkit.map}: no .zip in kits/sources`);

  const stempel = join(doel, '.klaar');
  if (!existsSync(stempel)) {
    rmSync(doel, { recursive: true, force: true });
    for (const zip of zips) pakUit(join(map, zip), doel);
    writeFileSync(stempel, zips.join('\n') + '\n');
  }
  return doel;
}

const LOD = /_LOD(\d+)$/i;

const grofsteWeg = (naam) => {
  const match = naam.match(LOD);
  if (!match) return naam;
  return Number(match[1]) === 0 ? naam.replace(LOD, '') : null;
};

function leesBron(pad, formaat) {
  if (formaat === 'obj') return leesObj(pad);
  if (formaat === 'fbx') return leesFbx(pad);
  return leesGltf(pad);
}

function bronFormaatModellen(bronkit, uitgepakt, formaat) {
  const mappen = vindModelmappen(uitgepakt, formaat, bronkit.alleMappen);
  if (!mappen) return null;

  const wortel = gemeenschappelijkeMap(mappen);

  const modellen = [];
  for (const map of mappen) {
    const bestanden = readdirSync(map)
      .filter((n) => extname(n).toLowerCase() === `.${formaat}`)
      .sort();

    for (const naamBestand of bestanden) {
      const bestand = relative(wortel, join(map, naamBestand));
      const primitieven = leesBron(join(map, naamBestand), formaat);
      if (primitieven.length === 0) continue;

      if (bronkit.splitsPerMesh) {
        const perMesh = new Map();
        for (const primitief of primitieven) {
          const naam = grofsteWeg(primitief.naam);
          if (!naam) continue;
          if (perMesh.has(naam)) perMesh.get(naam).push(primitief);
          else perMesh.set(naam, [primitief]);
        }
        for (const [naam, delen] of perMesh) modellen.push({ naam, bestand, primitieven: delen });
        continue;
      }

      const naam = grofsteWeg(basename(naamBestand, extname(naamBestand)).replace(/\.gltf$/i, ''));
      if (!naam) continue;
      const fijnste = primitieven.filter((p) => grofsteWeg(p.naam) !== null);
      modellen.push({ naam, bestand, primitieven: fijnste.length ? fijnste : primitieven });
    }
  }

  const gezien = new Map();
  for (const model of modellen) {
    const n = (gezien.get(model.naam) ?? 0) + 1;
    gezien.set(model.naam, n);
    if (n > 1) model.naam = `${model.naam}-${n}`;
  }

  return { map: wortel, modellen };
}

export function bronModellen(bronkit) {
  const zip = pakBronUit(bronkit);
  const uitgepakt = bronkit.submap ? join(zip, bronkit.submap) : zip;
  if (!existsSync(uitgepakt)) throw new Error(`${bronId(bronkit)}: no such folder in the source zip`);
  const formaten = [bronkit.formaat, ...(bronkit.extraFormaten ?? [])];

  let hoofdmap = null;
  const modellen = [];
  const namen = new Set();

  for (const formaat of formaten) {
    const gelezen = bronFormaatModellen(bronkit, uitgepakt, formaat);
    if (!gelezen) {
      if (formaat === bronkit.formaat) throw new Error(`${bronId(bronkit)}: no .${formaat} found`);
      continue;
    }
    hoofdmap ??= gelezen.map;
    for (const model of gelezen.modellen) {
      if (namen.has(model.naam)) continue;
      namen.add(model.naam);
      modellen.push(model);
    }
  }

  return { map: hoofdmap, uitgepakt, modellen };
}

export const meet = (primitieven) => {
  let driehoeken = 0;
  const laag = [Infinity, Infinity, Infinity];
  const hoog = [-Infinity, -Infinity, -Infinity];
  for (const p of primitieven) {
    driehoeken += p.indices.length / 3;
    for (let i = 0; i < p.posities.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = p.posities[i + k];
        if (v < laag[k]) laag[k] = v;
        if (v > hoog[k]) hoog[k] = v;
      }
    }
  }
  return { driehoeken, laag, hoog, wdh: hoog.map((v, k) => v - laag[k]) };
};
