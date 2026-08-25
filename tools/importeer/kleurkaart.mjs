import { leesPng } from '../../catalog/tools/png.mjs';
import { naarOklab, afstand, GEDEELDE_COLORMAP } from './palet.mjs';
import { vindBanen, vergelijkVerloop } from './banen.mjs';

const RAMP = 16;

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

function kiesDoel(ramp) {
  let beste = null;
  for (const baan of doelBanen().banen) {
    const { score, omgekeerd } = vergelijkVerloop(ramp, baan.ramp);
    if (!beste || score < beste.score) beste = { baan, score, omgekeerd };
  }
  return beste;
}

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

export function kiesBaan(rgb, bereik = null) {
  const lab = naarOklab(...rgb);

  let beste = null;
  for (const baan of doelBanen().banen) {
    const k = kenmerk(baan);

    const kleurAfstand = Math.hypot(lab[1] - k.a, lab[2] - k.b);

    const laagste = bereik ? bereik[0] : lab[0];
    const hoogste = bereik ? bereik[1] : lab[0];
    const tekort = Math.max(0, k.laag - laagste, hoogste - k.hoog);
    const kosten = kleurAfstand * 100 + tekort * 12;
    if (!beste || kosten < beste.kosten) beste = { baan, kosten };
  }
  return beste.baan;
}

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
  return [u / png.width, v / png.height];
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

function keuzeVoor(textuur, baan) {
  if (!textuur.keuzes.has(baan.id)) textuur.keuzes.set(baan.id, kiesDoel(baan.ramp));
  return textuur.keuzes.get(baan.id);
}

export function baanVanTextuur(pad) {
  return textuurBanen(pad);
}

export function baanBijUv(textuur, u, v) {
  const { png, kolommen, rijen } = textuur;
  const wikkel = (t) => t - Math.floor(t);
  const x = Math.min(wikkel(u) * png.width, png.width - 1e-6);
  const y = Math.min(wikkel(v) * png.height, png.height - 1e-6);

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

      const zelfde = deel.baan === baan;
      return uvInBaan(keuze.baan, zelfde ? deel.uDeel : 0.5, zelfde ? deel.vDeel : 0.5, keuze.omgekeerd);
    }),
  };
}

export function keuzeVerslag(keuze) {
  return { doel: keuze.baan.id, afstand: keuze.score };
}

export { afstand };
