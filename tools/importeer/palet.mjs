import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leesPng } from '../../catalog/tools/png.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const GEDEELDE_COLORMAP = resolve(ROOT, 'kits', 'colormap.png');

export const naarLineair = (kanaal) => {
  const v = kanaal / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

export function naarOklab(r, g, b) {
  const rl = naarLineair(r);
  const gl = naarLineair(g);
  const bl = naarLineair(b);
  const l = Math.cbrt(0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl);
  const m = Math.cbrt(0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl);
  const s = Math.cbrt(0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

export function afstand(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 100;
}

export function laadPalet(pad = GEDEELDE_COLORMAP) {
  const { breedte, hoogte, pixels } = leesPng(pad);
  const perKleur = new Map();

  for (let y = 0; y < hoogte; y++) {
    for (let x = 0; x < breedte; x++) {
      const i = (y * breedte + x) * 4;
      const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
      if (r === 0 && g === 0 && b === 0) continue;
      const sleutel = (r << 16) | (g << 8) | b;
      if (perKleur.has(sleutel)) continue;
      perKleur.set(sleutel, {
        r, g, b,
        hex: hex(r, g, b),
        u: (x + 0.5) / breedte,
        v: (y + 0.5) / hoogte,
        lab: naarOklab(r, g, b),
      });
    }
  }

  const kandidaten = [...perKleur.values()];
  if (kandidaten.length === 0) throw new Error(`${pad}: geen enkele kleur, alleen zwart`);

  let somLicht = 0;
  let tellerLicht = 0;
  for (let y = 0; y < hoogte; y++) {
    for (let x = 0; x < breedte; x++) {
      const i = (y * breedte + x) * 4;
      if (!pixels[i] && !pixels[i + 1] && !pixels[i + 2]) continue;
      somLicht += (naarLineair(pixels[i]) + naarLineair(pixels[i + 1]) + naarLineair(pixels[i + 2])) / 3;
      tellerLicht++;
    }
  }
  const niveau = somLicht / tellerLicht;
  const onthouden = new Map();

  function zoek(r, g, b) {
    const sleutel = (r << 16) | (g << 8) | b;
    const bekend = onthouden.get(sleutel);
    if (bekend) return bekend;

    const lab = naarOklab(r, g, b);
    let beste = kandidaten[0];
    let besteAfstand = Infinity;
    for (const kandidaat of kandidaten) {
      const d = afstand(lab, kandidaat.lab);
      if (d < besteAfstand) {
        besteAfstand = d;
        beste = kandidaat;
      }
    }
    const uitkomst = { ...beste, afstand: besteAfstand };
    onthouden.set(sleutel, uitkomst);
    return uitkomst;
  }

  return { breedte, hoogte, kandidaten, niveau, zoek };
}

const texturen = new Map();

export function laadTextuur(pad, { vOmlaag = true } = {}) {
  if (!texturen.has(pad)) {
    const png = leesPng(pad);
    texturen.set(pad, {
      ...png,
      monster(u, vIn) {
        const v = vOmlaag ? vIn : 1 - vIn;
        const wikkel = (t) => t - Math.floor(t);
        const x = Math.min(Math.floor(wikkel(u) * png.breedte), png.breedte - 1);
        const y = Math.min(Math.floor(wikkel(v) * png.hoogte), png.hoogte - 1);
        const i = (y * png.breedte + x) * 4;
        return [png.pixels[i], png.pixels[i + 1], png.pixels[i + 2], png.pixels[i + 3]];
      },
    });
  }
  return texturen.get(pad);
}
