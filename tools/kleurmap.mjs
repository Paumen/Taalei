/**
 * Modellen uit een geïmporteerde pack op de gedeelde colormap zetten.
 *
 * Gedeeld door tools/importeer-nature.mjs en tools/importeer-tropical.mjs.
 *
 * Waarom dit nodig is: een pack komt met zijn eigen atlas. De stijlgids (§1)
 * wil dat kleuren uit kits/colormap.png komen, zodat een geïmporteerd model
 * uitwisselbaar is met de rest en het kleurfilter in de catalogus één
 * betekenis houdt. De grot en de onderwater-kit zijn daarvan uitgezonderd —
 * die konden niet worden omgezet — maar een pack met platte kleurvlakken kan
 * dat wél.
 *
 * Hoe: baan voor baan, en binnen een baan per vertex. Een bron-atlas bestaat
 * net als de gedeelde colormap uit kleurbanen: horizontaal één kleur, verticaal
 * van licht naar donker. Elke baan van de bron krijgt eerst één cel in de
 * doel-atlas toegewezen (`baanTabel`); daarna zoekt elke vertex binnen die ene
 * cel het punt op dat het dichtst bij zijn eigen tint ligt. Een verloop — de
 * palmbladeren lopen van licht naar donker over een baan — landt zo vanzelf op
 * de overeenkomstige plek in de doelbaan, en twee vertices uit dezelfde baan
 * kunnen niet meer in verschillende cellen belanden.
 *
 * Dat laatste is niet vanzelfsprekend. Een eerdere versie zocht per vertex de
 * dichtstbijzijnde kleur in de hele doel-atlas. Bron-banen zijn langer dan de
 * cellen hier — KayKit loopt van bijna wit tot bijna zwart — dus viel zo'n baan
 * onderweg uiteen: van de zeventien banen die de resource-pack gebruikt kwamen
 * er dertien in twee tot vijf verschillende cellen terecht. Op een plat vlak dat
 * uit twee driehoeken bestaat, kon de ene driehoek dan in de ene cel landen en
 * de andere in een cel aan de overkant van de sheet — de wig in een andere
 * kleur die in de catalogus op kaarsen, flessen en staven te zien was. Zie
 * `toetsNaden` voor de controle die daarop let.
 */

import { copyFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { leesPng } from './png.mjs';
import { leesAccessor } from './glb.mjs';

/**
 * De gedeelde colormap is een raster van 16 × 4 cellen. Elke cel is een
 * verticale kleurbaan: horizontaal is hij één kleur, verticaal loopt hij van
 * licht (boven) naar donker (onder). Een model wijst met zijn UV's een punt op
 * zo'n baan aan; Kenney's eigen modellen lopen soms door meer dan één cel heen
 * (de boom van mini-forest pakt de stam uit de ene cel en het blad uit de cel
 * eronder), dus een cel is geen grens waar een model binnen moet blijven.
 */
export const KOLOMMEN = 16;
export const RIJEN = 4;

/** Zwart is geen kleur maar lege ruimte in de atlas; daar mag niets op landen. */
const isLeeg = (r, g, b) => r === 0 && g === 0 && b === 0;

export const naarHex = (r, g, b) =>
  '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

/**
 * Afstand tussen twee kleuren volgens de "redmean"-benadering — dezelfde formule
 * als tools/build-catalog.mjs gebruikt om zeldzame stalen samen te voegen, zodat
 * "dicht bij elkaar" hier hetzelfde betekent als daar.
 */
export function kleurAfstand(a, b) {
  const rGemiddeld = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(
    (2 + rGemiddeld / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rGemiddeld) / 256) * db * db,
  );
}

const pixel = (atlas, x, y) => {
  const i = (y * atlas.breedte + x) * 4;
  return [atlas.pixels[i], atlas.pixels[i + 1], atlas.pixels[i + 2]];
};

/**
 * Alle punten waar een model op mag landen: per gevulde cel elke rij pixels,
 * met de UV die er middenin wijst. De horizontale positie is het midden van de
 * cel — de baan is horizontaal toch één kleur, en het midden houdt de UV zo ver
 * mogelijk van de randen waar de textuurfiltering kleuren zou mengen.
 *
 * @returns {Array<{kleur: number[], u: number, v: number, cel: number[]}>}
 */
export function doelPunten(atlas) {
  const celBreed = atlas.breedte / KOLOMMEN;
  const celHoog = atlas.hoogte / RIJEN;
  const punten = [];

  for (let rij = 0; rij < RIJEN; rij++) {
    for (let kolom = 0; kolom < KOLOMMEN; kolom++) {
      const x = Math.floor(kolom * celBreed + celBreed / 2);
      for (let i = 0; i < celHoog; i++) {
        const y = Math.floor(rij * celHoog) + i;
        const kleur = pixel(atlas, x, y);
        if (isLeeg(...kleur)) continue;
        punten.push({
          kleur,
          u: (x + 0.5) / atlas.breedte,
          v: (y + 0.5) / atlas.hoogte,
          cel: [kolom, rij],
        });
      }
    }
  }

  if (punten.length === 0) throw new Error('de doel-atlas is leeg');
  return punten;
}

/** De cellen die daadwerkelijk kleur bevatten, als "kolom,rij"-sleutels. */
export function gevuldeCellen(atlas) {
  return [...new Set(doelPunten(atlas).map((p) => p.cel.join(',')))]
    .map((s) => s.split(',').map(Number));
}

/**
 * Voegt een verticale kleurbaan toe aan een lege cel: lineair van `boven` naar
 * `onder`, net als de banen die er al staan. Past `atlas` ter plekke aan.
 */
export function voegGradientCelToe(atlas, [kolom, rij], boven, onder) {
  const celBreed = atlas.breedte / KOLOMMEN;
  const celHoog = atlas.hoogte / RIJEN;
  const x0 = Math.round(kolom * celBreed);
  const y0 = Math.round(rij * celHoog);

  for (let i = 0; i < celHoog; i++) {
    // Van middelpunt tot middelpunt, zodat de boven- en onderkleur precies op
    // de eerste en laatste pixelrij liggen en niet half buiten de cel vallen.
    const t = celHoog === 1 ? 0 : i / (celHoog - 1);
    const kleur = [0, 1, 2].map((k) => Math.round(boven[k] + (onder[k] - boven[k]) * t));
    for (let j = 0; j < celBreed; j++) {
      const p = ((y0 + i) * atlas.breedte + x0 + j) * 4;
      atlas.pixels[p] = kleur[0];
      atlas.pixels[p + 1] = kleur[1];
      atlas.pixels[p + 2] = kleur[2];
      atlas.pixels[p + 3] = 255;
    }
  }
}

/**
 * Elke kit draagt zijn eigen kopie van de atlas in Textures/colormap.png, omdat
 * de .glb's daar met een relatief pad naar wijzen. De zes Kenney-kits, de
 * taalei-kit en elke geïmporteerde pack delen dezelfde sheet, dus die kopieën
 * moeten byte voor byte gelijk blijven aan kits/colormap.png. De grot en de
 * onderwater-kit staan buiten het gedeelde palet en blijven ongemoeid.
 */
export function kopieerColormap(kitsMap, overslaan = ['modular-cave-kit', 'onderwater-kit']) {
  const bron = join(kitsMap, 'colormap.png');
  const gekopieerd = [];

  for (const slug of readdirSync(kitsMap).sort()) {
    if (overslaan.includes(slug)) continue;
    if (!statSync(join(kitsMap, slug)).isDirectory()) continue;
    const doel = join(kitsMap, slug, 'Textures', 'colormap.png');
    try {
      copyFileSync(bron, doel);
      gekopieerd.push(slug);
    } catch (fout) {
      if (fout.code !== 'ENOENT') throw fout;
      // Een kit zonder Textures-map heeft geen eigen kopie nodig.
    }
  }
  return gekopieerd;
}

/* -- de banen van de bron-atlas ------------------------------------------- */

/**
 * Deelt een bron-atlas op in kleurbanen.
 *
 * Een baan is gebouwd zoals de packs hem tekenen: horizontaal precies één
 * kleur, verticaal een verloop in stapjes van een paar eenheden. Twee pixels
 * horen dus bij dezelfde baan als ze naast elkaar liggen én exact dezelfde
 * kleur hebben, of als ze boven elkaar liggen én nauwelijks verschillen.
 *
 * Die twee regels apart houden is het hele punt. Alleen naar kleurafstand
 * kijken plakt in de resource-atlas drie verschillende grijzen aan elkaar —
 * zwart, donkergrijs en leigrijs staan naast elkaar en lopen in elkaar over —
 * en dan zou al het metaal van de pack in één cel eindigen. Met de eis dat
 * buren horizontaal exact gelijk zijn blijven die drie banen uit elkaar, en
 * komt elke cel van de KayKit-sheet als één baan terug.
 *
 * @returns {{label: Int32Array, aantal: number}} per pixel het baannummer
 */
export function bronBanen(atlas, drempel = 6) {
  const { breedte: W, hoogte: H, pixels } = atlas;

  // Union-find: elke pixel begint als eigen baan, buren worden samengevoegd.
  const ouder = new Int32Array(W * H);
  for (let i = 0; i < W * H; i++) ouder[i] = i;
  const zoek = (a) => {
    while (ouder[a] !== a) {
      ouder[a] = ouder[ouder[a]];
      a = ouder[a];
    }
    return a;
  };
  const bind = (a, b) => {
    a = zoek(a);
    b = zoek(b);
    if (a !== b) ouder[Math.max(a, b)] = Math.min(a, b);
  };

  const kleur = (i) => [pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]];
  const gelijk = (a, b) =>
    pixels[a * 4] === pixels[b * 4] &&
    pixels[a * 4 + 1] === pixels[b * 4 + 1] &&
    pixels[a * 4 + 2] === pixels[b * 4 + 2];

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (x + 1 < W && gelijk(p, p + 1)) bind(p, p + 1);
      if (y + 1 < H && kleurAfstand(kleur(p), kleur(p + W)) <= drempel) bind(p, p + W);
    }
  }

  const label = new Int32Array(W * H);
  const nummer = new Map();
  for (let i = 0; i < W * H; i++) {
    const wortel = zoek(i);
    if (!nummer.has(wortel)) nummer.set(wortel, nummer.size);
    label[i] = nummer.get(wortel);
  }
  return { label, aantal: nummer.size };
}

/** Eén keer per atlas opdelen; de importeurs roepen dit per model aan. */
const banenCache = new WeakMap();
function banenVan(atlas) {
  if (!banenCache.has(atlas)) banenCache.set(atlas, bronBanen(atlas));
  return banenCache.get(atlas);
}

/** De baan waarin een UV valt, met de kleur die daar staat. */
function baanBij(atlas, banen, u, v) {
  // De UV kan net buiten [0,1] vallen op de rand van een vlak; klemmen levert
  // dezelfde kleur op als de sampler in de viewer laat zien.
  const x = Math.min(atlas.breedte - 1, Math.max(0, Math.floor(u * atlas.breedte)));
  const y = Math.min(atlas.hoogte - 1, Math.max(0, Math.floor(v * atlas.hoogte)));
  const i = y * atlas.breedte + x;
  return {
    baan: banen.label[i],
    kleur: [atlas.pixels[i * 4], atlas.pixels[i * 4 + 1], atlas.pixels[i * 4 + 2]],
  };
}

/**
 * Kiest per bron-baan één cel in de doel-atlas.
 *
 * Een baan wordt vergeleken met elke gevulde cel: voor elke tint uit de baan de
 * afstand tot de dichtstbijzijnde kleur in die cel, gemiddeld over de tinten.
 * De cel met het laagste gemiddelde wint.
 *
 * `modellen` is de hele pack — alle glb's die straks hermapt worden. Daarmee
 * telt niet elke tint even zwaar, maar naar rato van hoe vaak de pack hem
 * gebruikt. Dat scheelt waar de gedeelde colormap geen goede tegenhanger heeft:
 * de goudbaan van de resource-pack loopt van lichtgeel tot bijna zwart, en
 * ongewogen wint een oranje cel die vooral bij het donkere staartje past dat
 * geen enkel model aanraakt. Zonder `modellen` telt elke tint even zwaar; dat
 * blijft een geldige keuze, alleen een botsere.
 *
 * @returns {{cel: (baan: number) => string, banen: {label: Int32Array}}}
 */
export function baanTabel(bronAtlas, punten, modellen = []) {
  const banen = banenVan(bronAtlas);

  const perCel = new Map();
  for (const punt of punten) {
    const sleutel = punt.cel.join(',');
    if (!perCel.has(sleutel)) perCel.set(sleutel, []);
    perCel.get(sleutel).push(punt);
  }
  // Vaste volgorde, zodat een gelijkspel altijd dezelfde kant op valt.
  const cellen = [...perCel.keys()].sort();

  /* Hoe vaak de pack elke tint van elke baan gebruikt. */
  const gebruik = new Map();
  for (const glb of modellen) {
    for (const mesh of glb.json.meshes ?? []) {
      for (const prim of mesh.primitives) {
        if (prim.attributes.TEXCOORD_0 === undefined) continue;
        const uv = leesAccessor(glb, prim.attributes.TEXCOORD_0);
        for (let i = 0; i < uv.count; i++) {
          const { baan, kleur } = baanBij(bronAtlas, banen, uv.data[i * 2], uv.data[i * 2 + 1]);
          if (!gebruik.has(baan)) gebruik.set(baan, new Map());
          const tinten = gebruik.get(baan);
          const sleutel = naarHex(...kleur);
          tinten.set(sleutel, (tinten.get(sleutel) ?? 0) + 1);
        }
      }
    }
  }

  /* Alle tinten per baan, voor banen die geen model gebruikt. Pas opbouwen als
   * zo'n baan zich aandient — meestal blijft het bij de banen hierboven. */
  let alleTinten = null;
  const tintenVan = (baan) => {
    if (gebruik.has(baan)) return gebruik.get(baan);
    if (!alleTinten) {
      alleTinten = new Map();
      for (let i = 0; i < banen.label.length; i++) {
        const b = banen.label[i];
        if (!alleTinten.has(b)) alleTinten.set(b, new Map());
        alleTinten.get(b).set(
          naarHex(bronAtlas.pixels[i * 4], bronAtlas.pixels[i * 4 + 1], bronAtlas.pixels[i * 4 + 2]),
          1,
        );
      }
    }
    return alleTinten.get(baan) ?? new Map();
  };

  const gekozen = new Map();
  return {
    banen,
    cel(baan) {
      if (gekozen.has(baan)) return gekozen.get(baan);

      const tinten = [...tintenVan(baan)];
      let beste = cellen[0];
      let besteScore = Infinity;
      for (const sleutel of cellen) {
        let som = 0;
        let gewicht = 0;
        for (const [hex, aantal] of tinten) {
          const kleur = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
          som += dichtstbij(kleur, perCel.get(sleutel)).afstand * aantal;
          gewicht += aantal;
        }
        const score = gewicht === 0 ? Infinity : som / gewicht;
        if (score < besteScore) {
          besteScore = score;
          beste = sleutel;
        }
      }
      gekozen.set(baan, beste);
      return beste;
    },
    punten: (sleutel) => perCel.get(sleutel),
  };
}

/* -- de omzetting zelf ---------------------------------------------------- */

const CT = { 5126: 4, 5123: 2, 5125: 4, 5122: 2, 5121: 1 };

/** Waar een accessor begint en hoe groot zijn stappen zijn. */
function ligging(json, index, standaard) {
  const acc = json.accessors[index];
  const bv = json.bufferViews[acc.bufferView];
  return {
    acc,
    start: (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0),
    stap: bv.byteStride ?? standaard,
  };
}

/** De dichtstbijzijnde van een reeks doelpunten bij een bronkleur. */
function dichtstbij(kleur, punten) {
  let beste = punten[0];
  let besteAfstand = Infinity;
  for (const punt of punten) {
    const afstand = kleurAfstand(kleur, punt.kleur);
    if (afstand < besteAfstand) {
      besteAfstand = afstand;
      beste = punt;
    }
  }
  return { punt: beste, afstand: besteAfstand };
}

/**
 * Zet de UV's van een model over van de bron-atlas naar de doel-atlas.
 *
 * Elke vertex gaat naar de cel die zijn bron-baan is toegewezen, en daarbinnen
 * naar het punt dat het dichtst bij zijn eigen tint ligt. Daarna volgt nog een
 * correctie: zie `snap` hieronder.
 *
 * @param {{json: object, bin: Buffer}} glb  wordt ter plekke aangepast
 * @param {object} bronAtlas   de atlas waar de pack zelf naar wijst
 * @param {Array} punten       uit doelPunten(doelAtlas)
 * @param {number[]} meshIndexen  welke meshes meedoen
 * @param {object} [tabel]     uit baanTabel(); zonder de pack erbij als er geen
 *                             wordt meegegeven
 * @returns {{omgezet: Map, ergsteAfstand: number, gesnapt: number}}
 */
export function hermapUv(glb, bronAtlas, punten, meshIndexen, tabel = baanTabel(bronAtlas, punten)) {
  const { json, bin } = glb;
  const omgezet = new Map();
  let ergsteAfstand = 0;
  let gesnapt = 0;
  const banen = tabel.banen;

  // Doelpunten per cel, om een vertex binnen één cel te kunnen verplaatsen.
  const perCel = new Map();
  for (const punt of punten) {
    const sleutel = punt.cel.join(',');
    if (!perCel.has(sleutel)) perCel.set(sleutel, []);
    perCel.get(sleutel).push(punt);
  }

  for (const mi of meshIndexen) {
    for (const prim of json.meshes[mi].primitives) {
      if (prim.attributes.TEXCOORD_0 === undefined) continue;
      const uv = ligging(json, prim.attributes.TEXCOORD_0, 8);
      if (uv.acc.componentType !== 5126) {
        throw new Error(`TEXCOORD_0 is geen float32 (componentType ${uv.acc.componentType})`);
      }

      /* Ronde 1 — elke vertex naar de cel van zijn baan, en daarbinnen naar de
       * tint die het dichtst bij zijn eigen kleur ligt. */
      const bronKleuren = [];
      const keuze = [];
      for (let i = 0; i < uv.acc.count; i++) {
        const positie = uv.start + i * uv.stap;
        const u = bin.readFloatLE(positie);
        const v = bin.readFloatLE(positie + 4);
        const { baan, kleur } = baanBij(bronAtlas, banen, u, v);
        bronKleuren.push(kleur);

        const gekozen = dichtstbij(kleur, perCel.get(tabel.cel(baan)));
        keuze.push(gekozen.punt);

        const sleutel = naarHex(...kleur);
        if (!omgezet.has(sleutel)) {
          omgezet.set(sleutel, {
            naar: naarHex(...gekozen.punt.kleur),
            afstand: gekozen.afstand,
            cel: gekozen.punt.cel,
            aantal: 0,
          });
          ergsteAfstand = Math.max(ergsteAfstand, gekozen.afstand);
        }
        omgezet.get(sleutel).aantal++;
      }

      /* Ronde 2 — driehoeken die over meer dan één cel komen te liggen.
       *
       * In de bron liggen twee kleuren van hetzelfde vlak vaak vlak naast
       * elkaar; op de gedeelde colormap hoeven ze dat niet te doen. Een driehoek
       * waarvan de hoekpunten dan in verschillende cellen landen, veegt bij het
       * interpoleren dwars over de atlas en pikt onderweg lege cellen mee — bij
       * de palm gebeurde dat op de stam, waar een paar donkere bruinen op het
       * grijs uitkwamen en hun buren op het bruin.
       *
       * De hoekpunten in de minderheid gaan daarom mee naar de cel van de
       * meerderheid, op de plek in die baan die het dichtst bij hun eigen
       * bronkleur ligt. De schakering blijft zo staan, maar de driehoek blijft
       * binnen één kleurbaan. Herhaald tot het stil ligt, omdat hoekpunten
       * tussen driehoeken gedeeld worden. */
      if (prim.indices !== undefined) {
        const idx = ligging(json, prim.indices, CT[json.accessors[prim.indices].componentType]);
        const maat = CT[idx.acc.componentType];
        const lees = maat === 2 ? 'readUInt16LE' : maat === 4 ? 'readUInt32LE' : 'readUInt8';
        const hoek = (t, k) => bin[lees](idx.start + (t + k) * idx.stap);

        for (let ronde = 0; ronde < 4; ronde++) {
          let veranderd = 0;
          for (let t = 0; t + 2 < idx.acc.count; t += 3) {
            const punten3 = [0, 1, 2].map((k) => hoek(t, k));
            const cellen = punten3.map((i) => keuze[i].cel.join(','));
            if (cellen[0] === cellen[1] && cellen[1] === cellen[2]) continue;

            // De cel van de meerderheid; bij drie verschillende cellen die van
            // het hoekpunt dat het dichtst bij zijn eigen kleur zat.
            const telling = new Map();
            for (const cel of cellen) telling.set(cel, (telling.get(cel) ?? 0) + 1);
            let doel = cellen[0];
            let meeste = 0;
            for (const [cel, aantal] of telling) {
              if (aantal > meeste) {
                meeste = aantal;
                doel = cel;
              }
            }
            if (meeste === 1) {
              doel = cellen[
                punten3
                  .map((i, k) => [kleurAfstand(bronKleuren[i], keuze[i].kleur), k])
                  .sort((a, b) => a[0] - b[0])[0][1]
              ];
            }

            punten3.forEach((i, k) => {
              if (cellen[k] === doel) return;
              keuze[i] = dichtstbij(bronKleuren[i], perCel.get(doel)).punt;
              veranderd++;
              gesnapt++;
            });
          }
          if (veranderd === 0) break;
        }
      }

      /* Ronde 3 — wegschrijven. */
      for (let i = 0; i < uv.acc.count; i++) {
        const positie = uv.start + i * uv.stap;
        bin.writeFloatLE(keuze[i].u, positie);
        bin.writeFloatLE(keuze[i].v, positie + 4);
      }
    }
  }

  return { omgezet, ergsteAfstand, gesnapt };
}

/**
 * Controle achteraf: een driehoek waarvan de hoekpunten in ver uiteenliggende
 * cellen landen, veegt bij het interpoleren dwars over de atlas en pikt onderweg
 * lege ruimte mee. In de bron kan dat niet gebeuren zolang de kleuren daar naast
 * elkaar liggen, maar in de doel-atlas hoeven ze dat niet te doen.
 *
 * @returns {number} het aantal driehoeken dat verder dan één cel uit elkaar valt
 */
export function toetsDriehoeken(glb, meshIndexen, atlas) {
  const { json, bin } = glb;
  const celBreed = 1 / KOLOMMEN;
  const celHoog = 1 / RIJEN;
  let verdacht = 0;

  for (const mi of meshIndexen) {
    for (const prim of json.meshes[mi].primitives) {
      const uvAcc = json.accessors[prim.attributes.TEXCOORD_0];
      const idxAcc = json.accessors[prim.indices];
      if (!uvAcc || !idxAcc) continue;

      const uvBv = json.bufferViews[uvAcc.bufferView];
      const uvStart = (uvBv.byteOffset ?? 0) + (uvAcc.byteOffset ?? 0);
      const uvStap = uvBv.byteStride ?? 8;
      const idxBv = json.bufferViews[idxAcc.bufferView];
      const idxStart = (idxBv.byteOffset ?? 0) + (idxAcc.byteOffset ?? 0);
      const idxMaat = CT[idxAcc.componentType];
      const lees = idxMaat === 2 ? 'readUInt16LE' : idxMaat === 4 ? 'readUInt32LE' : 'readUInt8';

      for (let t = 0; t + 2 < idxAcc.count; t += 3) {
        const uv = [0, 1, 2].map((k) => {
          const i = bin[lees](idxStart + (t + k) * idxMaat);
          return [bin.readFloatLE(uvStart + i * uvStap), bin.readFloatLE(uvStart + i * uvStap + 4)];
        });
        const du = Math.max(...uv.map((p) => p[0])) - Math.min(...uv.map((p) => p[0]));
        const dv = Math.max(...uv.map((p) => p[1])) - Math.min(...uv.map((p) => p[1]));
        if (du > celBreed || dv > celHoog) verdacht++;
      }
    }
  }
  return verdacht;
}

/**
 * Controle achteraf, de andere kant op: `toetsDriehoeken` kijkt binnen één
 * driehoek, deze kijkt ertussen.
 *
 * Twee driehoeken die een ribbe delen en in hetzelfde vlak liggen, vormen samen
 * één plat vlak. Landen ze in verschillende cellen, dan loopt er een harde
 * kleurgrens dwars over dat vlak — de wig die deze module met `baanTabel` hoort
 * te voorkomen. Een echte kleurgrens valt in deze packs altijd samen met een
 * knik in de geometrie, dus vlakken die écht twee kleuren dragen tellen niet mee.
 *
 * @returns {number} het aantal naden tussen aangrenzende driehoeken in één vlak
 */
export function toetsNaden(glb, meshIndexen, atlas) {
  const { json } = glb;
  let naden = 0;

  for (const mi of meshIndexen) {
    for (const prim of json.meshes[mi].primitives) {
      if (prim.attributes.TEXCOORD_0 === undefined || prim.indices === undefined) continue;
      const pos = leesAccessor(glb, prim.attributes.POSITION).data;
      const uv = leesAccessor(glb, prim.attributes.TEXCOORD_0).data;
      const idx = leesAccessor(glb, prim.indices).data;

      const driehoeken = [];
      for (let t = 0; t + 2 < idx.length; t += 3) {
        const hoek = [0, 1, 2].map((k) => idx[t + k]);
        const p = hoek.map((i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]);
        const e1 = [0, 1, 2].map((k) => p[1][k] - p[0][k]);
        const e2 = [0, 1, 2].map((k) => p[2][k] - p[0][k]);
        const n = [
          e1[1] * e2[2] - e1[2] * e2[1],
          e1[2] * e2[0] - e1[0] * e2[2],
          e1[0] * e2[1] - e1[1] * e2[0],
        ];
        const lengte = Math.hypot(...n);
        if (lengte === 0) continue; // ontaarde driehoek, geen vlak
        driehoeken.push({
          p,
          normaal: n.map((v) => v / lengte),
          cellen: hoek.map((i) => `${Math.floor(uv[i * 2] * KOLOMMEN)},${Math.floor(uv[i * 2 + 1] * RIJEN)}`),
          kleur: pixelBijUv(atlas, uv[hoek[0] * 2], uv[hoek[0] * 2 + 1]),
        });
      }

      // Ribben op hun twee eindpunten, zodat buren elkaar vinden. De modellen
      // zijn ontvlochten, dus buren delen geen hoekpunt maar wel een plaats.
      //
      // Die plaats vergelijken we op de punt af, niet met een marge. Buren zijn
      // hier kopieën van hetzelfde bronhoekpunt en ondergaan daarna dezelfde
      // bewerkingen, dus hun coördinaten zijn bit voor bit gelijk. Afronden
      // vindt geen buur méér — het plakt juist hoekpunten aan elkaar die dicht
      // bij elkaar liggen maar niet dezelfde zijn, en dan telt zo'n ribbe drie
      // of vier driehoeken en valt hij uit de controle. Over vijf kits scheelt
      // dat 192 buurparen op 272.884.
      const ribben = new Map();
      driehoeken.forEach((d, index) => {
        for (let k = 0; k < 3; k++) {
          const sleutel = [d.p[k], d.p[(k + 1) % 3]]
            .map((q) => q.join(','))
            .sort()
            .join('|');
          if (!ribben.has(sleutel)) ribben.set(sleutel, []);
          ribben.get(sleutel).push(index);
        }
      });

      for (const buren of ribben.values()) {
        if (buren.length !== 2) continue;
        const [a, b] = buren.map((i) => driehoeken[i]);
        const vlak = a.normaal.reduce((som, v, k) => som + v * b.normaal[k], 0);
        if (vlak < 0.999) continue; // een knik: hier mág een kleurgrens lopen
        if (new Set(a.cellen).size !== 1 || new Set(b.cellen).size !== 1) continue;
        if (a.cellen[0] === b.cellen[0]) continue;
        if (kleurAfstand(a.kleur, b.kleur) > 60) naden++;
      }
    }
  }
  return naden;
}

/** De kleur die een UV in een atlas aanwijst. */
function pixelBijUv(atlas, u, v) {
  const x = Math.min(atlas.breedte - 1, Math.max(0, Math.floor(u * atlas.breedte)));
  const y = Math.min(atlas.hoogte - 1, Math.max(0, Math.floor(v * atlas.hoogte)));
  return pixel(atlas, x, y);
}

export { leesPng };
