// Zet een hele kit op een andere schaal.
//
//   node tools/herschaal-kit.mjs <kit> <factor>
//   node tools/herschaal-kit.mjs dungeon 0.7142857
//
// De importeer-pijplijn bakt één schaal per pack in het model: de wortelnode krijgt
// scale en translation, allebei recht evenredig met die schaal (zie importeer/bouw.mjs).
// Opnieuw importeren kan alleen met de originele pack erbij, en die zit niet in de repo,
// dus vermenigvuldigt dit script scale en translation van elke wortelnode met de factor.
// Dat geeft hetzelfde resultaat als importeren op schaal × factor. De schaal in
// asset.extras.taaleiland gaat mee, zodat het model blijft vertellen waar hij vandaan komt.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const JSON_CHUNK = 0x4e4f534a;
const afronden = (waarde, decimalen = 6) => Number(waarde.toFixed(decimalen));

function leesGlb(pad) {
  const buf = readFileSync(pad);
  const chunks = [];
  for (let o = 12; o < buf.length; ) {
    const lengte = buf.readUInt32LE(o);
    const type = buf.readUInt32LE(o + 4);
    chunks.push({ type, data: buf.subarray(o + 8, o + 8 + lengte) });
    o += 8 + lengte;
  }
  const json = chunks.find((c) => c.type === JSON_CHUNK);
  if (!json) throw new Error(`${pad}: geen JSON-chunk`);
  return { json: JSON.parse(json.data.toString('utf8')), chunks };
}

function schrijfGlb(pad, json, chunks) {
  const delen = chunks.map((c) =>
    c.type === JSON_CHUNK ? { type: c.type, data: Buffer.from(JSON.stringify(json), 'utf8') } : c,
  );
  const blokken = delen.map(({ type, data }) => {
    const vul = (4 - (data.length % 4)) % 4;
    const kop = Buffer.alloc(8);
    kop.writeUInt32LE(data.length + vul, 0);
    kop.writeUInt32LE(type, 4);
    // JSON vult met spaties, BIN met nullen — zo schrijft de glTF-spec het voor.
    return Buffer.concat([kop, data, Buffer.alloc(vul, type === JSON_CHUNK ? 0x20 : 0)]);
  });
  const kop = Buffer.alloc(12);
  kop.write('glTF', 0, 'ascii');
  kop.writeUInt32LE(2, 4);
  kop.writeUInt32LE(12 + blokken.reduce((som, b) => som + b.length, 0), 8);
  writeFileSync(pad, Buffer.concat([kop, ...blokken]));
}

const [kit, factorArg] = process.argv.slice(2);
const factor = Number(factorArg);
if (!kit || !Number.isFinite(factor) || factor <= 0) {
  throw new Error('gebruik: node tools/herschaal-kit.mjs <kit> <factor>');
}

const dir = new URL(`../kits/workfiles/${kit}/`, import.meta.url).pathname;
const bestanden = readdirSync(dir).filter((n) => n.endsWith('.glb')).sort();
if (!bestanden.length) throw new Error(`${kit}: geen modellen gevonden in ${dir}`);

for (const naam of bestanden) {
  const pad = join(dir, naam);
  const { json, chunks } = leesGlb(pad);
  const wortels = json.scenes?.[json.scene ?? 0]?.nodes ?? [];
  if (!wortels.length) throw new Error(`${naam}: geen wortelnode in de scene`);
  for (const i of wortels) {
    const node = json.nodes[i];
    const schaal = node.scale ?? [1, 1, 1];
    node.scale = schaal.map((waarde) => afronden(waarde * factor));
    if (node.translation) node.translation = node.translation.map((waarde) => afronden(waarde * factor));
  }
  const extras = json.asset.extras?.taaleiland;
  if (extras && typeof extras.schaal === 'number') extras.schaal = afronden(extras.schaal * factor);
  schrijfGlb(pad, json, chunks);
}

console.log(`${kit}: ${bestanden.length} modellen × ${factor}`);
