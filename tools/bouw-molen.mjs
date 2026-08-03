/**
 * Bouwt de twee molens in kits/taalei-kit/ uit onderdelen die al in kits/ staan.
 *
 * Draai vanuit de repo-root:  node tools/bouw-molen.mjs
 *
 * Er wordt geen enkel vlak nieuw getekend. Een molen is een stapeling van
 * bestaande Kenney-onderdelen, verplaatst, gedraaid en geschaald, en daarna
 * platgeslagen tot één mesh met één materiaal — dezelfde vorm als de rest van
 * de kits, zodat de catalogus en de laadcode geen uitzondering nodig hebben.
 *
 * Beide molens hebben dezelfde romp, deur, raam, vloer en wieken; ze verschillen
 * alleen in de kap:
 *   windmill           de koepel van pirate-kit/structure-roof, uitgerekt
 *   windmill-hip-roof  vier keer fantasy-town-kit/roof-corner-round, ware grootte
 *
 * Wat waar vandaan komt:
 *   fantasy-town-kit/wall-wood-corner-diagonal(-half)  romp en plint
 *   fantasy-town-kit/wall-wood-doorway-square          deur
 *   fantasy-town-kit/wall-wood-window-shutters         raam
 *   fantasy-town-kit/roof-flat                         vloer
 *   pirate-kit/structure-roof                          kap (alleen de koepel)
 *   fantasy-town-kit/roof-corner-round                 kap (schilddak)
 *   fantasy-town-kit/windmill                          wiekenkruis
 *
 * Een paar onderdelen krijgen andere uv's mee: beide kappen gaan naar leisteen
 * en het zeildoek van de wieken van zandkleur naar gebroken wit. Al die cellen
 * staan al in kits/palet.json; er komt geen kleur bij.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KITS = join(ROOT, 'kits');

/* -- .glb inlezen ---------------------------------------------------------
 * GLB-container: 12-byte header, daarna chunks van [lengte, type, data]. De
 * Kenney-bestanden zijn allemaal één mesh met één primitive en losse
 * POSITION/NORMAL/TEXCOORD_0-accessors; meer hoeft dit script niet aan te
 * kunnen, dus de lezer blijft klein.
 */
const COMPONENTEN = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const LEZERS = {
  5120: ['getInt8', 1], 5121: ['getUint8', 1], 5122: ['getInt16', 2],
  5123: ['getUint16', 2], 5125: ['getUint32', 4], 5126: ['getFloat32', 4],
};

function leesGlb(pad) {
  const buf = readFileSync(pad);
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) {
    throw new Error(`geen geldige GLB: ${pad}`);
  }
  const eind = buf.readUInt32LE(8);
  let off = 12;
  let json = null;
  let bin = null;
  while (off + 8 <= eind) {
    const lengte = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const data = buf.subarray(off + 8, off + 8 + lengte);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    else if (type === 0x004e4942) bin = Buffer.from(data);
    off += 8 + lengte;
  }
  if (!json) throw new Error(`geen JSON-chunk: ${pad}`);
  return { json, bin };
}

function leesAccessor(json, bin, index) {
  const accessor = json.accessors[index];
  const componenten = COMPONENTEN[accessor.type];
  const [lezer, breedte] = LEZERS[accessor.componentType];
  const view = json.bufferViews[accessor.bufferView];
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const basis = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stap = view.byteStride ?? componenten * breedte;

  const uit = new Float64Array(accessor.count * componenten);
  for (let i = 0; i < accessor.count; i++) {
    for (let c = 0; c < componenten; c++) {
      uit[i * componenten + c] = dv[lezer](basis + i * stap + c * breedte, true);
    }
  }
  return { data: uit, count: accessor.count };
}

/* -- matrices -------------------------------------------------------------
 * Kolom-major, zoals glTF ze aanlevert.
 */
const EENHEID = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function maalMatrix(a, b) {
  const r = new Array(16).fill(0);
  for (let kolom = 0; kolom < 4; kolom++) {
    for (let rij = 0; rij < 4; rij++) {
      let som = 0;
      for (let k = 0; k < 4; k++) som += a[k * 4 + rij] * b[kolom * 4 + k];
      r[kolom * 4 + rij] = som;
    }
  }
  return r;
}

function samenstellen({ t = [0, 0, 0], r = [0, 0, 0, 1], s = [1, 1, 1] }) {
  const [x, y, z, w] = r;
  return [
    (1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + z * w) * s[0], 2 * (x * z - y * w) * s[0], 0,
    2 * (x * y - z * w) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + x * w) * s[1], 0,
    2 * (x * z + y * w) * s[2], 2 * (y * z - x * w) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}

const T = (x, y, z) => samenstellen({ t: [x, y, z] });
const S = (x, y, z) => samenstellen({ s: [x, y, z] });
const R = (graden) => {
  const half = (graden * Math.PI) / 360;
  return samenstellen({ r: [0, Math.sin(half), 0, Math.cos(half)] });
};
/** Spiegeling in het vlak x = z: verwisselt de twee wandhelften van een hoekstuk. */
const SPIEGEL_XZ = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1];

function nodeMatrix(node) {
  if (node.matrix) return node.matrix;
  return samenstellen({ t: node.translation, r: node.rotation, s: node.scale });
}

/** Alle primitives van een .glb, met de node-transforms er al in verwerkt. */
const gelezen = new Map();
function leesModel(pad) {
  if (gelezen.has(pad)) return gelezen.get(pad);
  const { json, bin } = leesGlb(join(KITS, `${pad}.glb`));
  const stukken = [];
  const scene = json.scenes[json.scene ?? 0];

  const loop = (index, ouder) => {
    const node = json.nodes[index];
    const wereld = maalMatrix(ouder, nodeMatrix(node));
    for (const prim of json.meshes?.[node.mesh]?.primitives ?? []) {
      const posities = leesAccessor(json, bin, prim.attributes.POSITION);
      stukken.push({
        posities: posities.data,
        normalen: leesAccessor(json, bin, prim.attributes.NORMAL).data,
        uvs: leesAccessor(json, bin, prim.attributes.TEXCOORD_0).data,
        indices: Array.from(leesAccessor(json, bin, prim.indices).data),
        matrix: wereld,
      });
    }
    for (const kind of node.children ?? []) loop(kind, wereld);
  };
  for (const index of scene.nodes) loop(index, EENHEID);

  gelezen.set(pad, stukken);
  return stukken;
}

/* -- paletcellen ----------------------------------------------------------
 * De colormap is een raster van 16 × 4 cellen en elke cel is een verticale
 * verloopstrook. Een deel naar een andere cel verplaatsen is dus een vaste
 * verschuiving van de uv's; het verloop bínnen de cel blijft intact, en de
 * vlakken blijven precies één texel per vlak aanwijzen.
 */
const celVanUv = (u, v) => `${Math.floor(u * 16)}/${Math.floor(v * 4)}`;
const uvVanCel = (cel) => {
  const [kolom, rij] = cel.split('/').map(Number);
  return [kolom / 16, rij / 4];
};

/**
 * Grootste aaneengesloten stuk uit een driehoekenlijst. `structure-roof` heeft
 * losse palmbladeren op de koepel liggen; die hangen nergens aan vast en
 * vallen er zo vanzelf af.
 */
function grootsteEiland(posities, indices) {
  const zelfdePunt = new Map();
  const ouder = new Map();
  const kern = (i) => {
    const sleutel = [0, 1, 2].map((c) => posities[i * 3 + c].toFixed(4)).join(',');
    if (!zelfdePunt.has(sleutel)) {
      zelfdePunt.set(sleutel, i);
      ouder.set(i, i);
    }
    return zelfdePunt.get(sleutel);
  };
  const zoek = (x) => {
    while (ouder.get(x) !== x) {
      ouder.set(x, ouder.get(ouder.get(x)));
      x = ouder.get(x);
    }
    return x;
  };

  for (let i = 0; i < indices.length; i += 3) {
    const punten = [kern(indices[i]), kern(indices[i + 1]), kern(indices[i + 2])];
    for (const [a, b] of [[punten[0], punten[1]], [punten[1], punten[2]]]) {
      const [ra, rb] = [zoek(a), zoek(b)];
      if (ra !== rb) ouder.set(ra, rb);
    }
  }

  const eilanden = new Map();
  for (let i = 0; i < indices.length; i += 3) {
    const groep = zoek(kern(indices[i]));
    if (!eilanden.has(groep)) eilanden.set(groep, []);
    eilanden.get(groep).push(...indices.slice(i, i + 3));
  }
  return [...eilanden.values()].sort((a, b) => b.length - a.length)[0] ?? [];
}

/* -- onderdelen plaatsen -------------------------------------------------- */

let delen = [];

/**
 * Normaalmatrix: de geïnverteerde getransponeerde van de linkerbovenhoek. Bij
 * een niet-uniforme schaal kantelt een normaal anders dan een richtingsvector,
 * dus de gewone matrix erop loslaten geeft normalen die scheef staan op hun
 * eigen vlak — en daarmee een verkeerd belichte, gladgestreken vorm.
 */
function normaalMatrix(m) {
  const a = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
  const [c00, c01, c02] = [a[4] * a[8] - a[5] * a[7], a[5] * a[6] - a[3] * a[8], a[3] * a[7] - a[4] * a[6]];
  const det = a[0] * c00 + a[1] * c01 + a[2] * c02;
  if (Math.abs(det) < 1e-12) return a;
  // De cofactormatrix is de geïnverteerde getransponeerde op een factor det na,
  // en die factor verdwijnt bij het normaliseren.
  return [
    c00, c01, c02,
    a[2] * a[7] - a[1] * a[8], a[0] * a[8] - a[2] * a[6], a[1] * a[6] - a[0] * a[7],
    a[1] * a[5] - a[2] * a[4], a[2] * a[3] - a[0] * a[5], a[0] * a[4] - a[1] * a[3],
  ];
}

/**
 * @param {string} pad  kit/model, zonder .glb
 * @param {object} opties
 *   yVanaf   houd alleen driehoeken die volledig boven deze lokale hoogte liggen
 *   eiland   houd daarna alleen het grootste aaneengesloten stuk
 *   hercel   { 'kolom/rij': 'kolom/rij' } verplaatst uv's naar een andere paletcel
 *   facetten vervang de normalen door één normaal per driehoek
 * @param {...number[]} matrices  van buiten naar binnen, zoals je ze leest
 */
function zet(pad, opties, ...matrices) {
  const matrix = matrices.reduce(maalMatrix, EENHEID);

  for (const stuk of leesModel(pad)) {
    const m = maalMatrix(matrix, stuk.matrix);
    const nm = normaalMatrix(m);
    const aantal = stuk.posities.length / 3;
    const posities = new Float64Array(aantal * 3);
    const normalen = new Float64Array(aantal * 3);

    for (let i = 0; i < aantal; i++) {
      const [x, y, z] = [stuk.posities[i * 3], stuk.posities[i * 3 + 1], stuk.posities[i * 3 + 2]];
      posities[i * 3] = m[0] * x + m[4] * y + m[8] * z + m[12];
      posities[i * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      posities[i * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];

      const [a, b, c] = [stuk.normalen[i * 3], stuk.normalen[i * 3 + 1], stuk.normalen[i * 3 + 2]];
      const nx = nm[0] * a + nm[3] * b + nm[6] * c;
      const ny = nm[1] * a + nm[4] * b + nm[7] * c;
      const nz = nm[2] * a + nm[5] * b + nm[8] * c;
      const lengte = Math.hypot(nx, ny, nz) || 1;
      normalen[i * 3] = nx / lengte;
      normalen[i * 3 + 1] = ny / lengte;
      normalen[i * 3 + 2] = nz / lengte;
    }

    let indices = stuk.indices;
    if (opties.yVanaf !== undefined) {
      indices = [];
      for (let i = 0; i < stuk.indices.length; i += 3) {
        const hoogtes = [0, 1, 2].map((k) => stuk.posities[stuk.indices[i + k] * 3 + 1]);
        if (Math.min(...hoogtes) >= opties.yVanaf) indices.push(...stuk.indices.slice(i, i + 3));
      }
    }
    if (opties.eiland) indices = grootsteEiland(posities, indices);

    // Een spiegeling keert de winding om; zonder deze omdraai staan de vlakken
    // van het gespiegelde hoekstuk naar binnen.
    const determinant =
      m[0] * (m[5] * m[10] - m[6] * m[9]) -
      m[4] * (m[1] * m[10] - m[2] * m[9]) +
      m[8] * (m[1] * m[6] - m[2] * m[5]);
    if (determinant < 0) {
      indices = indices.slice();
      for (let i = 0; i + 2 < indices.length; i += 3) {
        [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
      }
    }

    let uvs = stuk.uvs;
    if (opties.hercel) {
      uvs = Float64Array.from(uvs);
      for (let i = 0; i < uvs.length; i += 2) {
        const van = celVanUv(uvs[i], uvs[i + 1]);
        const naar = opties.hercel[van];
        if (!naar) continue;
        const [vanU, vanV] = uvVanCel(van);
        const [naarU, naarV] = uvVanCel(naar);
        uvs[i] += naarU - vanU;
        uvs[i + 1] += naarV - vanV;
      }
    }

    if (opties.facetten) {
      // De koepel van structure-roof is gladgeschaduwd: één normaal per hoekpunt,
      // gemiddeld over de aanliggende vlakken. Dat leest als een bol, niet als
      // vlakke stukken. Elke driehoek krijgt daarom zijn eigen hoekpunten en zijn
      // eigen normaal, zoals de rest van de kits het doet.
      const p = [], n = [], t = [], nieuw = [];
      for (let i = 0; i < indices.length; i += 3) {
        const hoek = [0, 1, 2].map((k) => indices[i + k]);
        const [A, B, C] = hoek.map((j) => [posities[j * 3], posities[j * 3 + 1], posities[j * 3 + 2]]);
        const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
        const v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
        const vlak = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const lengte = Math.hypot(...vlak) || 1;
        for (const j of hoek) {
          nieuw.push(p.length / 3);
          p.push(posities[j * 3], posities[j * 3 + 1], posities[j * 3 + 2]);
          n.push(vlak[0] / lengte, vlak[1] / lengte, vlak[2] / lengte);
          t.push(uvs[j * 2], uvs[j * 2 + 1]);
        }
      }
      delen.push({ posities: p, normalen: n, uvs: t, indices: nieuw });
      continue;
    }

    delen.push({ posities, normalen, uvs, indices });
  }
}

/* -- de molen -------------------------------------------------------------
 * Alle maten in rastereenheden: één wandsegment is 1 × 1, wandhoogte 1.
 */

/**
 * Romp. Vier `wall-wood-corner-diagonal` op de vier cellen van een 2 × 2
 * voetafdruk vormen samen een achthoek: vier rechte vlakken en vier schuine
 * hoeken. Dat is acht vlakke stukken per cirkel, ruim binnen de zestien uit
 * asset_style_guide.md, en het is de enige achthoek die de kit al kan maken.
 *
 * Alle ringen even breed, en dat is een eis, geen keuze. Een wandpaneel is 0.05
 * dik; laat je elke ring krimpen, dan verspringt hij radiaal verder dan die 0.05
 * en overlappen twee ringen elkaar niet meer. De mantel is dan geen gesloten
 * schil maar een stapel losse ringen met ringvormige spleten ertussen, en daar
 * kijk je van bovenaf dwars doorheen.
 */
const HOEKEN = [0, -90, 180, 90]; // schuine hoek naar +x+z, -x+z, -x-z, +x-z

function ring(y, schaal, hoogte, { voorkantOpen = false } = {}) {
  for (const graden of HOEKEN) {
    const plaats = [T(0, y, 0), S(schaal, hoogte, schaal), R(graden), T(0.5, 0, 0.5)];
    if (voorkantOpen && graden === 90) {
      // Rechtsvoor: alleen de zijwand en de schuine hoek, het voorvlak blijft
      // leeg voor de deur. Zou de wandhelft blijven staan, dan keek je door de
      // deuropening tegen een dichte wand op 2.5 cm afstand aan.
      zet('fantasy-town-kit/wall-wood-corner-diagonal-half', {}, ...plaats);
    } else if (voorkantOpen && graden === 0) {
      // Linksvoor: hetzelfde stuk gespiegeld, zodat de wandhelft aan de zijkant zit.
      zet('fantasy-town-kit/wall-wood-corner-diagonal-half', {}, ...plaats, SPIEGEL_XZ);
    } else {
      zet('fantasy-town-kit/wall-wood-corner-diagonal', {}, ...plaats);
    }
  }
}

const PLINT_HOOG = 0.22;
const VERDIEPINGEN = 3;
const BOVEN = PLINT_HOOG + VERDIEPINGEN;
/* De plint mag iets breder, maar niet breder dan de wanddikte toelaat: bij meer
 * dan 1.054 laat hij dezelfde spleet vallen als een krimpende ring zou doen. */
const PLINT_BREED = 1.04;

/* De halve dikte van het wiekenkruis: de naaf moet zo ver voor de kap staan dat
 * het kruis er vrij langs draait. */
const WIEK_DIK = 0.235;

/**
 * De twee kappen. Elke kap zet zijn eigen onderdelen neer en zegt daarna hoe
 * hoog hij is en hoe ver hij aan de voorkant uitsteekt; daar hangt de naaf van
 * de wieken aan.
 */
const KAPPEN = {
  /* De koepel van `pirate-kit/structure-roof` is de enige achthoekige kap in de
   * kits en past dus bij de achthoekige romp; de vier poten eronder en de
   * palmbladeren erop laten we vallen. Iets hoger uitgerekt dan hij van zichzelf
   * is, want een molenkap is geen huisdak, en van riet naar leisteen zodat hij
   * zich losmaakt van het zeildoek. */
  windmill() {
    const BREED = 1.234; // gemeten breedte van de koepel in structure-roof
    const HOOG = 0.56;   // en de hoogte, van y = 0.8 tot y = 1.36
    /* Eén procent ruimer dan de romp, zodat de kap er overal net overheen valt;
     * precies passend laat vanuit loodrecht boven twee haarscherpe spleetjes bij
     * de schuine hoeken open. */
    const schaal = 2.02 / BREED;
    const rek = 1.35;
    zet('pirate-kit/structure-roof',
      { yVanaf: 0.79, eiland: true, facetten: true, hercel: { '13/0': '6/1' } },
      T(0, BOVEN - 0.8 * schaal * rek, 0), S(schaal, schaal * rek, schaal));
    return { hoogte: HOOG * schaal * rek, voorkant: 0.6 * schaal };
  },

  /* Vier `roof-corner-round` op ware grootte. Elk stuk is een hoek van een
   * schilddak over één cel van 1 × 1, met de nok in de hoek (+x, -z) en de
   * dakrand over -x en +z heen. Zet je ze op de vier cellen van een 2 × 2 en
   * draai je ze mee, dan komen de vier nokpunten samen op de as van de molen.
   * De kap steekt daardoor 0.23 buiten de bovenste ring uit — een echte
   * dakrand, in plaats van een kap die op de romp is afgesneden. */
  'windmill-hip-roof'() {
    for (const graden of [0, 90, 180, 270]) {
      zet('fantasy-town-kit/roof-corner-round', { hercel: { '5/1': '6/1' } },
        T(0, BOVEN, 0), R(graden), T(-0.5, 0, 0.5));
    }
    return { hoogte: 0.626, voorkant: 1.067 };
  },
};

function bouwMolen(naam) {
  delen = [];

  ring(0, PLINT_BREED, PLINT_HOOG); // plint: dezelfde ring, plat gedrukt
  /* Verdieping 0 en 1 staan aan de voorkant open: daar komen de deur en het raam
   * in. Laat je de wandhelft staan en zet je het stuk ervoor, dan liggen frame en
   * wandpaneel vlak op vlak en gaan ze flikkeren. */
  for (let i = 0; i < VERDIEPINGEN; i++) {
    ring(PLINT_HOOG + i, 1, 1, { voorkantOpen: i < 2 });
  }

  zet('fantasy-town-kit/wall-wood-doorway-square', {}, T(0.5, PLINT_HOOG, 0));
  zet('fantasy-town-kit/wall-wood-window-shutters', {}, T(0.5, PLINT_HOOG + 1, 0));

  /* Vloer. Zonder vloer kijk je door de deuropening naar beneden onder de molen
   * door. Een vierkante plaat helpt niet: het grootste vierkant dat in de
   * achthoek past reikt tot 0.72 en laat op de vier rechte vlakken een spleet
   * open, en twee gekruiste vierkanten maken samen een achtpuntige ster — de
   * achthoek is hun snijding, niet hun vereniging. Daarom dezelfde koepel als bij
   * de kap, plat gedrukt: die is zelf achthoekig. Een kwartslag gedraaid vallen
   * zijn punten op de rechte vlakken, zodat de vloer daar tot aan de wand komt. */
  const VLOER = 1.368; // zo dat de punten precies op de wand uitkomen
  zet('pirate-kit/structure-roof', { yVanaf: 0.79, eiland: true, hercel: { '13/0': '12/0' } },
    T(0, 0.16, 0), R(45), S(VLOER, 0.1, VLOER), T(0, -0.8, 0));

  const kapVanaf = delen.length;
  const kap = KAPPEN[naam]();
  /* Hoe ver de kap op een gegeven hoogte naar voren komt. Aan de naaf van de
   * wieken hangt dat af: meet je hem op het breedste punt van de kap, dan hangt
   * het wiekenkruis los in de lucht op de hoogte waar het echt zit. */
  const kapVoorkantOp = (y) => {
    let max = -Infinity;
    for (const deel of delen.slice(kapVanaf)) {
      for (let i = 0; i < deel.posities.length; i += 3) {
        if (Math.abs(deel.posities[i + 1] - y) < 0.12) max = Math.max(max, deel.posities[i]);
      }
    }
    return max;
  };

  /* Wieken. `fantasy-town-kit/windmill.glb` is precies het wiekenkruis en verder
   * niets: naaf op de oorsprong, kruis in het y-z-vlak, dus het kijkt al naar
   * +x. Op ware grootte, zonder schaal: kleiner gemaakt reiken de wieken
   * nauwelijks voorbij de romp en valt precies weg waar een molen aan te
   * herkennen is.
   *
   * Het kruis moet vrij langs de romp én langs de dakrand kunnen draaien, en die
   * steken allebei verder uit dan de kap op naafhoogte. Het kruis kan dus niet
   * tegen de kap aan staan; daar zit in het echt ook een as tussen. */
  const naafY = BOVEN + kap.hoogte * 0.45;
  const naafX = Math.max(kap.voorkant, PLINT_BREED * 0.975) + WIEK_DIK + 0.06;
  zet('fantasy-town-kit/windmill', { hercel: { '5/3': '5/2' } }, T(naafX, naafY, 0));

  /* De bovenas: `pillar-wood` een kwartslag gekanteld, van binnen de kap tot in
   * het blok van de naaf, zodat het wiekenkruis ergens aan vastzit. */
  const asVan = kapVoorkantOp(naafY) - 0.15;
  zet('fantasy-town-kit/pillar-wood', {},
    T(asVan, naafY, 0), samenstellen({ r: [0, 0, -Math.sin(Math.PI / 4), Math.cos(Math.PI / 4)] }),
    S(1, naafX + 0.12 - asVan, 1), T(0, 0, 0));

  return schrijfGlb(naam);
}

/* -- wegschrijven ---------------------------------------------------------
 * Eén mesh, één primitive, één opaak materiaal `colormap` dat via een externe
 * URI naar Textures/colormap.png wijst: precies de vorm die de Kenney-bestanden
 * ook hebben.
 */
function schrijfGlb(naam) {
  const posities = [];
  const normalen = [];
  const uvs = [];
  const indices = [];
  /* Alleen de hoekpunten die een driehoek ook echt gebruikt. De filters op
   * `zet` gooien driehoeken weg maar laten de hoekpuntenlijst heel; zonder deze
   * stap schrijven we de weggelaten poten en palmbladeren van structure-roof
   * alsnog mee. */
  for (const deel of delen) {
    const hernummerd = new Map();
    for (const oud of deel.indices) {
      let nieuw = hernummerd.get(oud);
      if (nieuw === undefined) {
        nieuw = posities.length / 3;
        hernummerd.set(oud, nieuw);
        posities.push(deel.posities[oud * 3], deel.posities[oud * 3 + 1], deel.posities[oud * 3 + 2]);
        normalen.push(deel.normalen[oud * 3], deel.normalen[oud * 3 + 1], deel.normalen[oud * 3 + 2]);
        uvs.push(deel.uvs[oud * 2], deel.uvs[oud * 2 + 1]);
      }
      indices.push(nieuw);
    }
  }

  const aantal = posities.length / 3;
  const groteIndices = aantal > 65535;
  const posBuf = Buffer.alloc(aantal * 12);
  const norBuf = Buffer.alloc(aantal * 12);
  const uvBuf = Buffer.alloc(aantal * 8);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < aantal; i++) {
    for (let c = 0; c < 3; c++) {
      const waarde = Math.fround(posities[i * 3 + c]);
      posBuf.writeFloatLE(waarde, i * 12 + c * 4);
      norBuf.writeFloatLE(Math.fround(normalen[i * 3 + c]), i * 12 + c * 4);
      min[c] = Math.min(min[c], waarde);
      max[c] = Math.max(max[c], waarde);
    }
    uvBuf.writeFloatLE(Math.fround(uvs[i * 2]), i * 8);
    uvBuf.writeFloatLE(Math.fround(uvs[i * 2 + 1]), i * 8 + 4);
  }

  const idxBuf = Buffer.alloc(indices.length * (groteIndices ? 4 : 2));
  indices.forEach((waarde, i) =>
    groteIndices ? idxBuf.writeUInt32LE(waarde, i * 4) : idxBuf.writeUInt16LE(waarde, i * 2));

  const blokken = [posBuf, norBuf, uvBuf, idxBuf];
  const views = [];
  let lengte = 0;
  for (const blok of blokken) {
    views.push({ buffer: 0, byteOffset: lengte, byteLength: blok.length });
    lengte += blok.length + ((4 - (blok.length % 4)) % 4);
  }
  const bin = Buffer.alloc(lengte);
  blokken.forEach((blok, i) => blok.copy(bin, views[i].byteOffset));

  const gltf = {
    asset: {
      generator: 'taaleiland/bouw-molen.mjs',
      version: '2.0',
      extras: { taaleiland: { versie: 1, bron: 'kitonderdelen', palet: 1 } },
    },
    scene: 0,
    scenes: [{ nodes: [0], name: naam }],
    nodes: [{ mesh: 0, name: naam }],
    meshes: [{
      name: naam,
      primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }],
    }],
    materials: [{
      name: 'colormap',
      doubleSided: true,
      pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0 },
    }],
    textures: [{ sampler: 0, source: 0, name: 'colormap' }],
    images: [{ uri: 'Textures/colormap.png', name: 'colormap' }],
    samplers: [{ magFilter: 9728, minFilter: 9728 }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: aantal, type: 'VEC3', min, max },
      { bufferView: 1, componentType: 5126, count: aantal, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: aantal, type: 'VEC2' },
      { bufferView: 3, componentType: groteIndices ? 5125 : 5123, count: indices.length, type: 'SCALAR' },
    ],
    bufferViews: views.map((view, i) => ({ ...view, target: i === 3 ? 34963 : 34962 })),
    buffers: [{ byteLength: bin.length }],
  };

  const jsonBuf = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPad = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)]);
  const kop = Buffer.alloc(12);
  kop.writeUInt32LE(0x46546c67, 0);
  kop.writeUInt32LE(2, 4);
  kop.writeUInt32LE(12 + 8 + jsonPad.length + 8 + bin.length, 8);
  const jsonKop = Buffer.alloc(8);
  jsonKop.writeUInt32LE(jsonPad.length, 0);
  jsonKop.writeUInt32LE(0x4e4f534a, 4);
  const binKop = Buffer.alloc(8);
  binKop.writeUInt32LE(bin.length, 0);
  binKop.writeUInt32LE(0x004e4942, 4);

  writeFileSync(join(KITS, 'taalei-kit', `${naam}.glb`),
    Buffer.concat([kop, jsonKop, jsonPad, binKop, bin]));

  return {
    naam,
    maat: [max[0] - min[0], max[2] - min[2], max[1] - min[1]],
    driehoeken: indices.length / 3,
    hoekpunten: aantal,
  };
}

for (const naam of Object.keys(KAPPEN)) {
  const uit = bouwMolen(naam);
  console.log(
    `kits/taalei-kit/${uit.naam}.glb — ${uit.maat.map((v) => v.toFixed(3)).join(' × ')} (b × d × h)`,
  );
  console.log(`  ${uit.driehoeken} driehoeken, ${uit.hoekpunten} hoekpunten, 1 tekenopdracht`);
}
