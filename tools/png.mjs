/**
 * PNG lezen en schrijven, zonder afhankelijkheden.
 *
 * Gedeeld door tools/kleurmap.mjs: om een model op de gedeelde colormap te
 * zetten moet je weten welke kleur een UV in de bron-atlas aanwijst, en welke
 * UV die kleur in kits/colormap.png teruggeeft. Daar is een decoder voor nodig.
 *
 * Bewust smal gehouden: 8 bits per kanaal, niet-interlaced. Dat is wat de
 * atlassen in deze repo zijn (kits/colormap.png is RGBA, de nature-pack levert
 * een indexed PNG) en meer heeft geen van de tools nodig. Alles daarbuiten
 * levert een duidelijke fout op in plaats van stilzwijgend verkeerde kleuren.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';

const HANDTEKENING = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Kanalen per kleurtype: 0=grijs, 2=rgb, 3=indexed, 4=grijs+alpha, 6=rgba. */
const KANALEN = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * Draait de per-regel filters van de PNG-spec terug. Elke regel begint met een
 * filterbyte; de vier filters voorspellen een byte uit zijn linkerbuur (a), de
 * byte erboven (b) en die linksboven (c).
 */
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
          // Paeth: kies de buur die het dichtst bij de lineaire voorspelling ligt.
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

/**
 * @param {string} pad
 * @returns {{breedte: number, hoogte: number, pixels: Buffer}} pixels is RGBA,
 *   vier bytes per pixel, ongeacht hoe het bestand was opgeslagen.
 */
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

function brok(type, data) {
  const kop = Buffer.alloc(8);
  kop.writeUInt32BE(data.length, 0);
  kop.write(type, 4, 'ascii');
  const staart = Buffer.alloc(4);
  staart.writeUInt32BE(crc32(Buffer.concat([kop.subarray(4), data])), 0);
  return Buffer.concat([kop, data, staart]);
}

const CRC_TABEL = (() => {
  const tabel = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabel[n] = c;
  }
  return tabel;
})();

function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC_TABEL[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/**
 * Past één van de vijf filters uit de PNG-spec toe op een regel.
 * `uit` krijgt het resultaat; `regel` en `vorige` blijven ongemoeid.
 */
function filterRegel(soort, regel, vorige, bpp, uit) {
  for (let x = 0; x < regel.length; x++) {
    const a = x >= bpp ? regel[x - bpp] : 0;
    const b = vorige ? vorige[x] : 0;
    const c = vorige && x >= bpp ? vorige[x - bpp] : 0;
    switch (soort) {
      case 0: uit[x] = regel[x]; break;
      case 1: uit[x] = (regel[x] - a) & 255; break;
      case 2: uit[x] = (regel[x] - b) & 255; break;
      case 3: uit[x] = (regel[x] - ((a + b) >> 1)) & 255; break;
      case 4: {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        uit[x] = (regel[x] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
        break;
      }
    }
  }
}

/**
 * Schrijft RGBA weg als niet-interlaced PNG.
 *
 * Per regel wordt het filter gekozen dat de kleinste som van absolute waarden
 * oplevert — de vuistregel uit de PNG-spec. Dat is de moeite waard omdat
 * kits/colormap.png voor het grootste deel uit vlakke banen bestaat: met filter
 * 0 op elke regel wordt het bestand ruim twee keer zo groot, en het staat in
 * elke kitmap opnieuw.
 */
export function schrijfPng(pad, { breedte, hoogte, pixels }) {
  const stap = breedte * 4;
  const ruw = Buffer.alloc((stap + 1) * hoogte);
  const kandidaat = Buffer.alloc(stap);
  const beste = Buffer.alloc(stap);

  for (let y = 0; y < hoogte; y++) {
    const regel = pixels.subarray(y * stap, (y + 1) * stap);
    const vorige = y > 0 ? pixels.subarray((y - 1) * stap, y * stap) : null;

    let besteSoort = 0;
    let besteScore = Infinity;
    for (let soort = 0; soort < 5; soort++) {
      filterRegel(soort, regel, vorige, 4, kandidaat);
      let score = 0;
      // Bytes als teken-met-teken lezen: 250 is een afwijking van 6, niet van 250.
      for (let x = 0; x < stap; x++) score += kandidaat[x] < 128 ? kandidaat[x] : 256 - kandidaat[x];
      if (score < besteScore) {
        besteScore = score;
        besteSoort = soort;
        kandidaat.copy(beste);
      }
    }

    ruw[y * (stap + 1)] = besteSoort;
    beste.copy(ruw, y * (stap + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(breedte, 0);
  ihdr.writeUInt32BE(hoogte, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  writeFileSync(pad, Buffer.concat([
    HANDTEKENING,
    brok('IHDR', ihdr),
    brok('IDAT', deflateSync(ruw, { level: 9 })),
    brok('IEND', Buffer.alloc(0)),
  ]));
}
