// De lopende band achter de importeer-scripts: pak per model het bronbestand,
// zet het om, schrijf het weg en houd bij wat er onderweg gebeurde.
//
// Elk importeer-script beschrijft alleen wát er ingeladen wordt (welke modellen,
// onder welke naam, op welke schaal, uit welke pack); de stappen zelf staan hier.

import { existsSync, rmSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { leesGltf, leesObj } from './bron.mjs';
import { bouwGlb, schrijfModel, zetColormapKlaar, meetBelichting } from './bouw.mjs';
import { laadPalet } from './palet.mjs';

const MODEL_DIR = new URL('../../kits/workfiles/', import.meta.url).pathname;

export async function importeerKit({
  slug,
  bron,
  generator,
  schaal,
  oorsprong = 'gecentreerd',
  bronDir,
  formaat,
  bestand = (naam) => `${naam}.${formaat === 'obj' ? 'obj' : 'gltf'}`,
  modellen,
}) {
  const kitDir = join(MODEL_DIR, slug);
  const palet = laadPalet();

  for (const bestandsnaam of existsSync(kitDir) ? readdirSync(kitDir) : []) {
    if (bestandsnaam.endsWith('.glb')) unlinkSync(join(kitDir, bestandsnaam));
  }
  zetColormapKlaar(kitDir);

  const ingelezen = modellen.map(([bronNaam, naam]) => {
    const pad = join(bronDir, bestand(bronNaam));
    if (!existsSync(pad)) throw new Error(`${slug}: bronbestand ontbreekt — ${pad}`);
    return { bronNaam, naam, primitieven: formaat === 'obj' ? leesObj(pad) : leesGltf(pad) };
  });

  // Eerste ronde over de hele kit: hoe licht staat deze pack ten opzichte van
  // de gedeelde sheet? Dat levert één winst voor alle modellen samen.
  let som = 0;
  let aantal = 0;
  for (const { primitieven } of ingelezen) {
    const meting = meetBelichting(primitieven, formaat !== 'obj');
    som += meting.som;
    aantal += meting.aantal;
  }
  const winst = aantal ? palet.niveau / (som / aantal) : 1;

  const verslagen = [];
  for (const { bronNaam, naam, primitieven } of ingelezen) {
    const model = bouwGlb({
      primitieven,
      naam,
      bronNaam,
      bron,
      generator,
      schaal,
      oorsprong,
      vOmlaag: formaat !== 'obj',
      winst,
      palet,
    });
    schrijfModel(join(kitDir, `${naam}.glb`), model);
    verslagen.push({ naam, ...model.verslag });
  }

  const ergste = [...verslagen].sort((a, b) => b.ergsteAfstand - a.ergsteAfstand);
  const driehoeken = verslagen.reduce((som, v) => som + v.driehoeken, 0);
  console.log(
    `${slug}: ${verslagen.length} modellen, ${driehoeken} driehoeken, schaal ${schaal}` +
      (Math.abs(winst - 1) > 0.02 ? `, belichting ×${winst.toFixed(2)}` : ''),
  );
  console.log(`  grootste kleurafstand: ${ergste.slice(0, 5).map((v) => `${v.naam} ${v.ergsteAfstand} (${v.ergsteKleur.bron}→${v.ergsteKleur.doel})`).join(', ')}`);

  return verslagen;
}

export const schoon = (pad) => existsSync(pad) && rmSync(pad, { recursive: true });
