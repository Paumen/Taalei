// De vissen komen uit de FBX, niet uit de OBJ: hun animaties zitten alleen daar.
// Deze pack levert geen glTF, dus de FBX gaat er eerst doorheen met fbx2gltf en het
// resultaat gaat daarna door tools/importeer-geanimeerd.mjs, dat de skin en de
// animatie laat staan en alleen de kleuren op de gedeelde colormap zet.
//
//   npm install fbx2gltf          (staat niet in de repo, alleen nodig bij herimport)
//   node tools/importeer-fish-quaternius.mjs <FBX-map>
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const MODELLEN = [
  ['Dolphin',   'dolphin'],
  ['Fish1',     'fish-1'],
  ['Fish2',     'fish-2'],
  ['Fish3',     'fish-3'],
  ['Manta ray', 'manta-ray'],
  ['Shark',     'shark'],
  ['Whale',     'whale'],
];

const bronDir = process.argv[2] ?? (() => { throw new Error('geef het pad naar de FBX-map'); })();
const werk = mkdtempSync(join(tmpdir(), 'taalei-vis-'));

let convert;
try { ({ default: convert } = await import('fbx2gltf')); }
catch { throw new Error('fbx2gltf ontbreekt — npm install fbx2gltf'); }

for (const [bronNaam, naam] of MODELLEN) {
  const uit = join(werk, `${bronNaam}.gltf`);
  await convert(join(bronDir, `${bronNaam}.fbx`), uit, ['--khr-materials-unlit']);
  const map = join(werk, `${bronNaam}_out`);
  const gltf = readdirSync(map).find((f) => f.endsWith('.gltf')).slice(0, -5);
  execFileSync('node', ['tools/importeer-geanimeerd.mjs', map,
    'kits/workfiles/fish-quaternius', '0.11', gltf, naam], { stdio: 'inherit' });
}
