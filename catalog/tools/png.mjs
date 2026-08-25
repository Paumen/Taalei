import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function unfilter(raw, stride, height, bpp) {
  const out = Buffer.alloc(stride * height);
  let source = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[source++];
    const line = out.subarray(y * stride, (y + 1) * stride);
    raw.copy(line, 0, source, source + stride);
    source += stride;
    const previous = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;

    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0;
      const b = previous ? previous[x] : 0;
      const c = previous && x >= bpp ? previous[x - bpp] : 0;
      switch (filter) {
        case 0: break;
        case 1: line[x] = (line[x] + a) & 255; break;
        case 2: line[x] = (line[x] + b) & 255; break;
        case 3: line[x] = (line[x] + ((a + b) >> 1)) & 255; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
          break;
        }
        default: throw new Error(`unknown PNG filter ${filter} on line ${y}`);
      }
    }
  }
  return out;
}

export function readPng(path) {
  const buf = readFileSync(path);
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error(`not a PNG: ${path}`);

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let palette = null;
  let paletteAlpha = null;
  const chunks = [];

  let offset = 8;
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error(`interlaced PNG is not supported: ${path}`);
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') paletteAlpha = data;
    else if (type === 'IDAT') chunks.push(data);
    else if (type === 'IEND') break;

    offset += 12 + length;
  }

  const channels = CHANNELS[colorType];
  if (!channels) throw new Error(`unknown PNG colour type ${colorType}: ${path}`);
  if (![1, 2, 4, 8].includes(bitDepth)) {
    throw new Error(`at most 8 bits per channel: ${path} has ${bitDepth}`);
  }
  if (bitDepth < 8 && channels !== 1) {
    throw new Error(`${path}: ${bitDepth} bits only works for grey or palette`);
  }

  const bitsPerPixel = channels * bitDepth;
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const unfiltered = unfilter(
    inflateSync(Buffer.concat(chunks)),
    stride,
    height,
    Math.max(1, bitsPerPixel >> 3),
  );

  let plane = unfiltered;
  if (bitDepth < 8) {
    const scale = colorType === 0 ? 255 / ((1 << bitDepth) - 1) : 1;
    plane = Buffer.alloc(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const bit = x * bitDepth;
        const byte = unfiltered[y * stride + (bit >> 3)];
        const shift = 8 - bitDepth - (bit & 7);
        const value = (byte >> shift) & ((1 << bitDepth) - 1);
        plane[y * width + x] = Math.round(value * scale);
      }
    }
  }

  const pixels = Buffer.alloc(width * height * 4);

  for (let i = 0; i < width * height; i++) {
    const source = i * channels;
    const dest = i * 4;
    switch (colorType) {
      case 0:
        pixels.fill(plane[source], dest, dest + 3);
        pixels[dest + 3] = 255;
        break;
      case 2:
        plane.copy(pixels, dest, source, source + 3);
        pixels[dest + 3] = 255;
        break;
      case 3: {
        const index = plane[source];
        if (!palette) throw new Error(`indexed PNG without PLTE: ${path}`);
        palette.copy(pixels, dest, index * 3, index * 3 + 3);
        pixels[dest + 3] = paletteAlpha?.[index] ?? 255;
        break;
      }
      case 4:
        pixels.fill(plane[source], dest, dest + 3);
        pixels[dest + 3] = plane[source + 1];
        break;
      case 6:
        plane.copy(pixels, dest, source, source + 4);
        break;
    }
  }

  return { width, height, pixels };
}
