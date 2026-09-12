import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng, writePng } from '../catalog/tools/png.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COLUMNS = 16;
const ROWS = 4;

const options = { band: null, top: null, bottom: null, a: null, b: null, atlas: 'kits/colormap.png', out: 'kits/colormap-band.png', inPlace: false };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--band') options.band = argv[++i];
  else if (a === '--top') options.top = Number(argv[++i]);
  else if (a === '--bottom') options.bottom = Number(argv[++i]);
  // An unused cell is black, so its a and b are 0 and reshading it can only ever make
  // a neutral grey. These set the hue outright, which is how a new band is opened.
  else if (a === '--a') options.a = Number(argv[++i]);
  else if (a === '--b') options.b = Number(argv[++i]);
  else if (a === '--atlas') options.atlas = argv[++i];
  else if (a === '--out') options.out = argv[++i];
  else if (a === '--in-place') options.inPlace = true;
  else { console.error(`unknown flag: ${a}`); process.exit(2); }
}

const cell = /^(\d+),(\d+)$/.exec(options.band ?? '');
if (!cell) { console.error('--band takes a column,row id, as Appendix A writes them: --band 6,1'); process.exit(2); }
const [column, row] = [Number(cell[1]), Number(cell[2])];
if (column >= COLUMNS || row >= ROWS) { console.error(`--band ${options.band} is outside the ${COLUMNS} x ${ROWS} sheet`); process.exit(2); }
if (!Number.isFinite(options.top) || !Number.isFinite(options.bottom)) { console.error('--top and --bottom are both required'); process.exit(2); }
if (options.bottom >= options.top) { console.error('--top is the light end: it has to sit above --bottom'); process.exit(2); }

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
const x0 = Math.round(column * cellWidth);
const x1 = Math.round((column + 1) * cellWidth);
const y0 = Math.round(row * cellHeight);
const rows = Math.round(cellHeight);

const centre = Math.floor(column * cellWidth + cellWidth / 2);
const before = [];
for (let y = 0; y < rows; y++) {
  const i4 = ((y0 + y) * atlas.width + centre) * 4;
  before.push(toOklab(atlas.pixels[i4], atlas.pixels[i4 + 1], atlas.pixels[i4 + 2]));
}

const pixels = Buffer.from(atlas.pixels);
const ends = [];
for (let y = 0; y < rows; y++) {
  const L = options.top + (options.bottom - options.top) * (y / (rows - 1));
  const [, wasA, wasB] = before[y];
  const a = options.a ?? wasA;
  const b = options.b ?? wasB;
  const [r, g, bl] = toRgb(L, a, b);
  if (y === 0 || y === rows - 1) ends.push(`${r},${g},${bl}`);
  for (let x = x0; x < x1; x++) {
    const i4 = ((y0 + y) * atlas.width + x) * 4;
    pixels[i4] = r;
    pixels[i4 + 1] = g;
    pixels[i4 + 2] = bl;
  }
}

const was = (lab) => lab[0].toFixed(3);
console.log(`band ${options.band}  L ${was(before[0])} -> ${was(before[rows - 1])}  (span ${(before[0][0] - before[rows - 1][0]).toFixed(3)})`);
console.log(`      becomes L ${options.top.toFixed(3)} -> ${options.bottom.toFixed(3)}  (span ${(options.top - options.bottom).toFixed(3)})   ${ends[0]} -> ${ends[1]}`);

if (options.a !== null || options.b !== null) {
  console.log(`      hue set to a=${(options.a ?? 0).toFixed(4)} b=${(options.b ?? 0).toFixed(4)}`);
}

const out = options.inPlace ? source : resolve(ROOT, options.out);
writePng(out, { width: atlas.width, height: atlas.height, pixels });
console.log(`wrote ${out}`);
