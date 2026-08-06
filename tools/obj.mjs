/**
 * Wavefront OBJ + MTL lezen.
 *
 * Gebruikt door tools/importeer-modulair-terrein.mjs. De andere packs kwamen
 * als .fbx binnen en zijn met FBX2glTF omgezet; deze kwam als OBJ, en dat
 * formaat is eenvoudig genoeg om zonder externe converter te lezen. Dat scheelt
 * een afhankelijkheid én een tussenstap waarin niet te zien is wat er gebeurt:
 * wat hier uit komt is precies wat er in het bestand staat.
 *
 * Wat we níét ondersteunen, omdat deze pack het niet gebruikt: vrije-vormvlakken
 * (`curv`, `surf`), negatieve vlakindices, en meer dan één `mtllib` per bestand.
 * Bij zulke regels stopt de lezer met een fout in plaats van ze over te slaan —
 * stilletjes geometrie laten vallen is het ergste wat een importer kan doen.
 */

import { readFileSync } from 'node:fs';

/**
 * `Kd` is de diffuse kleur: precies de vlakke kleur die deze pack per materiaal
 * meegeeft. `Ka`, `Ks` en `Ns` laten we liggen — de stijlgids (§1) wil geen
 * glans en geen omgevingslicht in de assets, en de doelmaterialen in glTF
 * krijgen die waarden hoe dan ook niet.
 *
 * @returns {Map<string, {kd: number[]}>} materiaalnaam → kleur in 0–255
 */
export function leesMtl(pad) {
  const materialen = new Map();
  let huidig = null;

  for (const ruw of readFileSync(pad, 'utf8').split('\n')) {
    const regel = ruw.trim();
    if (regel === '' || regel.startsWith('#')) continue;

    const [sleutel, ...rest] = regel.split(/\s+/);
    if (sleutel === 'newmtl') {
      huidig = rest.join(' ');
      materialen.set(huidig, { kd: [0, 0, 0] });
    } else if (sleutel === 'Kd') {
      if (!huidig) throw new Error(`${pad}: Kd vóór de eerste newmtl`);
      materialen.get(huidig).kd = rest.slice(0, 3).map((v) => Math.round(parseFloat(v) * 255));
    }
  }

  if (materialen.size === 0) throw new Error(`${pad}: geen materialen gevonden`);
  return materialen;
}

/**
 * Leest één .obj in en levert de driehoeken gegroepeerd per materiaal.
 *
 * Hoekpunten worden ontdubbeld op de combinatie v/vt/vn én het materiaal. Dat
 * laatste is nodig omdat het materiaal straks de UV bepaalt: twee vlakken die
 * in de bron hetzelfde hoekpunt delen maar een ander materiaal dragen, moeten
 * elk hun eigen kleur uit de atlas kunnen halen.
 *
 * Vlakken met meer dan drie hoekpunten worden als waaier opgedeeld (0-i-i+1).
 * Dat klopt voor de convexe, vlakke veelhoeken die een OBJ-exporteur oplevert.
 *
 * @returns {{
 *   posities: number[], normalen: number[],
 *   groepen: Array<{materiaal: string, indices: number[]}>,
 *   objecten: number,
 * }}
 */
export function leesObj(pad) {
  const v = [];
  const vn = [];

  // Hoekpunten in volgorde van eerste gebruik; `sleutels` houdt bij welke er al
  // zijn, zodat een gedeeld hoekpunt niet twee keer in de buffer belandt.
  const posities = [];
  const normalen = [];
  const sleutels = new Map();

  const groepen = new Map(); // materiaal → indices
  let materiaal = null;
  let objecten = 0;

  const hoekpunt = (deel) => {
    const sleutel = `${deel}|${materiaal}`;
    const bestaand = sleutels.get(sleutel);
    if (bestaand !== undefined) return bestaand;

    // v/vt/vn, waarbij vt en vn mogen ontbreken. De UV uit de bron gooien we
    // weg: die wijst naar een atlas die deze pack niet meelevert, en het
    // materiaal zegt al welke kleur het moet worden.
    const [pi, , ni] = deel.split('/');
    const p = v[Number(pi) - 1];
    if (!p) throw new Error(`${pad}: vlak verwijst naar onbekend hoekpunt ${pi}`);
    const n = ni ? vn[Number(ni) - 1] : null;

    const index = posities.length / 3;
    posities.push(p[0], p[1], p[2]);
    // Zonder normaal in de bron: omhoog. Dat komt in deze pack niet voor, maar
    // een ontbrekende normaal mag geen NaN in de buffer worden.
    normalen.push(...(n ?? [0, 1, 0]));
    sleutels.set(sleutel, index);
    return index;
  };

  for (const ruw of readFileSync(pad, 'utf8').split('\n')) {
    const regel = ruw.trim();
    if (regel === '' || regel.startsWith('#')) continue;

    const spatie = regel.indexOf(' ');
    const sleutel = spatie === -1 ? regel : regel.slice(0, spatie);
    const rest = spatie === -1 ? '' : regel.slice(spatie + 1).trim();

    switch (sleutel) {
      case 'v':
        v.push(rest.split(/\s+/).slice(0, 3).map(Number));
        break;
      case 'vn':
        vn.push(rest.split(/\s+/).slice(0, 3).map(Number));
        break;
      case 'vt':
      case 's':
      case 'g':
      case 'mtllib':
        break; // zie de kop: UV's, smoothing groups en groepsnamen doen hier niet mee
      case 'o':
        objecten++;
        break;
      case 'usemtl':
        materiaal = rest;
        if (!groepen.has(materiaal)) groepen.set(materiaal, []);
        break;
      case 'f': {
        if (materiaal === null) throw new Error(`${pad}: vlak vóór de eerste usemtl`);
        const delen = rest.split(/\s+/);
        if (delen.some((d) => d.startsWith('-'))) {
          throw new Error(`${pad}: negatieve vlakindices worden niet ondersteund`);
        }
        const indices = groepen.get(materiaal);
        const eerste = hoekpunt(delen[0]);
        for (let i = 1; i + 1 < delen.length; i++) {
          indices.push(eerste, hoekpunt(delen[i]), hoekpunt(delen[i + 1]));
        }
        break;
      }
      case 'curv':
      case 'surf':
      case 'parm':
        throw new Error(`${pad}: vrije-vormvlakken (${sleutel}) worden niet ondersteund`);
      default:
        break;
    }
  }

  if (posities.length === 0) throw new Error(`${pad}: geen geometrie gevonden`);

  return {
    posities,
    normalen,
    groepen: [...groepen]
      .filter(([, indices]) => indices.length > 0)
      .map(([materiaal, indices]) => ({ materiaal, indices })),
    objecten,
  };
}
