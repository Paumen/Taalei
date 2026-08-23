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
// van Fantasy Props, de losse materiaaltexturen van Natuur) of alleen vlakke
// materiaalkleuren (Quaternius), dan is er geen bronbaan om over te nemen. Daar
// wordt de baan gekozen op kleurtoon en verzadiging alléén, en bepaalt de
// lichtheid pas waar in die baan de kleur terechtkomt (zie kleurNaarBaan).
//
// Dat is nadrukkelijk iets anders dan de dichtstbijzijnde kleur zoeken. Een
// paddenstoelhoed loopt van licht naar donker rood; zoek je per driehoek de
// dichtstbijzijnde kleur, dan gaat de lichte kant naar een lichte baan en de
// donkere kant naar een donkere, en spat het vlak uiteen in vlekken. Op toon
// kiezen houdt de hele hoed op de rode baan, met het verloop erin.

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

// De kleur van een baan (het a/b-vlak van Oklab) en het bereik van zijn
// verloop, uit het midden van dat verloop.
function kenmerk(baan) {
  if (!baan.kenmerk) {
    const midden = baan.ramp.reduce(
      (som, lab) => [som[0] + lab[0] / baan.ramp.length, som[1] + lab[1] / baan.ramp.length, som[2] + lab[2] / baan.ramp.length],
      [0, 0, 0],
    );
    const lichtheden = baan.ramp.map((lab) => lab[0]);
    baan.kenmerk = {
      a: midden[1],
      b: midden[2],
      laag: Math.min(...lichtheden),
      hoog: Math.max(...lichtheden),
    };
  }
  return baan.kenmerk;
}

// De baan die qua kleur bij een losse kleur hoort, plus de plek in het verloop
// die bij zijn lichtheid past. Lichtheid speelt met opzet geen rol bij het
// kiezen van de baan: anders springt hetzelfde oppervlak van baan zodra het wat
// donkerder wordt.
export function kiesBaan(rgb, bereik = null) {
  const lab = naarOklab(...rgb);

  let beste = null;
  for (const baan of doelBanen().banen) {
    const k = kenmerk(baan);
    // Gekozen wordt op kleur alléén: de afstand tussen de twee in het a/b-vlak
    // van Oklab, waar toon en verzadiging samen in zitten en lichtheid niet.
    // Dat laatste is de kern — een baan kiezen op lichtheid laat hetzelfde
    // oppervlak van baan springen zodra het wat donkerder wordt, en dat zijn de
    // vlekken. Toon en verzadiging tegen elkaar afwegen hoeft hier niet: in dit
    // vlak is crème vanzelf ver van knalgeel en dicht bij gebroken wit.
    const kleurAfstand = Math.hypot(lab[1] - k.a, lab[2] - k.b);

    // Lichtheid telt licht mee, als het erop aankomt. Reikt het verloop van een
    // baan niet tot wat dit oppervlak nodig heeft, dan klemt de kleur tegen het
    // uiteinde van die baan; dat is jammer, maar een verkeerde kleur is erger.
    // Het tekort geldt voor het hele oppervlak en niet voor één kleur: een baan
    // die de lichte kant van een bast wel aankan maar de donkere niet, deugt
    // niet voor die bast.
    const laagste = bereik ? bereik[0] : lab[0];
    const hoogste = bereik ? bereik[1] : lab[0];
    const tekort = Math.max(0, k.laag - laagste, hoogste - k.hoog);
    const kosten = kleurAfstand * 100 + tekort * 12;
    if (!beste || kosten < beste.kosten) beste = { baan, kosten };
  }
  return beste.baan;
}

// De plek in een baan die bij een lichtheid past. Gezocht in plaats van
// berekend: dan maakt het niet uit of de baan van licht naar donker loopt of
// andersom.
export function plaatsInBaan(baan, rgb) {
  const lab = naarOklab(...rgb);
  const { ramp } = baan;
  let index = 0;
  for (let i = 1; i < ramp.length; i++) {
    if (Math.abs(ramp[i][0] - lab[0]) < Math.abs(ramp[index][0] - lab[0])) index = i;
  }
  return {
    afstand: afstand(lab, ramp[index]),
    uv: uvInBaan(baan, 0.5, (index + 0.5) / ramp.length, false),
  };
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
