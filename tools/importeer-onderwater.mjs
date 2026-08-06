/**
 * Zet de ruwe onderwater-modellen van Quaternius om naar kits/onderwater-kit.
 *
 * Draai vanuit de repo-root:  node tools/importeer-onderwater.mjs <map-met-glb>
 *
 * De bronbestanden (.fbx en .blend) staan niet in de repo — alleen het
 * resultaat. Dit script legt vast wát er met die bestanden is gebeurd, zodat
 * een volgende import dezelfde kit oplevert.
 *
 * Stap 1 — .fbx → .glb, per bestand:
 *
 *     FBX2glTF -i <naam>.fbx -o <naam> -b --pbr-metallic-roughness
 *
 *   (FBX2glTF 0.9.7, npm-pakket `fbx2gltf`.)
 *
 * Stap 2 — dolphin en shark zitten alleen in de .blend-bestanden van de pack;
 *   daar is geen .fbx van meegeleverd. Die zijn eerst met Blender (bpy 5.0)
 *   naar .fbx geschreven en daarna door stap 1 gehaald:
 *
 *     bpy.ops.wm.open_mainfile(filepath='Dolphin.blend')
 *     # camera, licht en lege objecten weggooien, mesh + armature houden
 *     bpy.ops.export_scene.fbx(filepath='Dolphin.fbx', add_leaf_bones=True,
 *                              bake_anim=True, bake_anim_use_all_actions=True,
 *                              path_mode='COPY', axis_forward='-Z', axis_up='Y')
 *
 *   Ter controle is Turtle.blend langs diezelfde weg omgezet: het resultaat is
 *   op 32 bytes na gelijk aan de meegeleverde Turtle.fbx, dus de twee wegen
 *   leveren dezelfde geometrie, materialen en animaties op.
 *
 * Stap 3 — dit script: schaal, oorsprong en namen. Zie de constanten hieronder.
 *
 * Wat dit script níét doet: het laat de meshes, materialen, skins en animaties
 * ongemoeid. De animatienamen zijn dus die van de pack zelf, dubbelingen en al.
 */

import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leesGlb, schrijfGlb, meetScene } from './glb.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOEL = join(ROOT, 'kits', 'onderwater-kit');

/**
 * De pack staat op zo'n vier keer het raster van de andere kits: de zeeschildpad
 * is er 3,8 units breed en een wandsegment is er 1. Eén factor voor de hele
 * kit, geen maat per model — zo blijven de onderlinge verhoudingen van de pack
 * staan (de hamerhaai blijft groter dan de clownvis).
 */
const SCHAAL = 0.25;

/**
 * Bronbestand → naam in de kit. De pack gebruikt PascalCase en doorgenummerde
 * namen; de kits hier zijn kebab-case met letterachtervoegsels (`rock-a`).
 *
 * Drie namen wijken af van het bronbestand omdat het bronbestand iets anders
 * belooft dan het model laat zien: `Shells` is één roze puntschelp, en van de
 * drie "SandDollar"-modellen is alleen de laatste een zanddollar — de andere
 * twee zijn een sint-jakobsschelp en een tweekleppige schelp.
 */
const NAMEN = {
  Rock: 'rock-a', Rock1: 'rock-b', Rock2: 'rock-c', Rock3: 'rock-d', Rock4: 'rock-e',
  Rock5: 'rock-f', Rock6: 'rock-g', Rock7: 'rock-h', Rock8: 'rock-i', Rock9: 'rock-j',
  Rock10: 'rock-k',
  Coral: 'coral-a', Coral1: 'coral-b', Coral2: 'coral-c', Coral3: 'coral-d',
  Coral4: 'coral-e', Coral5: 'coral-f', Coral6: 'coral-g',
  SeaWeed: 'seaweed-a', SeaWeed1: 'seaweed-b', SeaWeed2: 'seaweed-c',
  Shells: 'shell-spiral', Shells1: 'shell-scallop', Shells2: 'shell-clam', Shells3: 'sand-dollar',
  BrownFish: 'fish-brown', ClownFish: 'fish-clown', DoryFish: 'fish-dory', TunaFish: 'fish-tuna',
  Crab: 'crab', Dolphin: 'dolphin', Eel: 'eel', Hammerhead: 'shark-hammerhead',
  Shark: 'shark', Lobster: 'lobster', Octopus: 'octopus', Penguin: 'penguin',
  Seal: 'seal', Squid: 'squid', StarFish: 'starfish', StingRay: 'stingray',
  Turtle: 'turtle', Whale: 'whale',
};

const bronMap = process.argv[2];
if (!bronMap) {
  console.error('gebruik: node tools/importeer-onderwater.mjs <map-met-omgezette-glb>');
  process.exit(1);
}

mkdirSync(DOEL, { recursive: true });

const aanwezig = new Set(
  readdirSync(bronMap).filter((n) => n.endsWith('.glb')).map((n) => n.replace(/\.glb$/, '')),
);
const ontbreekt = Object.keys(NAMEN).filter((n) => !aanwezig.has(n));
if (ontbreekt.length) throw new Error(`niet gevonden in ${bronMap}: ${ontbreekt.join(', ')}`);

for (const [bron, naam] of Object.entries(NAMEN)) {
  const glb = leesGlb(join(bronMap, `${bron}.glb`));
  const voor = meetScene(glb);

  /**
   * Schaal en oorsprong in één extra wortel-node, in plaats van in de
   * vertexdata. Dat moet ook: bij een geskind model liggen de vertices in
   * bindpose-ruimte en bepalen de gewrichten waar ze uitkomen — de mesh
   * verplaatsen zonder het skelet levert een model op dat bij het eerste
   * animatieframe terugspringt. Een node boven mesh én armature neemt beide
   * mee.
   *
   * De verschuiving zet het model met zijn voet op y=0 en zijn grondvlak
   * gecentreerd op x/z (stijlgids §5). In de pack liggen sommige rotsen tot
   * zes units van de oorsprong, waar ze in de bronscène toevallig stonden.
   */
  const wortel = {
    name: naam,
    scale: [SCHAAL, SCHAAL, SCHAAL],
    translation: [
      -SCHAAL * (voor.min[0] + voor.max[0]) / 2,
      -SCHAAL * voor.min[1],
      -SCHAAL * (voor.min[2] + voor.max[2]) / 2,
    ].map((v) => Math.round(v * 1e6) / 1e6),
    children: [...glb.json.scenes[glb.json.scene ?? 0].nodes],
  };

  glb.json.nodes.push(wortel);
  glb.json.scenes[glb.json.scene ?? 0].nodes = [glb.json.nodes.length - 1];

  const pad = join(DOEL, `${naam}.glb`);
  schrijfGlb(pad, glb.json, glb.bin, writeFileSync);

  const na = meetScene(leesGlb(pad));
  const maat = (m) => m.wdh.map((v) => v.toFixed(2).padStart(6)).join(' × ');
  console.log(`${bron.padEnd(11)} → ${naam.padEnd(17)} ${maat(voor)}  →  ${maat(na)}`);
}

console.log(`${Object.keys(NAMEN).length} modellen → kits/onderwater-kit/`);
