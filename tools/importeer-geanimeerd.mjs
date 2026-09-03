// Zet een geanimeerd model op de gedeelde colormap zonder het opnieuw op te bouwen.
//
//   node tools/importeer-geanimeerd.mjs <bronmap> <kitmap> <schaal> <bronNaam> <naam> [...]
//
// Het werk zelf staat in tools/importeer/geanimeerd.mjs, zodat een importscript dat
// eerst nog animaties moet samenvoegen dezelfde herkleuring kan gebruiken.
import { join } from 'node:path';
import { schrijfModel, zetColormapKlaar } from './importeer/bouw.mjs';
import { herkleurGeanimeerd, leesBron } from './importeer/geanimeerd.mjs';

const [bronDir, kitDir, schaalArg, ...paren] = process.argv.slice(2);
const schaal = Number(schaalArg);
zetColormapKlaar(kitDir);

for (let p = 0; p < paren.length; p += 2) {
  const [bronNaam, naam] = [paren[p], paren[p + 1]];
  const glb = leesBron(join(bronDir, `${bronNaam}.gltf`));
  const { json, bin, driehoeken } = herkleurGeanimeerd(glb, {
    naam,
    schaal,
    bron: 'Pirate Kit',
    bronNaam,
    generator: 'tools/importeer-geanimeerd.mjs',
  });

  schrijfModel(join(kitDir, `${naam}.glb`), { json, bin });
  console.log(`  ${naam.padEnd(22)} ${driehoeken} tri, ${json.animations.length} animaties, ${json.skins.length} skin`);
}
