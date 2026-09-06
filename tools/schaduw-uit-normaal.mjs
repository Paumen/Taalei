// Bakt een verloop in een baan die er geen heeft, uit de normalen van het model.
//
//   node tools/schaduw-uit-normaal.mjs --baan 1,0 <glb...>
//   node tools/schaduw-uit-normaal.mjs --baan 1,0 --lijst <glb...>
//
// Alleen voor een baan die volledig vlak is. Dit is geen herkleuring en het hoort
// niet bij de andere herkleurgereedschappen: die verplaatsen een verloop dat de
// maker gebakken heeft, dit tekent er een dat er nooit was. CLAUDE.md verbiedt het
// benaderen van een kleurgrens met geometrie — welke driehoek licht of donker
// hoort, komt uit de banen van het model en niet uit een drempel op normalen. Dat
// verbod gaat over een grens tússen materialen. Hier is geen grens en geen groep
// om terug te vinden: de bron zelf is vlak. pirate-quaternius/barrel heeft twee
// uv's in het hele model, allebei op één kleur van de atlas van de pack. Er valt
// niets te herstellen, er valt alleen iets bij te maken, en dat is een besluit van
// de PO en niet van dit gereedschap. Draai het dus niet op een baan die al een
// verloop draagt.
//
// De richting komt uit de modellen die hem wel hebben: op dungeon/chest,
// dungeon/keg, restaurant/crate-closed en dungeon/trunk-large-c correleert de
// y van de normaal met de stand in de baan tussen -0.40 en -0.82. Omhoog is
// lichter, omlaag donkerder, en dat is wat hier gelegd wordt. pirate-kit/chest
// staat op +0.34 en gaat tegen de rest in; die is niet gevolgd.
//
// De normaal komt per vertex uit het bestand zelf. Op een vlak gearceerd model is
// dat de normaal van het vlak, dus je krijgt de trapjes per facet die bij de stijl
// horen; op een glad model volgt hij de normalen die de maker heeft neergelegd.
// Zo hoeven er geen vertices gesplitst te worden en groeit het model niet.
//
// Het legt het verloop over de hele baan. Zet daarna de stand met
// anker-verloop.mjs: die bepaalt waar het zwaartepunt ligt en hoe breed de span is.
import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../catalog/tools/glb.mjs';

const KOLOMMEN = 16;
const RIJEN = 4;
const RAND = 0.004;

const argumenten = process.argv.slice(2);
let baan = null;
let lijst = false;
const bestanden = [];
for (let i = 0; i < argumenten.length; i++) {
  const a = argumenten[i];
  if (a === '--baan') baan = argumenten[++i];
  else if (a === '--lijst') lijst = true;
  else bestanden.push(a);
}
if (bestanden.length === 0 || !baan) {
  console.error('gebruik: node tools/schaduw-uit-normaal.mjs --baan k,r [--lijst] <glb...>');
  process.exit(1);
}
const [baanK, baanR] = baan.split(',').map(Number);

for (const pad of bestanden) {
  const glb = readGlb(pad);
  const { json, bin } = glb;
  const raak = [];

  const gedaan = new Set();
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      const ui = prim.attributes?.TEXCOORD_0;
      const ni = prim.attributes?.NORMAL;
      if (ui === undefined || gedaan.has(ui)) continue;
      if (ni === undefined) throw new Error(`${pad}: geen NORMAL, en zonder normaal valt er niets te bakken`);
      gedaan.add(ui);
      const normaal = readAccessor(glb, ni);
      const accessor = json.accessors[ui];
      if (accessor.componentType !== 5126) throw new Error(`${pad}: TEXCOORD_0 is geen float`);
      const bufferView = json.bufferViews[accessor.bufferView];
      const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
      const stap = bufferView.byteStride ?? 8;
      for (let i = 0; i < accessor.count; i++) {
        const uv = new Float32Array(bin.buffer, bin.byteOffset + start + i * stap, 2);
        const x = Math.min(Math.max(uv[0], 0), 1) * KOLOMMEN;
        const y = Math.min(Math.max(uv[1], 0), 1) * RIJEN;
        if (Math.floor(x) !== baanK || Math.floor(y) !== baanR) continue;
        const [nx, ny, nz] = [normaal.data[i * 3], normaal.data[i * 3 + 1], normaal.data[i * 3 + 2]];
        const len = Math.hypot(nx, ny, nz) || 1;
        raak.push({ uv, omhoog: ny / len, stand: y - baanR });
      }
    }
  }
  if (raak.length === 0) { console.log(`${pad}: geen uv's op ${baan}`); continue; }

  const standen = raak.map((r) => r.stand);
  const vlak = Math.max(...standen) - Math.min(...standen) < 1 / 128;
  if (!vlak) {
    console.log(`${pad}: baan ${baan} draagt al een verloop — overgeslagen`);
    continue;
  }

  const hoogste = Math.max(...raak.map((r) => r.omhoog));
  const laagste = Math.min(...raak.map((r) => r.omhoog));
  if (hoogste - laagste < 1e-6) { console.log(`${pad}: alle normalen wijzen dezelfde kant op`); continue; }

  for (const r of raak) {
    const deel = (hoogste - r.omhoog) / (hoogste - laagste);   // omhoog = licht = boven in de baan
    r.uv[1] = (baanR + Math.min(Math.max(deel, RAND), 1 - RAND)) / RIJEN;
  }
  const verslag = `${pad}: baan ${baan}, ${raak.length} uv's, normaal.y ${laagste.toFixed(2)} tot ${hoogste.toFixed(2)} over de hele baan gelegd`;
  if (lijst) { console.log(verslag); continue; }
  console.log(verslag);
  writeGlb(pad, json, bin, writeFileSync);
}
