// Re-spaces the three wood bands of kits/colormap.png so each spans the same amount of
// OKLab lightness, per the note in section 1 of docs/asset_style_guide.md.
//
//   node tools/colormap-respace.mjs [--step 0.12] [--anchor 0.406]
//                                   [--out kits/colormap-respaced.png] [--in-place]
//
// The three bands are one ramp cut in three, and they were cut unevenly: 0,0 spans 0.186
// of L, 1,0 spans 0.137 and 2,0 only 0.094. So timber has twice the shading range bark
// has, for no reason anyone chose, and the palest end of 0,0 is lighter than any wood in
// the catalogue wants to be. Equal steps give every material the same budget and take the
// palest lines off the top; anchored at the dark end, the darkest brown does not move.
//
// The hue and chroma of each new line are read off the original ramp at the lightness the
// line lands on, so this only re-spaces the ramp — it does not repaint it. Only the three
// wood cells are touched; every other band comes through byte for byte.
//
// This changes what a UV position means: a model keeps its position and gets a different
// colour. Run it before moving models onto their G-block windows, not after, or every
// model is placed twice.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng, writePng } from '../catalog/tools/png.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COLUMNS = 16;
const ROWS = 4;
const WOOD_CELLS = 3;

const options = { step: 0.12, anchor: 0.406, out: 'kits/colormap-respaced.png', inPlace: false };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--step') options.step = Number(argv[++i]);
  else if (a === '--anchor') options.anchor = Number(argv[++i]);
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

const source = join(ROOT, 'kits/colormap.png');
const atlas = readPng(source);
const cellWidth = atlas.width / COLUMNS;
const cellHeight = atlas.height / ROWS;

// the original ramp, read down the middle of the three wood cells in turn
const ramp = [];
for (let cell = 0; cell < WOOD_CELLS; cell++) {
  const x = Math.floor(cell * cellWidth + cellWidth / 2);
  for (let y = 0; y < cellHeight; y++) {
    const i4 = (y * atlas.width + x) * 4;
    ramp.push(toOklab(atlas.pixels[i4], atlas.pixels[i4 + 1], atlas.pixels[i4 + 2]));
  }
}

// the hue and chroma the original ramp carries at a given lightness
function chromaAt(L) {
  let best = ramp[0];
  for (const lab of ramp) {
    if (Math.abs(lab[0] - L) < Math.abs(best[0] - L)) best = lab;
  }
  return [best[1], best[2]];
}

const pixels = Buffer.from(atlas.pixels);
const top = options.anchor + options.step * WOOD_CELLS;
console.log(`wood ramp L ${top.toFixed(3)} -> ${options.anchor.toFixed(3)}, ${options.step} per band`);

for (let cell = 0; cell < WOOD_CELLS; cell++) {
  const high = top - options.step * cell;
  const low = high - options.step;
  const rows = Math.round(cellHeight);
  const ends = [];
  for (let y = 0; y < rows; y++) {
    const L = high + (low - high) * (y / (rows - 1));
    const [a, b] = chromaAt(L);
    const [r, g, bl] = toRgb(L, a, b);
    if (y === 0 || y === rows - 1) ends.push(`${r},${g},${bl}`);
    // the three wood bands are columns 0, 1 and 2 of row 0 — all of them on the top row
    for (let x = Math.round(cell * cellWidth); x < Math.round((cell + 1) * cellWidth); x++) {
      const i4 = (y * atlas.width + x) * 4;
      pixels[i4] = r;
      pixels[i4 + 1] = g;
      pixels[i4 + 2] = bl;
    }
  }
  console.log(`  band ${cell},0  L ${high.toFixed(3)} -> ${low.toFixed(3)}   ${ends[0]} -> ${ends[1]}`);
}

const out = options.inPlace ? source : resolve(ROOT, options.out);
writePng(out, { width: atlas.width, height: atlas.height, pixels });
console.log(`wrote ${out}`);
