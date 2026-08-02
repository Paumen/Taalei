/**
 * Genereert de waterval-set van de helden-kit:
 *
 *   klif                  recht klifmodule, 1×1×1, stapelbaar en tegelbaar
 *   klif-hoek             buitenhoek (klifwand op +Z én +X)
 *   klif-hoek-binnen      binnenhoek (holle hoek, bijv. de nis van de waterval)
 *   klif-gras             klif met grasdek — het bovenste blok van een stapel
 *   klif-gras-hoek        buitenhoek met grasdek
 *   klif-gras-hoek-binnen binnenhoek met grasdek
 *   waterval-top          lip: watervlak dat over de rand krult (bovenop de stapel)
 *   waterval              vallend watervlak, één klifniveau hoog
 *   waterval-voet         onderste vlak dat uitkrult in een schuimkraag
 *   water                 plat watertegel-blokje, 1×1, tegelbaar
 *   schuim                losse schuimboog voor poelranden en rotsen
 *
 * Draai vanuit de repo-root:  node tools/maak-waterval-set.mjs
 *
 * Stapellogica: een waterval van n klifniveaus = waterval-top op niveau n,
 * waterval op de tussenliggende niveaus en waterval-voet op niveau 0, alle in
 * dezelfde kolom als de klif (het water hangt per stijlgids vóór de tegel).
 * De klifwand kijkt naar +Z; randen op x = ±0,5 en de boven- en onderrand
 * zijn vrij van variatie zodat identieke modules naadloos tegelen en stapelen.
 *
 * Kleuren: bestaande cellen (steen, water, wit, gras) met per vlakje een
 * gradiënttrede uit de atlas — bestaand kleurverloop, geen nieuwe kleuren.
 */

import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CEL, uvCel, ruis, maakBouwer, controleerStijl, schrijfGlb } from './modelbouw.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KITMAP = join(ROOT, 'kits', 'helden-kit');

/* -- klifwand --------------------------------------------------------------
 * De wand is een zaagtand van rijen: elk niveau helt van P0 (buiten) naar
 * P1 (terug) en springt via een lichtvangende richel weer naar buiten. Het
 * profiel is periodiek — onderrand en bovenrand liggen allebei op P0 — zodat
 * gestapelde modules één doorlopende klif vormen.
 */

const P0 = 0.48, P1 = 0.40, KOL = 3, RIJEN = 3, RICHEL = 0.78;

/** Wandafstand (t.o.v. het tegelmidden) op hoogte y binnen een module. */
function profiel(y, hoogte) {
  const rijH = hoogte / RIJEN;
  const i = Math.min(RIJEN - 1, Math.floor(y / rijH));
  const t = y / rijH - i;
  return t < RICHEL
    ? P0 + (P1 - P0) * (t / RICHEL)
    : P1 + (P0 - P1) * ((t - RICHEL) / (1 - RICHEL));
}

/** Y-waarden van de knooppunten: per rij de voet en de richelbasis. */
function knopen(hoogte) {
  const rijH = hoogte / RIJEN, ys = [];
  for (let i = 0; i < RIJEN; i++) ys.push(i * rijH, (i + RICHEL) * rijH);
  ys.push(hoogte);
  return ys;
}

/**
 * Bouwt één klifwand. `plaats(u, d, y)` zet wandcoördinaten om naar de
 * wereld (u loopt langs de wand, d is de afstand tot het tegelmidden);
 * `omgekeerd` draait de kolomvolgorde zodat de normaal naar buiten wijst.
 * De randen (`randVan`/`randTot`) zijn 'vast' (rechte rand op ±0,5) of
 * 'profiel' (de rand volgt het wandprofiel — voor hoekmodules, zodat de
 * twee wanden elkaar precies op de hoeklijn raken).
 */
function klifWand(b, plaats, { hoogte, randVan, randTot, omgekeerd = false, zaad }) {
  const ys = knopen(hoogte);
  const punt = (s, j) => {
    const y = ys[j];
    const d0 = profiel(y, hoogte);
    const binnenY = j > 0 && j < ys.length - 1;
    const randS = s === 0 || s === KOL;
    // de kolommen verdelen de werkelijke spanwijdte: bij hoekmodules volgt
    // een rand het profiel en is de wand smaller dan een hele tegel
    const uVan = randVan === 'profiel' ? d0 : -0.5;
    const uTot = randTot === 'profiel' ? d0 : 0.5;
    const span = uTot - uVan;
    const u = uVan + span * (s / KOL);
    const jitter = binnenY && !randS;
    const du = jitter ? (ruis(zaad + s * 13, j * 7 + 3) - 0.5) * 0.07 * span : 0;
    // het reliëf springt vrijwel alleen naar binnen, zodat de wand binnen
    // de tegelrand blijft en tegelende modules elkaar nooit raken
    const dd = jitter ? (ruis(zaad + s * 17, j * 11 + 5) - 0.9) * 0.05 : 0;
    return plaats(u + du, d0 + dd, y);
  };
  for (let j = 0; j < ys.length - 1; j++) {
    const isWand = j % 2 === 0;
    for (let s = 0; s < KOL; s++) {
      const [a, bb] = omgekeerd ? [s + 1, s] : [s, s + 1];
      const p00 = punt(a, j), p10 = punt(bb, j);
      const p11 = punt(bb, j + 1), p01 = punt(a, j + 1);
      const kleur = isWand
        ? uvCel(CEL.steen, 1 + Math.min(2, Math.floor(ruis(zaad + j * 31, s * 7 + 1) * 3)))
        : uvCel(CEL.steen, Math.round(ruis(zaad + j * 19, s * 5 + 2)));
      if ((s + j) % 2 === 0) {
        b.vlak(kleur, p00, p10, p11);
        b.vlak(kleur, p00, p11, p01);
      } else {
        b.vlak(kleur, p00, p10, p01);
        b.vlak(kleur, p10, p11, p01);
      }
    }
  }
}

/**
 * Zijkant van een klifmodule: per rij een vijfhoek waarvan de voorrand het
 * zaagtandprofiel volgt. `plaats(t, y)` zet (diepte, hoogte) om naar de
 * wereld; `omgekeerd` bepaalt de windingsrichting.
 */
function zigzagZijde(b, plaats, { hoogte, omgekeerd = false, kleur }) {
  const rijH = hoogte / RIJEN;
  for (let i = 0; i < RIJEN; i++) {
    const y0 = i * rijH, ym = (i + RICHEL) * rijH, y1 = (i + 1) * rijH;
    const p = [
      plaats(-0.5, y0), plaats(P0, y0), plaats(P1, ym),
      plaats(P0, y1), plaats(-0.5, y1),
    ];
    if (omgekeerd) p.reverse();
    b.vlak(kleur, ...p);
  }
}

/** Grasdek boven op een klifmodule: fascia langs de rand en gefacetteerd dek. */
const GRAS_Y = 0.90, LIP = 0.53;

function grasFascia(b, plaats, { omgekeerd = false, zaad }) {
  for (let s = 0; s < KOL; s++) {
    const [a, bb] = omgekeerd ? [s + 1, s] : [s, s + 1];
    const u = (i) => -0.5 + i / KOL;
    const kleur = uvCel(CEL.gras, 1 + Math.round(ruis(zaad + s * 7, 3)));
    b.vlak(kleur,
      plaats(u(a), P0, GRAS_Y), plaats(u(bb), P0, GRAS_Y),
      plaats(u(bb), LIP, 1), plaats(u(a), LIP, 1));
  }
}

/** Gefacetteerd horizontaal dek: raster van cellen tussen twee hoekpunten. */
function dek(b, x0, z0, x1, z1, y, celKleur, zaad, omlaag = false) {
  const NX = 3, NZ = 2;
  for (let ix = 0; ix < NX; ix++) {
    for (let iz = 0; iz < NZ; iz++) {
      const xa = x0 + ((x1 - x0) * ix) / NX, xb = x0 + ((x1 - x0) * (ix + 1)) / NX;
      const za = z0 + ((z1 - z0) * iz) / NZ, zb = z0 + ((z1 - z0) * (iz + 1)) / NZ;
      const kleur = uvCel(celKleur, 1 + Math.round(ruis(zaad + ix * 11, iz * 13 + 1)));
      const p = [[xa, y, zb], [xb, y, zb], [xb, y, za], [xa, y, za]];
      if (omlaag) p.reverse();
      const [q0, q1, q2, q3] = p;
      if ((ix + iz) % 2 === 0) { b.vlak(kleur, q0, q1, q2); b.vlak(kleur, q0, q2, q3); }
      else { b.vlak(kleur, q0, q1, q3); b.vlak(kleur, q1, q2, q3); }
    }
  }
}

/* -- klifmodules ----------------------------------------------------------- */

function bouwKlif(gras) {
  const b = maakBouwer();
  const hoogte = gras ? GRAS_Y : 1.0;
  const steen = (rij) => uvCel(CEL.steen, rij);

  klifWand(b, (u, d, y) => [u, y, d], { hoogte, randVan: 'vast', randTot: 'vast', zaad: 1 });
  zigzagZijde(b, (t, y) => [-0.5, y, t], { hoogte, omgekeerd: true, kleur: steen(2) });
  zigzagZijde(b, (t, y) => [0.5, y, t], { hoogte, kleur: steen(2) });
  b.vlak(steen(3), [0.5, 0, -0.5], [-0.5, 0, -0.5], [-0.5, hoogte, -0.5], [0.5, hoogte, -0.5]);
  b.vlak(steen(3), [-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, P0], [-0.5, 0, P0]); // bodem

  if (gras) {
    grasFascia(b, (u, d, y) => [u, y, d], { zaad: 2 });
    dek(b, -0.5, -0.5, 0.5, LIP, 1, CEL.gras, 3);
    // zijkantjes van de graslaag
    const zij = (x, omgekeerd) => {
      const p = [[x, GRAS_Y, -0.5], [x, GRAS_Y, P0], [x, 1, LIP], [x, 1, -0.5]];
      if (omgekeerd) p.reverse();
      b.vlak(uvCel(CEL.gras, 2), ...p);
    };
    zij(-0.5, true);
    zij(0.5, false);
    b.vlak(steen(3), [0.5, GRAS_Y, -0.5], [-0.5, GRAS_Y, -0.5], [-0.5, 1, -0.5], [0.5, 1, -0.5]);
  } else {
    dek(b, -0.5, -0.5, 0.5, P0, 1, CEL.steen, 3);
  }
  return b;
}

function bouwKlifHoek(gras) {
  const b = maakBouwer();
  const hoogte = gras ? GRAS_Y : 1.0;
  const steen = (rij) => uvCel(CEL.steen, rij);

  // wand op +Z (van de vaste rand tot de hoeklijn) en op +X (idem, gespiegeld)
  klifWand(b, (u, d, y) => [u, y, d], { hoogte, randVan: 'vast', randTot: 'profiel', zaad: 4 });
  klifWand(b, (u, d, y) => [d, y, u], { hoogte, randVan: 'vast', randTot: 'profiel', omgekeerd: true, zaad: 5 });
  zigzagZijde(b, (t, y) => [-0.5, y, t], { hoogte, omgekeerd: true, kleur: steen(2) });
  zigzagZijde(b, (t, y) => [t, y, -0.5], { hoogte, kleur: steen(2) });
  b.vlak(steen(3), [-0.5, 0, -0.5], [P0, 0, -0.5], [P0, 0, P0], [-0.5, 0, P0]); // bodem

  if (gras) {
    grasFascia(b, (u, d, y) => [u, y, d], { zaad: 6 });
    grasFascia(b, (u, d, y) => [d, y, u], { omgekeerd: true, zaad: 7 });
    dek(b, -0.5, -0.5, LIP, LIP, 1, CEL.gras, 8);
    const zij = (plaats, omgekeerd) => {
      const p = [plaats(-0.5, GRAS_Y), plaats(P0, GRAS_Y), plaats(LIP, 1), plaats(-0.5, 1)];
      if (omgekeerd) p.reverse();
      b.vlak(uvCel(CEL.gras, 2), ...p);
    };
    zij((t, y) => [-0.5, y, t], true);
    zij((t, y) => [t, y, -0.5], false);
  } else {
    dek(b, -0.5, -0.5, P0, P0, 1, CEL.steen, 8);
  }
  return b;
}

function bouwKlifHoekBinnen(gras) {
  const b = maakBouwer();
  const hoogte = gras ? GRAS_Y : 1.0;
  const steen = (rij) => uvCel(CEL.steen, rij);

  // holle hoek: de wanden lopen van de hoeklijn naar de vaste buitenranden
  klifWand(b, (u, d, y) => [u, y, d], { hoogte, randVan: 'profiel', randTot: 'vast', zaad: 9 });
  klifWand(b, (u, d, y) => [d, y, u], { hoogte, randVan: 'profiel', randTot: 'vast', omgekeerd: true, zaad: 10 });
  zigzagZijde(b, (t, y) => [0.5, y, t], { hoogte, kleur: steen(2) });
  zigzagZijde(b, (t, y) => [t, y, 0.5], { hoogte, omgekeerd: true, kleur: steen(2) });
  b.vlak(steen(3), [0.5, 0, -0.5], [-0.5, 0, -0.5], [-0.5, hoogte, -0.5], [0.5, hoogte, -0.5]);
  b.vlak(steen(3), [-0.5, 0, -0.5], [-0.5, hoogte, -0.5], [-0.5, hoogte, 0.5], [-0.5, 0, 0.5]);
  // bodem als L: linkerbeen plus onderbeen
  b.vlak(steen(3), [-0.5, 0, -0.5], [P0, 0, -0.5], [P0, 0, 0.5], [-0.5, 0, 0.5]);
  b.vlak(steen(3), [P0, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, P0], [P0, 0, P0]);

  const kap = gras ? 1 : null;
  if (kap) {
    grasFascia(b, (u, d, y) => [u, y, d], { zaad: 11 });
    grasFascia(b, (u, d, y) => [d, y, u], { omgekeerd: true, zaad: 12 });
    dek(b, -0.5, -0.5, LIP, 0.5, 1, CEL.gras, 13);
    dek(b, LIP, -0.5, 0.5, LIP, 1, CEL.gras, 14);
    const zij = (plaats, omgekeerd) => {
      const p = [plaats(-0.5, GRAS_Y), plaats(P0, GRAS_Y), plaats(LIP, 1), plaats(-0.5, 1)];
      if (omgekeerd) p.reverse();
      b.vlak(uvCel(CEL.gras, 2), ...p);
    };
    // gras-zijkantjes langs de open randen van beide wanden
    zij((t, y) => [0.5, y, t], false);
    zij((t, y) => [t, y, 0.5], true);
  } else {
    dek(b, -0.5, -0.5, P0, 0.5, 1, CEL.steen, 13);
    dek(b, P0, -0.5, 0.5, P0, 1, CEL.steen, 14);
  }
  return b;
}

/* -- water ------------------------------------------------------------------
 * Het vallende water is één vlak (het materiaal is dubbelzijdig): een raster
 * van facetten met turquoise treden en af en toe een witte schuimstreep.
 */

const WATER_Z = 0.55, WATER_DIKTE = 0.08;

/**
 * Tint van een watervalfacet. Schuimstrepen lopen verticaal: een kolom is
 * met kans `streepKans` een streepkolom en kleurt dan overwegend wit; de
 * rest wisselt tussen de twee lichtste waterturquoise-treden (vallend
 * water is lichter dan de poel).
 */
function waterTint(zaad, kolom, rij, streepKans) {
  const streepKolom = ruis(zaad + kolom * 41, 9) < streepKans;
  if (streepKolom && ruis(zaad + kolom * 23, rij * 29 + 7) < 0.72) {
    return uvCel(CEL.wit, Math.round(ruis(zaad + kolom * 31, rij * 37 + 2)));
  }
  return uvCel(CEL.water, Math.floor(ruis(zaad + kolom * 13, rij * 17 + 3) * 2));
}

const WATER_KOL = 4;

/** Raster van vlakjes over een lijst (z, y)-knopen, breedte x = -0,5..0,5. */
function waterBaan(b, lijn, { zaad, streepKans, jitterBinnen = true }) {
  const punt = (s, j) => {
    const [z, y] = lijn[j];
    const rand = s === 0 || s === WATER_KOL || j === 0 || j === lijn.length - 1;
    const dz = jitterBinnen && !rand ? (ruis(zaad + s * 19, j * 23 + 1) - 0.5) * 0.06 : 0;
    return [-0.5 + s / WATER_KOL, y, z + dz];
  };
  for (let j = 0; j < lijn.length - 1; j++) {
    for (let s = 0; s < WATER_KOL; s++) {
      const p00 = punt(s, j), p10 = punt(s + 1, j);
      const p11 = punt(s + 1, j + 1), p01 = punt(s, j + 1);
      const kleur = waterTint(zaad, s, j, streepKans(j));
      if ((s + j) % 2 === 0) { b.vlak(kleur, p00, p10, p11); b.vlak(kleur, p00, p11, p01); }
      else { b.vlak(kleur, p00, p10, p01); b.vlak(kleur, p10, p11, p01); }
    }
  }
}

/** Schuimbrok: gefacetteerd wit bergje met een punt, voet op Y = 0. */
function brok(b, cx, cz, r, h, zaad) {
  const N = 5;
  const ring = [];
  for (let i = 0; i < N; i++) {
    const hoek = (i / N) * 2 * Math.PI + (ruis(zaad + i * 7, 1) - 0.5) * 0.5;
    const rr = r * (0.75 + ruis(zaad + i * 11, 2) * 0.5);
    ring.push([cx + rr * Math.cos(hoek), cz + rr * Math.sin(hoek)]);
  }
  const midY = h * 0.72;
  for (let i = 0; i < N; i++) {
    const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % N];
    const kleur = uvCel(CEL.wit, Math.round(ruis(zaad + i * 13, 3)));
    b.vlak(kleur, [x0, 0, z0], [x1, 0, z1], [x1, midY, z1], [x0, midY, z0]);
    b.vlak(uvCel(CEL.wit, 0), [x0, midY, z0], [x1, midY, z1], [cx, h, cz]);
  }
}

/** Plat schuimvlak (zeshoekige vlek) net boven het water. */
function plaat(b, cx, cz, r, y, zaad) {
  const N = 6, punten = [];
  for (let i = 0; i < N; i++) {
    const hoek = (i / N) * 2 * Math.PI + (ruis(zaad + i * 5, 4) - 0.5) * 0.4;
    const rr = r * (0.7 + ruis(zaad + i * 9, 5) * 0.6);
    punten.push([cx + rr * Math.cos(hoek), y, cz + rr * Math.sin(hoek)]);
  }
  b.vlak(uvCel(CEL.wit, 0), ...punten.reverse());
}

function bouwWatervalTop() {
  const b = maakBouwer();
  const LIP_VAN = 0.30;
  // aanloopvlak: ondiepe waterlaag die op het klifdek rust
  dek(b, -0.5, -0.5, 0.5, LIP_VAN, WATER_DIKTE, CEL.water, 21);
  b.vlak(uvCel(CEL.water, 2), [0.5, 0, -0.5], [-0.5, 0, -0.5], [-0.5, WATER_DIKTE, -0.5], [0.5, WATER_DIKTE, -0.5]);
  b.vlak(uvCel(CEL.water, 2), [-0.5, 0, -0.5], [-0.5, WATER_DIKTE, -0.5], [-0.5, WATER_DIKTE, LIP_VAN], [-0.5, 0, LIP_VAN]);
  b.vlak(uvCel(CEL.water, 2), [0.5, 0, -0.5], [0.5, 0, LIP_VAN], [0.5, WATER_DIKTE, LIP_VAN], [0.5, WATER_DIKTE, -0.5]);
  b.vlak(uvCel(CEL.water, 3), [-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, LIP_VAN], [-0.5, 0, LIP_VAN]);
  // dwarsdoorsnede onder de lip
  b.vlak(uvCel(CEL.water, 2), [-0.5, 0, LIP_VAN], [0.5, 0, LIP_VAN], [0.5, WATER_DIKTE, LIP_VAN], [-0.5, WATER_DIKTE, LIP_VAN]);
  // de lip zelf: van horizontaal naar verticaal, eindigend op de vaste
  // vlaklijn (WATER_Z) waar het watervalsegment eronder naadloos aansluit
  waterBaan(b, [
    [LIP_VAN, WATER_DIKTE], [0.40, 0.075], [0.50, 0.03], [WATER_Z, 0],
  ], { zaad: 22, streepKans: () => 0.45, jitterBinnen: false });
  return b;
}

function bouwWaterval() {
  const b = maakBouwer();
  waterBaan(b, [
    [WATER_Z, 1], [WATER_Z, 2 / 3], [WATER_Z, 1 / 3], [WATER_Z, 0],
  ], { zaad: 23, streepKans: () => 0.35 });
  return b;
}

function bouwWatervalVoet() {
  const b = maakBouwer();
  waterBaan(b, [
    [WATER_Z, 1], [WATER_Z, 0.70], [0.585, 0.45], [0.645, 0.28], [0.72, 0.10],
  ], { zaad: 24, streepKans: (j) => [0.35, 0.45, 0.65, 0.9][Math.min(j, 3)] });
  // schuimkraag rond de plons
  brok(b, -0.36, 0.62, 0.13, 0.16, 31);
  brok(b, -0.16, 0.74, 0.15, 0.19, 32);
  brok(b, 0.06, 0.79, 0.14, 0.21, 33);
  brok(b, 0.27, 0.72, 0.13, 0.17, 34);
  brok(b, 0.41, 0.60, 0.10, 0.12, 35);
  brok(b, 0.12, 0.62, 0.10, 0.13, 36);
  plaat(b, -0.24, 0.66, 0.18, 0.05, 37);
  plaat(b, 0.2, 0.68, 0.17, 0.055, 38);
  plaat(b, -0.02, 0.6, 0.16, 0.045, 39);
  return b;
}

function bouwWater() {
  const b = maakBouwer();
  const N = 4, top = WATER_DIKTE;
  const punt = (ix, iz) => {
    const rand = ix === 0 || ix === N || iz === 0 || iz === N;
    const dy = rand ? 0 : (ruis(41 + ix * 7, iz * 11 + 3) - 0.5) * 0.025;
    return [-0.5 + ix / N, top + dy, -0.5 + iz / N];
  };
  for (let ix = 0; ix < N; ix++) {
    for (let iz = 0; iz < N; iz++) {
      const p00 = punt(ix, iz), p10 = punt(ix + 1, iz);
      const p11 = punt(ix + 1, iz + 1), p01 = punt(ix, iz + 1);
      const kleur = uvCel(CEL.water, ruis(42 + ix * 13, iz * 17 + 5) > 0.72 ? 2 : 1);
      if ((ix + iz) % 2 === 0) { b.vlak(kleur, p00, p01, p11); b.vlak(kleur, p00, p11, p10); }
      else { b.vlak(kleur, p00, p01, p10); b.vlak(kleur, p01, p11, p10); }
    }
  }
  const zijKleur = uvCel(CEL.water, 2);
  b.vlak(zijKleur, [-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, top, 0.5], [-0.5, top, 0.5]);
  b.vlak(zijKleur, [0.5, 0, -0.5], [-0.5, 0, -0.5], [-0.5, top, -0.5], [0.5, top, -0.5]);
  b.vlak(zijKleur, [-0.5, 0, -0.5], [-0.5, 0, 0.5], [-0.5, top, 0.5], [-0.5, top, -0.5]);
  b.vlak(zijKleur, [0.5, 0, 0.5], [0.5, 0, -0.5], [0.5, top, -0.5], [0.5, top, 0.5]);
  b.vlak(uvCel(CEL.water, 3), [-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5]);
  return b;
}

function bouwSchuim() {
  const b = maakBouwer();
  brok(b, -0.26, 0.10, 0.13, 0.17, 51);
  brok(b, -0.05, 0.24, 0.14, 0.20, 52);
  brok(b, 0.18, 0.16, 0.12, 0.15, 53);
  brok(b, 0.30, -0.06, 0.10, 0.11, 54);
  plaat(b, -0.16, 0.2, 0.17, 0.05, 55);
  plaat(b, 0.16, 0.05, 0.16, 0.045, 56);
  return b;
}

/* -- alles bouwen en schrijven --------------------------------------------- */

export const BOUWERS = {
  'klif': () => bouwKlif(false),
  'klif-hoek': () => bouwKlifHoek(false),
  'klif-hoek-binnen': () => bouwKlifHoekBinnen(false),
  'klif-gras': () => bouwKlif(true),
  'klif-gras-hoek': () => bouwKlifHoek(true),
  'klif-gras-hoek-binnen': () => bouwKlifHoekBinnen(true),
  'waterval-top': bouwWatervalTop,
  'waterval': bouwWaterval,
  'waterval-voet': bouwWatervalVoet,
  'water': bouwWater,
  'schuim': bouwSchuim,
};

/** Ruimte buiten de tegel per model: alleen detail-overstek (stijlgids §4). */
const MAX_HALF = {
  'klif-gras': 0.55, 'klif-gras-hoek': 0.55, 'klif-gras-hoek-binnen': 0.55,
  'waterval-top': 0.58, 'waterval': 0.60, 'waterval-voet': 0.95,
};

const isHoofdmodule = process.argv[1] === fileURLToPath(import.meta.url);
if (isHoofdmodule) {
  for (const [naam, bouw] of Object.entries(BOUWERS)) {
    const b = bouw();
    const { maxHoogte } = controleerStijl(b, { maxHalf: MAX_HALF[naam] ?? 0.5 });
    const doel = join(KITMAP, `${naam}.glb`);
    const { driehoeken } = schrijfGlb(b, doel, naam, {
      generator: 'tools/maak-waterval-set.mjs',
    });
    console.log(`${naam.padEnd(22)} ${String(driehoeken).padStart(4)} driehoeken, hoogte ${maxHoogte.toFixed(2)}`);
  }
}
