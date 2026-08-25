import { naarOklab, afstand } from './palet.mjs';

const RAMP = 16;

function labVlak({ width, height, pixels }) {
  const lab = new Float64Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    const [l, a, b] = naarOklab(pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]);
    lab[i * 3] = l;
    lab[i * 3 + 1] = a;
    lab[i * 3 + 2] = b;
  }
  return lab;
}

function grenzen(lab, width, height, langsX) {
  const lengte = langsX ? width : height;
  const dwars = langsX ? height : width;
  const sprong = new Float64Array(Math.max(lengte - 1, 0));

  for (let i = 0; i + 1 < lengte; i++) {
    let som = 0;
    for (let k = 0; k < dwars; k++) {
      const a = langsX ? (k * width + i) * 3 : (i * width + k) * 3;
      const b = langsX ? (k * width + i + 1) * 3 : ((i + 1) * width + k) * 3;
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

function verloop(png, rect) {
  const { width, pixels } = png;
  const [x0, y0, x1, y1] = rect;
  const ramp = [];
  let zwart = true;

  for (let n = 0; n < RAMP; n++) {
    const y = Math.min(y0 + Math.floor(((n + 0.5) / RAMP) * (y1 - y0)), y1 - 1);
    let r = 0, g = 0, b = 0;
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
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

function steek(gevondenGrenzen, lengte) {
  const deler = gevondenGrenzen.reduce((d, g) => ggd(d, g), lengte);
  if (deler < 8 || lengte % deler !== 0 || lengte / deler > 64) return null;
  return deler;
}

function rasterGrenzen(lab, width, height, langsX) {
  const lengte = langsX ? width : height;
  const ruw = grenzen(lab, width, height, langsX);
  const stap = steek(ruw.slice(1, -1), lengte);
  if (!stap) return null;
  return Array.from({ length: lengte / stap + 1 }, (_, i) => i * stap);
}

const gevonden = new Map();

export function vindBanen(png, sleutel) {
  if (gevonden.has(sleutel)) return gevonden.get(sleutel);

  const lab = labVlak(png);
  const kolommen = rasterGrenzen(lab, png.width, png.height, true);
  const rijen = rasterGrenzen(lab, png.width, png.height, false);
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
