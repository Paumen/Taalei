// Just enough of the zip format to unpack the source packs under kits/sources.
//
// A zip ends with an end-of-central-directory record that points at the central
// directory; every entry there says where its data sits and how it was packed. Only
// "stored" and "deflate" occur in these packs.

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { inflateRawSync } from 'node:zlib';

const EIND = 0x06054b50;
const EIND64 = 0x06064b50;
const INGANG = 0x02014b50;

function zoekEinde(buf) {
  // the record is at the very end unless the zip carries a comment, so search backwards
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 0xffff; i--) {
    if (buf.readUInt32LE(i) === EIND) return i;
  }
  throw new Error('no end-of-central-directory record — not a zip?');
}

function centraleMap(buf) {
  const einde = zoekEinde(buf);
  let aantal = buf.readUInt16LE(einde + 10);
  let begin = buf.readUInt32LE(einde + 16);

  // more than 65535 entries or over 4 GB: the real numbers sit in the zip64 record
  if (aantal === 0xffff || begin === 0xffffffff) {
    for (let i = einde - 20; i >= 0; i--) {
      if (buf.readUInt32LE(i) !== EIND64) continue;
      aantal = Number(buf.readBigUInt64LE(i + 32));
      begin = Number(buf.readBigUInt64LE(i + 48));
      break;
    }
  }
  return { aantal, begin };
}

/** Unpacks every file in `zip` under `doel`, keeping the paths inside the archive. */
export function pakUit(zip, doel) {
  const buf = readFileSync(zip);
  const { aantal, begin } = centraleMap(buf);

  let pos = begin;
  const geschreven = [];

  for (let i = 0; i < aantal; i++) {
    if (buf.readUInt32LE(pos) !== INGANG) break;
    const methode = buf.readUInt16LE(pos + 10);
    const gepakt = buf.readUInt32LE(pos + 20);
    const naamLengte = buf.readUInt16LE(pos + 28);
    const extraLengte = buf.readUInt16LE(pos + 30);
    const commentaarLengte = buf.readUInt16LE(pos + 32);
    const lokaal = buf.readUInt32LE(pos + 42);
    const naam = buf.toString('utf8', pos + 46, pos + 46 + naamLengte);
    pos += 46 + naamLengte + extraLengte + commentaarLengte;

    if (naam.endsWith('/')) continue;
    // a path that climbs out of the target directory is never legitimate here
    if (naam.split(/[\\/]/).includes('..')) continue;

    // the local header repeats the name and carries its own extra field, whose length
    // may differ from the one in the central directory
    const lokaalNaam = buf.readUInt16LE(lokaal + 26);
    const lokaalExtra = buf.readUInt16LE(lokaal + 28);
    const start = lokaal + 30 + lokaalNaam + lokaalExtra;
    const rauw = buf.subarray(start, start + gepakt);

    const inhoud =
      methode === 0 ? rauw
      : methode === 8 ? inflateRawSync(rauw)
      : null;
    if (!inhoud) throw new Error(`${zip}: unsupported compression ${methode} for ${naam}`);

    const pad = join(doel, ...naam.split(/[\\/]/));
    mkdirSync(dirname(pad), { recursive: true });
    writeFileSync(pad, inhoud);
    geschreven.push(pad.slice(doel.length + 1).split(sep).join('/'));
  }

  return geschreven;
}
