import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng, writePng } from '../catalog/tools/png.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COLUMNS = 16;
const ROWS = 4;
const WOOD_CELLS = 3;

const options = { step: 0.12, gap: 0.04, anchor: 0.36, atlas: 'kits/colormap.png', out: 'kits/colormap-respaced.png', inPlace: false };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--step') options.step = Number(argv[++i]);
  else if (a === '--gap') options.gap = Number(argv[++i]);
  else if (a === '--anchor') options.anchor = Number(argv[++i]);
  else if (a === '--atlas') options.atlas = argv[++i];
  else if (a === '--out') options.out = argv[++i];
  else if (a === '--in-place') options.inPlace = true;
  else { console.error(`unknown flag: ${a}`); process.exit(2); }
}

const toLinear = (c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
const toByte = (c) => {
  const v = Math.min(Math.max(c, 0), 1);
  return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055));
};

function toOklab(r, g, b) {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

function toRgb(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    toByte(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toByte(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toByte(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  ];
}

const source = resolve(ROOT, options.atlas);
const atlas = readPng(source);
const cellWidth = atlas.width / COLUMNS;
const cellHeight = atlas.height / ROWS;

const ramp = [];
for (let cell = 0; cell < WOOD_CELLS; cell++) {
  const x = Math.floor(cell * cellWidth + cellWidth / 2);
  for (let y = 0; y < cellHeight; y++) {
    const i4 = (y * atlas.width + x) * 4;
    ramp.push(toOklab(atlas.pixels[i4], atlas.pixels[i4 + 1], atlas.pixels[i4 + 2]));
  }
}

function chromaAt(L) {
  let best = ramp[0];
  for (const lab of ramp) {
    if (Math.abs(lab[0] - L) < Math.abs(best[0] - L)) best = lab;
  }
  return [best[1], best[2]];
}

const pixels = Buffer.from(atlas.pixels);
const top = options.anchor + options.step * WOOD_CELLS + options.gap * (WOOD_CELLS - 1);
console.log(`wood ramp L ${top.toFixed(3)} -> ${options.anchor.toFixed(3)}, band ${options.step}, gap ${options.gap} (${(options.gap / options.step).toFixed(2)} of a band)`);

for (let cell = 0; cell < WOOD_CELLS; cell++) {
  const high = top - (options.step + options.gap) * cell;
  const low = high - options.step;
  const rows = Math.round(cellHeight);
  const ends = [];
  for (let y = 0; y < rows; y++) {
    const L = high + (low - high) * (y / (rows - 1));
    const [a, b] = chromaAt(L);
    const [r, g, bl] = toRgb(L, a, b);
    if (y === 0 || y === rows - 1) ends.push(`${r},${g},${bl}`);
    for (let x = Math.round(cell * cellWidth); x < Math.round((cell + 1) * cellWidth); x++) {
      const i4 = (y * atlas.width + x) * 4;
      pixels[i4] = r;
      pixels[i4 + 1] = g;
      pixels[i4 + 2] = bl;
    }
  }
  console.log(`  band ${cell},0  L ${high.toFixed(3)} -> ${low.toFixed(3)}   ${ends[0]} -> ${ends[1]}`);
  if (cell < WOOD_CELLS - 1) console.log(`  gap        L ${low.toFixed(3)} -> ${(low - options.gap).toFixed(3)}   no band renders these`);
}

const out = options.inPlace ? source : resolve(ROOT, options.out);
writePng(out, { width: atlas.width, height: atlas.height, pixels });
console.log(`wrote ${out}`);
