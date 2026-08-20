/**
 * Kleuren van modellen die al in de repo staan, zonder bronpack en zonder
 * herimport.
 *
 * Draai vanuit de repo-root:  node tools/verf.mjs [--toon]
 *
 * Waarom dit los staat van de importeurs: een kleur veranderen is geen import.
 * Een .glb wijst met zijn UV's een cel van kits/colormap.png aan, en verticaal
 * binnen die cel de schakering van licht naar donker. Een model omverven is dus
 * niets meer dan die wijzers verzetten naar een andere kolom — de hoogte blijft
 * staan, dus de schakering ook. Dat kan hier rechtstreeks op de bestanden in de
 * repo, in een seconde, zonder de bronbestanden erbij te hoeven halen.
 *
 * Wat er gebeurt staat in kits/kleurkeuze.json. Met --toon verandert er niets
 * en zie je alleen wat een draai zou doen.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leesGlb, schrijfGlb, leesAccessor } from './glb.mjs';
import { leesPng, schrijfPng } from './png.mjs';
import { KOLOMMEN, RIJEN, voegGradientCelToe, kopieerColormap, naarHex } from './kleurmap.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KITS = join(ROOT, 'kits');
const COLORMAP = join(KITS, 'colormap.png');
const toon = process.argv.includes('--toon');

const uitHex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const celVan = (u, v) => [Math.floor(u * KOLOMMEN), Math.floor(v * RIJEN)];

/** Modellen die bij een `wat` horen: "kit" of "kit/patroon" met * als jokerteken. */
function modellenVoor(wat) {
  const [kit, patroon = '*'] = wat.split('/');
  const map = join(KITS, kit);
  if (!existsSync(map)) throw new Error(`kits/${kit} bestaat niet`);
  const regex = new RegExp('^' + patroon.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  return readdirSync(map)
    .filter((f) => f.endsWith('.glb') && regex.test(f.replace(/\.glb$/, '')))
    .map((f) => ({ kit, naam: f.replace(/\.glb$/, ''), pad: join(map, f) }));
}

/**
 * Verzet de UV's van één model van de ene cel naar de andere.
 *
 * De horizontale plek wordt het midden van de doelkolom — de baan is daar toch
 * één kleur, en het midden houdt de UV weg van de randen waar de filtering
 * kleuren zou mengen. De verticale plek schuift mee met de cel, zodat een
 * hoekpunt dat op tweederde van zijn baan zat daar ook weer terechtkomt.
 *
 * @returns {number} het aantal verzette hoekpunten
 */
function verf(glb, van, naar, breedte, hoogte) {
  const celHoog = 1 / RIJEN;
  const midden = (Math.floor((naar[0] + 0.5) * (breedte / KOLOMMEN)) + 0.5) / breedte;
  let verzet = 0;

  for (const mesh of glb.json.meshes ?? []) {
    for (const prim of mesh.primitives) {
      if (prim.attributes.TEXCOORD_0 === undefined) continue;
      const acc = glb.json.accessors[prim.attributes.TEXCOORD_0];
      const bv = glb.json.bufferViews[acc.bufferView];
      const start = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
      const stap = bv.byteStride ?? 8;

      for (let i = 0; i < acc.count; i++) {
        const p = start + i * stap;
        const u = glb.bin.readFloatLE(p);
        const v = glb.bin.readFloatLE(p + 4);
        const cel = celVan(u, v);
        if (van && (cel[0] !== van[0] || cel[1] !== van[1])) continue;

        // Waar in zijn eigen cel het hoekpunt zat, en dus waar het weer komt.
        const binnen = v - cel[1] * celHoog;
        const nieuweV = naar[1] * celHoog + binnen;
        // Op de pixelrij houden, zodat er niets tussen twee rijen in valt.
        const rij = Math.min(hoogte - 1, Math.max(0, Math.floor(nieuweV * hoogte)));
        glb.bin.writeFloatLE(midden, p);
        glb.bin.writeFloatLE((rij + 0.5) / hoogte, p + 4);
        verzet++;
      }
    }
  }
  return verzet;
}

/* -- draaien --------------------------------------------------------------- */

const json = JSON.parse(readFileSync(join(KITS, 'kleurkeuze.json'), 'utf8'));
const keuzes = json.keuzes ?? [];
if (keuzes.length === 0) {
  console.log('kits/kleurkeuze.json heeft geen keuzes; er valt niets te verven.');
  process.exit(0);
}

/* Eerst de banen die de keuzes vragen, want een model kan pas naar een cel toe
 * als daar kleur in staat. */
const atlas = leesPng(COLORMAP);
let geschilderd = 0;
for (const keuze of keuzes) {
  if (!keuze.wordt) continue;
  const boven = uitHex(keuze.wordt.boven);
  const onder = uitHex(keuze.wordt.onder);
  console.log(`cel [${keuze.naar}] ← ${naarHex(...boven)} → ${naarHex(...onder)}`);
  if (!toon) {
    voegGradientCelToe(atlas, keuze.naar, boven, onder);
    geschilderd++;
  }
}
if (geschilderd > 0) {
  schrijfPng(COLORMAP, atlas);
  const kits = kopieerColormap(KITS);
  console.log(`kits/colormap.png bijgewerkt en gekopieerd naar: ${kits.join(', ')}`);
}

/* Dan de modellen. */
const verplaatst = new Map(); // 'kit/naam' → [van, naar], voor kits/palet.json
for (const keuze of keuzes) {
  const van = keuze.van ?? null;
  let raak = 0;
  let hoekpunten = 0;

  for (const model of modellenVoor(keuze.wat)) {
    const glb = leesGlb(model.pad);
    const aantal = verf(glb, van, keuze.naar, atlas.breedte, atlas.hoogte);
    if (aantal === 0) continue;
    raak++;
    hoekpunten += aantal;
    if (!toon) schrijfGlb(model.pad, glb.json, glb.bin, writeFileSync);
    verplaatst.set(`${model.kit}/${model.naam}`, [van, keuze.naar]);
  }

  console.log(
    `${keuze.wat.padEnd(28)} ${van ? `cel [${van}]` : 'alles'} → cel [${keuze.naar}]  ` +
    `${raak} modellen, ${hoekpunten} hoekpunten${toon ? '  (alleen tonen)' : ''}`,
  );
  if (keuze.reden) console.log(`   ${keuze.reden}`);
}

/* En kits/palet.json bijwerken, want build-catalog.mjs leest de kleur van een
 * model daaruit; een model dat verhuist en daar blijft staan krijgt in de
 * catalogus een kleur die het niet meer heeft. */
if (!toon && verplaatst.size > 0) {
  const paletPad = join(KITS, 'palet.json');
  const palet = JSON.parse(readFileSync(paletPad, 'utf8'));
  const gedeeld = palet.paletten.find((p) => p.id === 'gedeeld');
  if (!gedeeld) throw new Error('kits/palet.json heeft geen palet "gedeeld"');

  for (const [sleutel, [van, naar]] of verplaatst) {
    const [kit, naam] = sleutel.split('/');
    for (const cel of gedeeld.cellen) {
      if (van && (cel.cel[0] !== van[0] || cel.cel[1] !== van[1])) continue;
      for (const bron of cel.bronnen ?? []) {
        if (bron.kit !== kit) continue;
        bron.modellen = bron.modellen.filter((m) => m !== naam);
      }
    }
    let doel = gedeeld.cellen.find((c) => c.cel[0] === naar[0] && c.cel[1] === naar[1]);
    if (!doel) {
      const keuze = keuzes.find((k) => k.naar[0] === naar[0] && k.naar[1] === naar[1] && k.wordt);
      const midden = keuze
        ? uitHex(keuze.wordt.boven).map((v, i) => Math.round((v + uitHex(keuze.wordt.onder)[i]) / 2))
        : [0, 0, 0];
      doel = { cel: [...naar], kleur: naarHex(...midden), bronnen: [] };
      gedeeld.cellen.push(doel);
    }
    let bron = doel.bronnen.find((b) => b.kit === kit);
    if (!bron) {
      bron = { kit, modellen: [] };
      doel.bronnen.push(bron);
    }
    bron.modellen = [...new Set([...bron.modellen, naam])].sort();
  }

  for (const cel of gedeeld.cellen) {
    cel.bronnen = cel.bronnen.filter((b) => b.modellen.length > 0);
    cel.bronnen.sort((a, b) => (a.kit < b.kit ? -1 : a.kit > b.kit ? 1 : 0));
  }
  writeFileSync(paletPad, `${JSON.stringify(palet, null, 1)}\n`);
  console.log(`kits/palet.json bijgewerkt voor ${verplaatst.size} modellen`);
}

console.log(toon ? '\nniets gewijzigd (--toon)' : '\nklaar. Draai node tools/build-catalog.mjs om de catalogus bij te werken.');
