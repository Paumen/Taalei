/**
 * Modellen uit een geïmporteerde pack op de gedeelde colormap zetten.
 *
 * Gedeeld door de importeerscripts die nog in de repo staan:
 * tools/importeer-props.mjs, -rocks.mjs, -modulair-terrein.mjs en -village.mjs.
 *
 * Waarom dit nodig is: een pack komt met zijn eigen atlas. De stijlgids (§1)
 * wil dat kleuren uit kits/colormap.png komen, zodat een geïmporteerd model
 * uitwisselbaar is met de rest en het kleurfilter in de catalogus één
 * betekenis houdt. De grot en de onderwater-kit zijn daarvan uitgezonderd —
 * die konden niet worden omgezet — maar een pack met platte kleurvlakken kan
 * dat wél.
 *
 * Hoe: niet per model of per materiaal, maar per vertex. Van elke UV wordt de
 * kleur in de bron-atlas opgezocht; daarna krijgt die vertex de UV van de
 * dichtstbijzijnde kleur in kits/colormap.png. Platte vlakken komen zo allemaal
 * op hetzelfde punt uit, en een verloop — de palmbladeren lopen van licht naar
 * donker over een kleurbaan — landt vanzelf op de overeenkomstige plek in de
 * doelbaan. Er is dus geen aparte behandeling voor verlopen nodig.
 */

import { copyFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { leesPng } from './png.mjs';

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
 * Afstand tussen twee kleuren volgens de "redmean"-benadering: goedkoper dan
 * een Lab-conversie en dicht genoeg bij wat het oog doet om de juiste baan te
 * kiezen.
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

/**
 * Waar een kleur in een atlas staat: de kolom en rij van de baan, en de
 * pixelrij binnen die baan. tools/hermap-kleur.mjs gebruikt dat als ankerpunt
 * voor het schaduwverloop.
 *
 * Een baan is verticaal een verloop, dus niet elke tint staat er letterlijk in.
 * Vandaar dichtstbij en niet gelijk, met een grens eromheen: ligt de kleur ver
 * van élke pixel, dan staat hij niet in deze sheet en is doorgaan gevaarlijker
 * dan stoppen.
 */
const VER = 40;

export function zoekBaan(atlas, hex, wat = 'de atlas') {
  const celBreed = atlas.breedte / KOLOMMEN;
  const celHoog = atlas.hoogte / RIJEN;
  const doel = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  let beste = null;
  let afstand = Infinity;

  for (let kolom = 0; kolom < KOLOMMEN; kolom++) {
    const x = Math.floor(kolom * celBreed + celBreed / 2);
    for (let rij = 0; rij < RIJEN; rij++) {
      for (let i = 0; i < celHoog; i++) {
        const kleur = pixel(atlas, x, Math.floor(rij * celHoog) + i);
        if (isLeeg(...kleur)) continue;
        const d = kleurAfstand(kleur, doel);
        if (d < afstand) {
          afstand = d;
          beste = { kolom, rij, inBaan: i, kleur: naarHex(...kleur) };
        }
      }
    }
  }

  if (!beste || afstand > VER) throw new Error(`${hex} staat niet in ${wat}`);
  return beste;
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

  /* De grot houdt zijn eigen sheet — daar hangen de modellen aan die buiten de
   * catalogus staan maar wel in de repo — maar de vier die op het gedeelde
   * palet zijn gezet wijzen naar een kopie ernaast. Die moet met de bron mee
   * blijven lopen, anders gaan ze na een nieuwe kleur in de atlas de verkeerde
   * kant op wijzen. */
  const NAAST = { 'modular-cave-kit': 'colormap-gedeeld.png' };

  for (const slug of readdirSync(kitsMap).sort()) {
    if (NAAST[slug]) {
      try {
        copyFileSync(bron, join(kitsMap, slug, 'Textures', NAAST[slug]));
        gekopieerd.push(`${slug} (${NAAST[slug]})`);
      } catch (fout) {
        if (fout.code !== 'ENOENT') throw fout;
      }
    }
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
 * Per vertex wordt de bronkleur opgezocht en de dichtstbijzijnde kleur in de
 * doel-atlas teruggegeven. Daarna volgt nog een correctie: zie `snap` hieronder.
 *
 * @param {{json: object, bin: Buffer}} glb  wordt ter plekke aangepast
 * @param {object} bronAtlas   de atlas waar de pack zelf naar wijst
 * @param {Array} punten       uit doelPunten(doelAtlas)
 * @param {number[]} meshIndexen  welke meshes meedoen
 * @returns {{omgezet: Map, ergsteAfstand: number, gesnapt: number}}
 */
export function hermapUv(glb, bronAtlas, punten, meshIndexen) {
  const { json, bin } = glb;
  const omgezet = new Map();
  let ergsteAfstand = 0;
  let gesnapt = 0;

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

      /* Ronde 1 — elke vertex naar zijn eigen dichtstbijzijnde kleur. */
      const bronKleuren = [];
      const keuze = [];
      for (let i = 0; i < uv.acc.count; i++) {
        const positie = uv.start + i * uv.stap;
        const u = bin.readFloatLE(positie);
        const v = bin.readFloatLE(positie + 4);
        // De UV kan net buiten [0,1] vallen op de rand van een vlak; klemmen
        // levert dezelfde kleur op als de sampler in de viewer laat zien.
        const x = Math.min(bronAtlas.breedte - 1, Math.max(0, Math.floor(u * bronAtlas.breedte)));
        const y = Math.min(bronAtlas.hoogte - 1, Math.max(0, Math.floor(v * bronAtlas.hoogte)));
        const kleur = pixel(bronAtlas, x, y);
        bronKleuren.push(kleur);

        const gekozen = dichtstbij(kleur, punten);
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

export { leesPng };
