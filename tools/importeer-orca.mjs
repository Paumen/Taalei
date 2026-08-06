/**
 * Zet orca.glb en orca-calf.glb in kits/onderwater-kit.
 *
 * Draai vanuit de repo-root:  node tools/importeer-orca.mjs <map-met-glb>
 *
 * Deze twee horen niet bij de Quaternius-pack. Ze zijn elders gegenereerd —
 * de glTF vermeldt `generator: build_orca + rig_orca` — en komen al als .glb
 * binnen, op maat en gerigd, met één clip `Swim`. Er is dus geen conversie en
 * geen schaalfactor nodig; het enige dat dit script doet is de oorsprong
 * rechtzetten, net als bij de rest van de kit: voet op y=0, grondvlak
 * gecentreerd op x/z (stijlgids §5). Zoals aangeleverd hangt de orka met zijn
 * buik onder y=0 en staat hij ruim een unit uit het midden.
 *
 * Materialen, meshes, skin en animatie blijven ongemoeid. Twee dingen wijken
 * daardoor af van de rest van de catalogus, met opzet — zie de PR:
 *
 *  - Acht materialen met eigen basiskleuren en geen UV's, dus geen gedeelde
 *    colormap. De kleuren staan als cellen in het palet `onderwater`.
 *  - Glad geshade, waar de kits gefacetteerd zijn (stijlgids §0 en §2).
 *
 * En één ding dat in het genererende script hoort te worden opgelost: het
 * materiaal `OrcaFlukeWhite` is een vlak zonder dikte dat exact op de
 * onderkant van de zwarte staartvin ligt (beide y=-0,025, zelfde x/z) met zijn
 * normaal recht omhoog. Het valt dus samen met een vlak dat er al is — dat
 * flikkert — en het kijkt de verkeerde kant op voor een witte onderkant.
 * Hier is dat niet te repareren zonder de winding om te klappen en de witte
 * kant een eigen offset te geven, en dat overschrijft de volgende run van
 * build_orca weer.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leesGlb, schrijfGlb, meetScene, zetOpOorsprong } from './glb.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOEL = join(ROOT, 'kits', 'onderwater-kit');

/** Bronbestand → naam in de kit. */
const NAMEN = {
  orca_v35_rigged: 'orca',
  orca_calf_v1_rigged: 'orca-calf',
};

const bronMap = process.argv[2];
if (!bronMap) {
  console.error('gebruik: node tools/importeer-orca.mjs <map-met-glb>');
  process.exit(1);
}

mkdirSync(DOEL, { recursive: true });

for (const [bron, naam] of Object.entries(NAMEN)) {
  const glb = leesGlb(join(bronMap, `${bron}.glb`));
  const voor = zetOpOorsprong(glb, naam);

  const pad = join(DOEL, `${naam}.glb`);
  schrijfGlb(pad, glb.json, glb.bin, writeFileSync);

  const na = meetScene(leesGlb(pad));
  const maat = (m) => m.wdh.map((v) => v.toFixed(2).padStart(6)).join(' × ');
  console.log(
    `${bron.padEnd(20)} → ${naam.padEnd(10)} ${maat(voor)}` +
    `  voet y=${voor.min[1].toFixed(3)} → ${na.min[1].toFixed(3)}`,
  );
}

console.log(`${Object.keys(NAMEN).length} modellen → kits/onderwater-kit/`);
