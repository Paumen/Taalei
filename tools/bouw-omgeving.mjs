/**
 * Bouwt kits/omgeving.hdr uit tools/webgpu-scene/licht.json.
 *
 * Draaien vanuit de repo-root:
 *   node tools/bouw-omgeving.mjs
 *
 * Waarom: de catalogus tekent met <model-viewer>, en die haalt zijn licht uit
 * een omgevingsplaat — geen losse zon, geen losse omgevingskleur. De scène in
 * tools/webgpu-scene rekent het licht wél uit die twee. Om de catalogus er
 * hetzelfde uit te laten zien, wordt hier van dezelfde licht.json een
 * equirectangulaire omgeving gemaakt:
 *
 *   - overal de omgevingskleur (de omgevingskleur naar de luchtkleur getrokken
 *     met skyTint, × intensity). Een gelijkmatige omgeving met stralingsdichtheid
 *     A geeft een lambert-oppervlak precies albedo × A terug — hetzelfde als de
 *     omgevingsterm in de shader;
 *   - plus een zonneschijf op de elevatie en azimut uit licht.json. Een schijf
 *     met stralingsdichtheid L over ruimtehoek Ω geeft een lambert-oppervlak
 *     albedo × L × Ω × cos(θ) / π terug; de shader doet albedo × kleur ×
 *     intensity × cos(θ). De schijf krijgt dus L = π × kleur × intensity / Ω.
 *
 * De plaat is Radiance RGBE, want een LDR-plaat kan de zon niet feller dan wit
 * maken en dan blijft er van het richtingslicht niets over.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BREED = 256;
const HOOG = 128;
/** Hoekstraal van de zonneschijf. Klein genoeg om gericht te blijven, groot
 *  genoeg om na het filteren van model-viewer niet weg te vallen. */
const ZONSTRAAL = (5 * Math.PI) / 180;

const licht = JSON.parse(readFileSync(join(ROOT, 'tools', 'webgpu-scene', 'licht.json'), 'utf8'));
const graden = (d) => (d * Math.PI) / 180;
/* dezelfde gamma als de scène: albedo en kleuren staan in sRGB, licht rekent lineair */
const naarLineair = (hex) => [1, 3, 5].map((i) => Math.pow(parseInt(hex.slice(i, i + 2), 16) / 255, 2.2));

const el = graden(licht.sun.elevationDeg);
const az = graden(licht.sun.azimuthDeg);
/* azimut 0° kijkt naar +z en loopt met de klok mee naar +x, net als in scene.js */
const zon = [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];

const lucht = naarLineair(licht.sky.colorSRGB);
const omgeving = naarLineair(licht.ambient.colorSRGB)
  .map((c, i) => (c + (lucht[i] - c) * licht.ambient.skyTint) * licht.ambient.intensity);
const ruimtehoek = 2 * Math.PI * (1 - Math.cos(ZONSTRAAL));
const zonKleur = naarLineair(licht.sun.colorSRGB).map((c) => (Math.PI * c * licht.sun.intensity) / ruimtehoek);

/** Lineaire kleur → vier bytes RGBE, zoals Radiance ze opslaat. */
function rgbe(r, g, b) {
  const top = Math.max(r, g, b);
  if (top < 1e-32) return [0, 0, 0, 0];
  const e = Math.ceil(Math.log2(top));
  const schaal = Math.pow(2, -e) * 256;
  const byte = (v) => Math.max(0, Math.min(255, Math.floor(v * schaal)));
  return [byte(r), byte(g), byte(b), e + 128];
}

/* Voor het ijken: met `node tools/bouw-omgeving.mjs zon` of `... omgeving`
 * komt alleen dat deel in de plaat, zodat te meten is hoeveel model-viewer er
 * van doorlaat. Zonder argument allebei. */
const deel = process.argv[2] ?? 'alles';

const pixels = Buffer.alloc(BREED * HOOG * 4);
for (let y = 0; y < HOOG; y++) {
  /* equirectangulair: rij 0 is recht omhoog, kolom 0 is azimut 0 */
  const theta = ((y + 0.5) / HOOG) * Math.PI;
  for (let x = 0; x < BREED; x++) {
    const phi = ((x + 0.5) / BREED) * 2 * Math.PI;
    const richting = [Math.sin(theta) * Math.sin(phi), Math.cos(theta), Math.sin(theta) * Math.cos(phi)];
    const hoek = Math.acos(Math.max(-1, Math.min(1, richting[0] * zon[0] + richting[1] * zon[1] + richting[2] * zon[2])));
    const inZon = hoek <= ZONSTRAAL;
    const kleur = omgeving.map((c, i) =>
      (deel === 'zon' ? 0 : c) + (inZon && deel !== 'omgeving' ? zonKleur[i] : 0));
    pixels.set(rgbe(...kleur), (y * BREED + x) * 4);
  }
}

/* RGBELoader leest de data plat zolang de eerste pixel niet op een RLE-kop
 * lijkt (bytes 2, 2). Dat kan hier niet: de eerste pixel is de omgevingskleur,
 * ruim boven die waarde. Voor de zekerheid alsnog gecontroleerd. */
if (pixels[0] === 2 && pixels[1] === 2) throw new Error('eerste pixel lijkt op een RLE-kop');

const kop = Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\nGAMMA=1\nEXPOSURE=1\n\n-Y ${HOOG} +X ${BREED}\n`, 'ascii');
const doel = join(ROOT, 'kits', 'omgeving.hdr');
writeFileSync(doel, Buffer.concat([kop, pixels]));

const terug = (p) => [0, 1, 2].map((k) => (p[k] + 0.5) * Math.pow(2, p[3] - 128 - 8));
console.log('omgevingskleur :', omgeving.map((v) => v.toFixed(4)).join(' '), '→ terug', terug(pixels.subarray(0, 4)).map((v) => v.toFixed(4)).join(' '));
console.log('zonrichting    :', zon.map((v) => v.toFixed(3)).join(' '), ` (elevatie ${licht.sun.elevationDeg}°, azimut ${licht.sun.azimuthDeg}°)`);
console.log('zonschijf      :', ZONSTRAAL * 180 / Math.PI, '° straal, ruimtehoek', ruimtehoek.toFixed(4), 'sr');
console.log('geschreven     :', doel, `${BREED} × ${HOOG}`);
