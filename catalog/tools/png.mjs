
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const HANDTEKENING = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const KANALEN = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function ontfilter(ruw, breedte, hoogte, bpp) {
  const stap = breedte * bpp;
  const uit = Buffer.alloc(stap * hoogte);
  let bron = 0;

  for (let y = 0; y < hoogte; y++) {
    const filter = ruw[bron++];
    const regel = uit.subarray(y * stap, (y + 1) * stap);
    ruw.copy(regel, 0, bron, bron + stap);
    bron += stap;
    const vorige = y > 0 ? uit.subarray((y - 1) * stap, y * stap) : null;

    for (let x = 0; x < stap; x++) {
      const a = x >= bpp ? regel[x - bpp] : 0;
      const b = vorige ? vorige[x] : 0;
      const c = vorige && x >= bpp ? vorige[x - bpp] : 0;
      switch (filter) {
        case 0: break;
        case 1: regel[x] = (regel[x] + a) & 255; break;
        case 2: regel[x] = (regel[x] + b) & 255; break;
        case 3: regel[x] = (regel[x] + ((a + b) >> 1)) & 255; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          regel[x] = (regel[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
          break;
        }
        default: throw new Error(`onbekend PNG-filter ${filter} op regel ${y}`);
      }
    }
  }
  return uit;
}

export function leesPng(pad) {
  const buf = readFileSync(pad);
  if (!buf.subarray(0, 8).equals(HANDTEKENING)) throw new Error(`geen PNG: ${pad}`);

  let breedte = 0;
  let hoogte = 0;
  let bitdiepte = 0;
  let kleurtype = 0;
  let palet = null;
  let paletAlpha = null;
  const brokken = [];

  let offset = 8;
  while (offset + 8 <= buf.length) {
    const lengte = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + lengte);

    if (type === 'IHDR') {
      breedte = data.readUInt32BE(0);
      hoogte = data.readUInt32BE(4);
      bitdiepte = data[8];
      kleurtype = data[9];
      if (data[12] !== 0) throw new Error(`interlaced PNG wordt niet ondersteund: ${pad}`);
    } else if (type === 'PLTE') palet = data;
    else if (type === 'tRNS') paletAlpha = data;
    else if (type === 'IDAT') brokken.push(data);
    else if (type === 'IEND') break;

    offset += 12 + lengte;
  }

  if (bitdiepte !== 8) throw new Error(`alleen 8 bits per kanaal: ${pad} heeft ${bitdiepte}`);
  const kanalen = KANALEN[kleurtype];
  if (!kanalen) throw new Error(`onbekend PNG-kleurtype ${kleurtype}: ${pad}`);

  const vlak = ontfilter(inflateSync(Buffer.concat(brokken)), breedte, hoogte, kanalen);
  const pixels = Buffer.alloc(breedte * hoogte * 4);

  for (let i = 0; i < breedte * hoogte; i++) {
    const bron = i * kanalen;
    const doel = i * 4;
    switch (kleurtype) {
      case 0:
        pixels.fill(vlak[bron], doel, doel + 3);
        pixels[doel + 3] = 255;
        break;
      case 2:
        vlak.copy(pixels, doel, bron, bron + 3);
        pixels[doel + 3] = 255;
        break;
      case 3: {
        const index = vlak[bron];
        if (!palet) throw new Error(`indexed PNG zonder PLTE: ${pad}`);
        palet.copy(pixels, doel, index * 3, index * 3 + 3);
        pixels[doel + 3] = paletAlpha?.[index] ?? 255;
        break;
      }
      case 4:
        pixels.fill(vlak[bron], doel, doel + 3);
        pixels[doel + 3] = vlak[bron + 1];
        break;
      case 6:
        vlak.copy(pixels, doel, bron, bron + 4);
        break;
    }
  }

  return { breedte, hoogte, pixels };
}
