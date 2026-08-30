import { existsSync, rmSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { leesGltf, leesObj } from './bron.mjs';
import { bouwGlb, schrijfModel, zetColormapKlaar, meetBelichting } from './bouw.mjs';
import { laadPalet } from './palet.mjs';

const MODEL_DIR = new URL('../../kits/workfiles/', import.meta.url).pathname;

// --alleen naam[,naam] rebuilds just those models and leaves the rest of the kit
// alone. Without it an import is the whole kit: every .glb in the folder goes first,
// so a kit that also holds models from another import script (the animated Quaternius
// characters, say) must be rebuilt one model at a time or it loses them. The lighting
// gain is still measured over the whole model list, so a partial rebuild lands on the
// same bands a full one would.
function alleenUitArgv() {
  const n = process.argv.indexOf('--alleen');
  if (n === -1) return null;
  const waarde = process.argv[n + 1];
  if (!waarde) throw new Error('--alleen expects a comma-separated list of model names');
  return new Set(waarde.split(',').map((naam) => naam.trim()).filter(Boolean));
}

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
  const alleen = alleenUitArgv();

  if (alleen) {
    const onbekend = [...alleen].filter((naam) => !modellen.some(([, n]) => n === naam));
    if (onbekend.length) throw new Error(`${slug}: --alleen names a model the kit doesn't have — ${onbekend.join(', ')}`);
  } else {
    for (const bestandsnaam of existsSync(kitDir) ? readdirSync(kitDir) : []) {
      if (bestandsnaam.endsWith('.glb')) unlinkSync(join(kitDir, bestandsnaam));
    }
  }
  zetColormapKlaar(kitDir);

  const ingelezen = modellen.map(([bronNaam, naam]) => {
    const pad = join(bronDir, bestand(bronNaam));
    if (!existsSync(pad)) throw new Error(`${slug}: bronbestand ontbreekt — ${pad}`);
    return { bronNaam, naam, primitieven: formaat === 'obj' ? leesObj(pad) : leesGltf(pad) };
  });

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
    if (alleen && !alleen.has(naam)) continue;
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
