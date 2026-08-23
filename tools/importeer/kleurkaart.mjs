// De omzetting van bronkleur naar een plek op de gedeelde kits/colormap.png.
//
// Het uitgangspunt: een baan gaat als geheel naar één baan. Wat in de pack één
// swatch is — één kleur met zijn eigen verloop van licht naar donker — landt op
// één swatch van de gedeelde sheet, en houdt daarbinnen zijn plek in het
// verloop. Zo blijft de ingebakken schaduw staan en valt een glad vlak niet
// uiteen in losse driehoeken, wat wél gebeurt als je per driehoek los de
// dichtstbijzijnde kleur zoekt.
//
// De pack levert een kleurenvel: een rooster van banen (Kenney 16 × 4, KayKit
// 8 × 4). De baan van een driehoek volgt uit zijn UV, en elk hoekpunt houdt zijn
// eigen plek binnen die baan — een verloop over een vlak blijft dus een verloop.
//
// Levert een pack geen kleurenvel maar een geschilderde textuur (de trimsheets
// van Fantasy Props, de losse materiaaltexturen van Natuur), dan valt er geen
// baan over te nemen: er is er geen. Die gaan buiten dit bestand om op de
// dichtstbijzijnde kleur van de sheet (zie bouw.mjs).

import { leesPng } from '../../catalog/tools/png.mjs';
import { naarOklab, afstand, GEDEELDE_COLORMAP } from './palet.mjs';
import { vindBanen, vergelijkVerloop } from './banen.mjs';

const RAMP = 16;
// Een halve texel binnen de baan blijven: op de rand pakt het filteren van de
// buurbaan mee, en dan lekt er alsnog een vreemde kleur in.
const RAND = 0.5;

let doel = null;

function doelBanen() {
  if (doel) return doel;
  const png = leesPng(GEDEELDE_COLORMAP);
  const raster = vindBanen(png, GEDEELDE_COLORMAP);
  if (!raster) throw new Error('kits/colormap.png is geen sheet met banen');
  doel = {
    png,
    banen: raster.banen.filter((baan) => !baan.zwart),
  };
  if (doel.banen.length === 0) throw new Error('kits/colormap.png heeft geen enkele gevulde baan');
  return doel;
}

// De doelbaan die het beste bij een bronverloop past, plus of hij omgedraaid
// moet worden. Eén keer per bronbaan bepaald en daarna vastgehouden: alle
// driehoeken van die baan gaan gegarandeerd naar dezelfde doelbaan.
function kiesDoel(ramp) {
  let beste = null;
  for (const baan of doelBanen().banen) {
    const { score, omgekeerd } = vergelijkVerloop(ramp, baan.ramp);
    if (!beste || score < beste.score) beste = { baan, score, omgekeerd };
  }
  return beste;
}

function uvInBaan(baan, uDeel, vDeel, omgekeerd) {
  const { png } = doelBanen();
  const [x0, y0, x1, y1] = baan.rect;
  const u = uDeel * (x1 - x0 - 2 * RAND) + x0 + RAND;
  const vRuw = omgekeerd ? 1 - vDeel : vDeel;
  const v = vRuw * (y1 - y0 - 2 * RAND) + y0 + RAND;
  return [u / png.breedte, v / png.hoogte];
}

const klem = (waarde) => Math.min(Math.max(waarde, 0), 1);

const perTextuur = new Map();

function textuurBanen(pad) {
  if (!perTextuur.has(pad)) {
    const png = leesPng(pad);
    const raster = vindBanen(png, pad);
    perTextuur.set(pad, {
      png,
      soort: raster ? 'raster' : 'familie',
      kolommen: raster?.kolommen ?? null,
      rijen: raster?.rijen ?? null,
      banen: raster ? raster.banen : null,
      keuzes: new Map(),
    });
  }
  return perTextuur.get(pad);
}

// De doelbaan die bij een bronbaan hoort. Eén keer bepaald en daarna
// vastgehouden: alle driehoeken van die bronbaan gaan gegarandeerd naar
// dezelfde doelbaan, en dat is precies waar het om begonnen was.
function keuzeVoor(textuur, baan) {
  if (!textuur.keuzes.has(baan.id)) textuur.keuzes.set(baan.id, kiesDoel(baan.ramp));
  return textuur.keuzes.get(baan.id);
}

export function baanVanTextuur(pad) {
  return textuurBanen(pad);
}

// De baan waar een UV in valt, plus waar binnen die baan (0-1 in beide
// richtingen).
export function baanBijUv(textuur, u, v) {
  const { png, kolommen, rijen } = textuur;
  const wikkel = (t) => t - Math.floor(t);
  const x = Math.min(wikkel(u) * png.breedte, png.breedte - 1e-6);
  const y = Math.min(wikkel(v) * png.hoogte, png.hoogte - 1e-6);

  const zoek = (grenzen, waarde) => {
    let i = 0;
    while (i + 2 < grenzen.length && grenzen[i + 1] <= waarde) i++;
    return i;
  };
  const k = zoek(kolommen, x);
  const r = zoek(rijen, y);
  const baan = textuur.banen.find((b) => b.id === `${k},${r}`);
  return {
    baan,
    uDeel: klem((x - kolommen[k]) / (kolommen[k + 1] - kolommen[k])),
    vDeel: klem((y - rijen[r]) / (rijen[r + 1] - rijen[r])),
  };
}

// Een driehoek van een rasterpack: de baan volgt uit het zwaartepunt, elk
// hoekpunt houdt zijn eigen plek in die baan.
export function rasterUvs(textuur, hoekUvs) {
  const midden = [
    (hoekUvs[0][0] + hoekUvs[1][0] + hoekUvs[2][0]) / 3,
    (hoekUvs[0][1] + hoekUvs[1][1] + hoekUvs[2][1]) / 3,
  ];
  const { baan } = baanBijUv(textuur, midden[0], midden[1]);
  if (!baan || baan.zwart) return null;
  const keuze = keuzeVoor(textuur, baan);

  return {
    baan,
    keuze,
    uvs: hoekUvs.map(([u, v]) => {
      const deel = baanBijUv(textuur, u, v);
      // Een hoekpunt dat net over de rand van de baan van het zwaartepunt valt,
      // wordt teruggeklemd — anders sleept het de kleur van de buurbaan mee.
      const zelfde = deel.baan === baan;
      return uvInBaan(keuze.baan, zelfde ? deel.uDeel : 0.5, zelfde ? deel.vDeel : 0.5, keuze.omgekeerd);
    }),
  };
}

// Wat er van een baankeuze te melden valt: hoe ver de bron van het doel af ligt.
export function keuzeVerslag(keuze) {
  return { doel: keuze.baan.id, afstand: keuze.score };
}

export { afstand };
