// De lopende band achter de importeer-scripts: pak per model het bronbestand,
// zet het om, schrijf het weg en houd bij wat er onderweg gebeurde.
//
// Elk importeer-script beschrijft alleen wát er ingeladen wordt (welke modellen,
// onder welke naam, op welke schaal, uit welke pack); de stappen zelf staan hier.

import { existsSync, rmSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { leesGltf, leesObj } from './bron.mjs';
import { bouwGlb, schrijfModel, zetColormapKlaar } from './bouw.mjs';
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

  const verslagen = [];
  for (const [bronNaam, naam] of modellen) {
    const pad = join(bronDir, bestand(bronNaam));
    if (!existsSync(pad)) throw new Error(`${slug}: bronbestand ontbreekt — ${pad}`);

    const primitieven = formaat === 'obj' ? leesObj(pad) : leesGltf(pad);
    const model = bouwGlb({
      primitieven,
      naam,
      bronNaam,
      bron,
      generator,
      schaal,
      oorsprong,
      vOmlaag: formaat !== 'obj',
      palet,
    });
    schrijfModel(join(kitDir, `${naam}.glb`), model);
    verslagen.push({ naam, ...model.verslag });
  }

  const ergste = [...verslagen].sort((a, b) => b.ergsteAfstand - a.ergsteAfstand);
  const driehoeken = verslagen.reduce((som, v) => som + v.driehoeken, 0);
  console.log(`${slug}: ${verslagen.length} modellen, ${driehoeken} driehoeken, schaal ${schaal}`);
  console.log(`  grootste kleurafstand: ${ergste.slice(0, 5).map((v) => `${v.naam} ${v.ergsteAfstand} (${v.ergsteKleur.bron}→${v.ergsteKleur.doel})`).join(', ')}`);

  return verslagen;
}

export const schoon = (pad) => existsSync(pad) && rmSync(pad, { recursive: true });
