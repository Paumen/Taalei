#!/usr/bin/env node
// The shared colormap is distributed to the kits by copy: every kit carries its own
// Textures/colormap.png, and modular-cave-kit additionally carries colormap-gedeeld.png,
// which agrees on the wood cells but not elsewhere. Respacing kits/colormap.png therefore
// changes nothing on its own -- the assets read their kit's copy. This copies just the
// wood cells across, so a map that differs elsewhere keeps its own colours.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readPng, writePng } from '../catalog/tools/png.mjs';

const COLUMNS = 16, ROWS = 4;
const options = { cells: 4, source: 'kits/colormap.png', dry: process.argv.includes('--dry') };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--cells') options.cells = Number(argv[++i]);
  else if (argv[i] === '--source') options.source = argv[++i];
  else if (argv[i] !== '--dry') { console.error(`unknown flag: ${argv[i]}`); process.exit(2); }
}

const src = readPng(options.source);
const cellW = src.width / COLUMNS, cellH = src.height / ROWS;
const spanX = Math.round(options.cells * cellW), spanY = Math.round(cellH);

const targets = [];
const walk = (dir) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (e === 'colormap.png' || e === 'colormap-gedeeld.png') targets.push(p);
  }
};
walk('kits/workfiles');

let changed = 0;
for (const t of targets.sort()) {
  const dst = readPng(t);
  if (dst.width !== src.width || dst.height !== src.height) {
    console.warn(`! ${t}: ${dst.width}x${dst.height} does not match the source, skipped`);
    continue;
  }
  const pixels = Buffer.from(dst.pixels);
  let diff = 0;
  for (let y = 0; y < spanY; y++) {
    for (let x = 0; x < spanX; x++) {
      const i4 = (y * src.width + x) * 4;
      for (let c = 0; c < 3; c++) {
        if (pixels[i4 + c] !== src.pixels[i4 + c]) diff++;
        pixels[i4 + c] = src.pixels[i4 + c];
      }
    }
  }
  if (diff === 0) continue;
  changed++;
  if (!options.dry) writePng(t, { width: dst.width, height: dst.height, pixels });
  console.log(`${options.dry ? '[dry] ' : ''}${t}  ${diff} subpixels`);
}
console.log(`${targets.length} maps found, ${changed} updated over ${options.cells} wood cells`);
