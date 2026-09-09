#!/usr/bin/env node
// Stamp asset.extras.taaleiland.bron into every workfile .glb, so a render can name
// the kit a model came from. tools/renders/render.mjs reads that field and nothing
// else: without it a tile is captioned with the model name alone.
//
// The value is the catalogue slug (catalog/catalog.json kits[].slug), which is also
// the workfile folder name -- one short, stable form everywhere. Kits absent from the
// catalogue take their folder name via EXTRA below.
//
//   node tools/stempel-bron.mjs [--dry] [--kit <slug>]
//
// Rewriting the JSON chunk in place keeps the binary chunk byte-identical, so nothing
// about the geometry, textures or accessors changes -- only the header lengths move.

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = 'kits/workfiles';
const CATALOG = 'catalog/catalog.json';

// Kits with workfiles but no catalogue entry: no slug to read, so name them here.
const EXTRA = { 'onderwater-kit': 'ocean' };

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const kitArg = args[args.indexOf('--kit') + 1];
const onlyKit = args.includes('--kit') ? kitArg : null;
if (args.includes('--kit') && !kitArg) die('--kit needs a slug');

function die(msg) { console.error('stempel-bron: ' + msg); process.exit(1); }

const JSON_CHUNK = 0x4e4f534a, BIN_CHUNK = 0x004e4942;

// A glTF chunk is padded to 4 bytes -- JSON with spaces, BIN with zeros -- and both
// the chunk length and the 12-byte header total must be rewritten to match.
function readGlb(buf) {
  if (buf.length < 12 || buf.readUInt32LE(0) !== 0x46546c67) return null;
  const chunks = [];
  for (let off = 12; off + 8 <= buf.length;) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    chunks.push({ type, data: buf.subarray(off + 8, off + 8 + len) });
    off += 8 + len;
  }
  const json = chunks.find(c => c.type === JSON_CHUNK);
  return json ? { chunks, json } : null;
}

function writeGlb(chunks) {
  const parts = [];
  let total = 12;
  for (const c of chunks) {
    const pad = (4 - (c.data.length % 4)) % 4;
    const head = Buffer.alloc(8);
    head.writeUInt32LE(c.data.length + pad, 0);
    head.writeUInt32LE(c.type, 4);
    parts.push(head, c.data);
    if (pad) parts.push(Buffer.alloc(pad, c.type === JSON_CHUNK ? 0x20 : 0));
    total += 8 + c.data.length + pad;
  }
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  return Buffer.concat([header, ...parts]);
}

const catalog = JSON.parse(await fs.readFile(CATALOG, 'utf8'));
const slugs = new Map(catalog.kits.map(k => [k.slug, k.slug]));

const dirs = (await fs.readdir(ROOT, { withFileTypes: true }))
  .filter(e => e.isDirectory() && e.name !== 'Textures')
  .map(e => e.name)
  .filter(n => !onlyKit || n === onlyKit);
if (onlyKit && !dirs.length) die('no workfile folder for kit: ' + onlyKit);

let stamped = 0, changed = 0, skipped = 0;
const unknown = [];

for (const kit of dirs.sort()) {
  const bron = slugs.get(kit) || EXTRA[kit];
  if (!bron) { unknown.push(kit); continue; }
  const dir = path.join(ROOT, kit);
  const files = (await fs.readdir(dir)).filter(f => f.toLowerCase().endsWith('.glb')).sort();
  let hit = 0, was = new Set();
  for (const f of files) {
    const file = path.join(dir, f);
    const buf = await fs.readFile(file);
    const glb = readGlb(buf);
    if (!glb) { console.warn('! not a glb container: ' + file); skipped++; continue; }
    const doc = JSON.parse(glb.json.data.toString('utf8'));
    doc.asset ??= {};
    doc.asset.extras ??= {};
    const ex = doc.asset.extras;
    const prev = ex.taaleiland?.bron ?? ex.bron ?? ex.kit ?? ex.source ?? '';
    if (prev !== bron) was.add(prev || '(geen)');
    // The renderer looks one level down, and every other field of this repo's own
    // metadata already lives under taaleiland -- keep bron there with them.
    ex.taaleiland = { ...(ex.taaleiland || {}), bron };
    delete ex.bron; delete ex.kit; delete ex.source;
    if (prev === bron) { stamped++; hit++; continue; }
    glb.json.data = Buffer.from(JSON.stringify(doc), 'utf8');
    if (!dry) await fs.writeFile(file, writeGlb(glb.chunks));
    stamped++; changed++; hit++;
  }
  console.log(kit.padEnd(20) + String(hit).padStart(4) + ' glb  bron=' + bron
    + (was.size ? '   was: ' + [...was].join(' | ') : '   (unchanged)'));
}

if (unknown.length) {
  console.error('\n! no slug and no EXTRA entry for: ' + unknown.join(', '));
  console.error('  add them to catalog/catalog.json kits[] or to EXTRA in this script');
}
console.log('\n' + (dry ? 'dry run: ' : '') + stamped + ' glb read, ' + changed + ' rewritten'
  + (skipped ? ', ' + skipped + ' skipped' : ''));
process.exit(unknown.length ? 1 : 0);
