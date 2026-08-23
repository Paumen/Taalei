// Vindt de banen van een kleursheet: de rechthoekige cellen waar zo'n vel uit
// bestaat, elk met een eigen verloop van licht naar donker.
//
// De gedeelde kits/colormap.png is 16 × 4 van zulke banen, Kenney's nieuwere
// colormaps ook, KayKit gebruikt 8 × 4, en de losse texturen van sommige packs
// zijn er één. Dat wordt niet aangenomen maar gemeten: waar twee buurkolommen
// (of -rijen) sterk van kleur verspringen ligt een grens, en tussen twee
// grenzen ligt een baan.
//
// Waarom dit nodig is: een baan hoort in zijn geheel op één baan van de
// gedeelde sheet te landen. Kies je per driehoek los de dichtstbijzijnde
// kleur, dan kan de ene helft van een boom op de ene baan komen en de andere
// helft op een andere, en valt een glad verloop uiteen in losse driehoeken.

import { naarOklab, afstand } from './palet.mjs';

const RAMP = 16;

function labVlak({ breedte, hoogte, pixels }) {
  const lab = new Float64Array(breedte * hoogte * 3);
  for (let i = 0; i < breedte * hoogte; i++) {
    const [l, a, b] = naarOklab(pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]);
    lab[i * 3] = l;
    lab[i * 3 + 1] = a;
    lab[i * 3 + 2] = b;
  }
  return lab;
}

// Grenzen langs één as: posities waar de gemiddelde sprong tussen twee
// opeenvolgende lijnen boven de drempel uitkomt.
function grenzen(lab, breedte, hoogte, langsX) {
  const lengte = langsX ? breedte : hoogte;
  const dwars = langsX ? hoogte : breedte;
  const sprong = new Float64Array(Math.max(lengte - 1, 0));

  for (let i = 0; i + 1 < lengte; i++) {
    let som = 0;
    for (let k = 0; k < dwars; k++) {
      const a = langsX ? (k * breedte + i) * 3 : (i * breedte + k) * 3;
      const b = langsX ? (k * breedte + i + 1) * 3 : ((i + 1) * breedte + k) * 3;
      som += afstand([lab[a], lab[a + 1], lab[a + 2]], [lab[b], lab[b + 1], lab[b + 2]]);
    }
    sprong[i] = som / dwars;
  }

  const grootste = Math.max(...sprong, 0);
  const drempel = Math.max(1.5, grootste * 0.25);
  const uit = [0];
  for (let i = 0; i + 1 < lengte; i++) {
    if (sprong[i] >= drempel && i + 1 - uit[uit.length - 1] >= 2) uit.push(i + 1);
  }
  uit.push(lengte);
  return uit;
}

// Het verloop van een baan: RAMP monsters van boven naar beneden, elk het
// gemiddelde over de breedte van de baan. Zo vergelijk je banen op hun hele
// verloop en niet op één kleur eruit.
function verloop(png, rect) {
  const { breedte, pixels } = png;
  const [x0, y0, x1, y1] = rect;
  const ramp = [];
  let zwart = true;

  for (let n = 0; n < RAMP; n++) {
    const y = Math.min(y0 + Math.floor(((n + 0.5) / RAMP) * (y1 - y0)), y1 - 1);
    let r = 0, g = 0, b = 0;
    for (let x = x0; x < x1; x++) {
      const i = (y * breedte + x) * 4;
      r += pixels[i];
      g += pixels[i + 1];
      b += pixels[i + 2];
      if (pixels[i] || pixels[i + 1] || pixels[i + 2]) zwart = false;
    }
    const n0 = x1 - x0;
    ramp.push(naarOklab(r / n0, g / n0, b / n0));
  }

  return { ramp, zwart };
}

const ggd = (a, b) => (b === 0 ? a : ggd(b, a % b));

// Een sheet met banen staat op een regelmatig raster, maar niet elke grens is
// zichtbaar: twee lege buurcellen lopen in elkaar over. De steek van het raster
// volgt daarom uit de grootste gemene deler van de grenzen die er wél zijn.
function steek(gevondenGrenzen, lengte) {
  const deler = gevondenGrenzen.reduce((d, g) => ggd(d, g), lengte);
  if (deler < 8 || lengte % deler !== 0 || lengte / deler > 64) return null;
  return deler;
}

function rasterGrenzen(lab, breedte, hoogte, langsX) {
  const lengte = langsX ? breedte : hoogte;
  const ruw = grenzen(lab, breedte, hoogte, langsX);
  const stap = steek(ruw.slice(1, -1), lengte);
  if (!stap) return null;
  return Array.from({ length: lengte / stap + 1 }, (_, i) => i * stap);
}

const gevonden = new Map();

// Levert de banen van een raster-sheet, of null als het er geen is — dan is de
// textuur geen kleurenvel maar een geschilderde textuur, en hoort hij via
// kleurfamilies te gaan (zie familieBanen).
export function vindBanen(png, sleutel) {
  if (gevonden.has(sleutel)) return gevonden.get(sleutel);

  const lab = labVlak(png);
  const kolommen = rasterGrenzen(lab, png.breedte, png.hoogte, true);
  const rijen = rasterGrenzen(lab, png.breedte, png.hoogte, false);
  if (!kolommen || !rijen || (kolommen.length - 1) * (rijen.length - 1) < 2) {
    gevonden.set(sleutel, null);
    return null;
  }

  const banen = [];
  for (let r = 0; r + 1 < rijen.length; r++) {
    for (let k = 0; k + 1 < kolommen.length; k++) {
      const rect = [kolommen[k], rijen[r], kolommen[k + 1], rijen[r + 1]];
      const { ramp, zwart } = verloop(png, rect);
      banen.push({ id: `${k},${r}`, rect, ramp, zwart });
    }
  }

  const uitkomst = { banen, kolommen, rijen };
  gevonden.set(sleutel, uitkomst);
  return uitkomst;
}

// Twee banen vergelijken over hun hele verloop, in beide richtingen: een
// bronbaan die van licht naar donker loopt mag op een doelbaan landen die
// andersom loopt, als dat beter past.
export function vergelijkVerloop(bron, doel) {
  let recht = 0;
  let omgekeerd = 0;
  for (let n = 0; n < bron.length; n++) {
    recht += afstand(bron[n], doel[n]);
    omgekeerd += afstand(bron[n], doel[bron.length - 1 - n]);
  }
  return recht <= omgekeerd
    ? { score: recht / bron.length, omgekeerd: false }
    : { score: omgekeerd / bron.length, omgekeerd: true };
}
