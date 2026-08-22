/**
 * Toetst orca.glb en orca-calf.glb aan de mechanisch controleerbare regels uit
 * docs/asset_style_guide.md. Draaien vanuit de repo-root:
 *
 *   node tools/toets-orka.mjs
 *
 * Anders dan tools/toets-ballon.mjs kijkt dit script niet naar uv's: de
 * onderwater-kit heeft geen colormap maar eigen materiaalkleuren (§1). De
 * kleurtoets is hier dus dat elk materiaal een eigen basiskleur draagt in
 * plaats van de glTF-standaard — die kleur is wat de catalogus laat zien.
 *
 * Twee afwijkingen zijn bekend en bewust; het script meldt ze als
 * aandachtspunt, niet als fout, en noemt ze bij naam zodat ze niet stilletjes
 * kunnen groeien:
 *   - twintig segmenten per doorsnede tegen zestien in §2;
 *   - boven het driehoekbudget van §4.
 * De onderbouwing staat in de kop van tools/bouw-orka.mjs.
 */

import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leesGlb, leesAccessor, meetScene, driehoekenPerUnit, BUDGET_PER_UNIT } from './glb.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let fouten = 0;
let waarschuwingen = 0;
const ok = (t) => console.log('  ok    ' + t);
const fout = (t) => {
  fouten++;
  console.log('  FOUT  ' + t);
};
const letOp = (t) => {
  waarschuwingen++;
  console.log('  let op ' + t);
};

/** Lineaire basiskleur → sRGB-hex, zoals de catalogus de kleuren toont. */
const hex = (kleur) =>
  '#' +
  kleur
    .slice(0, 3)
    .map((c) => {
      const s = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
      return Math.round(Math.min(Math.max(s, 0), 1) * 255)
        .toString(16)
        .padStart(2, '0');
    })
    .join('');

for (const naam of ['orca', 'orca-calf']) {
  const pad = join(ROOT, 'kits', 'onderwater-kit', `${naam}.glb`);
  const glb = leesGlb(pad);
  const { json } = glb;
  const bytes = readFileSync(pad).length;
  console.log(`\n=== ${naam} (${(bytes / 1024).toFixed(1)} kB)`);

  /* 1. Kleur — elk materiaal draagt zijn eigen basiskleur; de catalogus leest
   *    die uit het model. Ontbreekt hij, dan valt het model terug op het wit
   *    van glTF en heeft het in de kleurbalk niets te zoeken. */
  for (const mat of json.materials) {
    const factor = mat.pbrMetallicRoughness?.baseColorFactor;
    if (!factor) fout(`${mat.name}: geen baseColorFactor, dus geen eigen kleur`);
    else ok(`${mat.name} kleurt ${hex(factor)}`);
  }

  /* 1b. Materiaaldefaults (§1). Roughness is hier geen 1 maar 0,75 — een
   *     natte huid glimt; de waarde staat vast in bouw-orka.mjs en wordt hier
   *     alleen gemeld. */
  for (const mat of json.materials) {
    const pbr = mat.pbrMetallicRoughness ?? {};
    if ((pbr.metallicFactor ?? 1) !== 0) fout(`${mat.name}: metallicFactor ${pbr.metallicFactor ?? 1}, moet 0`);
    if ((mat.alphaMode ?? 'OPAQUE') !== 'OPAQUE') fout(`${mat.name}: alphaMode ${mat.alphaMode}`);
    if (mat.emissiveTexture || (mat.emissiveFactor ?? [0, 0, 0]).some((c) => c > 0)) {
      fout(`${mat.name}: emissive gezet`);
    }
    if ((pbr.baseColorFactor ?? [1, 1, 1, 1])[3] !== 1) fout(`${mat.name}: alpha < 1`);
  }
  const ruw = [...new Set(json.materials.map((m) => m.pbrMetallicRoughness?.roughnessFactor ?? 1))];
  ok(`${json.materials.length} materialen: metallic 0, OPAQUE, geen emissive (roughness ${ruw.join('/')})`);

  /* 2. Geometrie — segmenten per doorsnede van de romp. De ringen staan
   *    dwars op de x-as, dus groeperen op x en niet op hoogte. */
  const romp = json.meshes[0].primitives[0];
  const posities = leesAccessor(glb, romp.attributes.POSITION);
  const ringen = new Map();
  for (let v = 0; v < posities.count; v++) {
    const [x, y, z] = [posities.data[v * 3], posities.data[v * 3 + 1], posities.data[v * 3 + 2]];
    if (Math.hypot(y, z) < 0.01) continue; // snuit- en staartpunt liggen op de as
    const sleutel = x.toFixed(3);
    ringen.set(sleutel, (ringen.get(sleutel) ?? 0) + 1);
  }
  const breedste = Math.max(...ringen.values());
  if (breedste <= 16) ok(`max ${breedste} vlakke stukken per doorsnede (limiet 16)`);
  else letOp(`${breedste} stukken per doorsnede tegen 16 in §2 — bewust, zie bouw-orka.mjs`);

  /* 3. Outlines — lijnprimitives horen er niet te zijn (§3). */
  const lijnen = json.meshes[0].primitives.filter((p) => p.mode === 1);
  if (lijnen.length) letOp(`${lijnen.length} lijnprimitive(s), alleen toegestaan met PO-notitie`);
  else ok('geen outlines');

  /* 4. Schaal en dichtheid (§4), in de scène gemeten zodat de schaal van de
   *    wortelnode meetelt — het kalf staat op 0,371. */
  const maat = meetScene(glb);
  const dichtheid = driehoekenPerUnit(maat.driehoeken, maat.wdh);
  const afmeting = maat.wdh.map((v) => v.toFixed(2)).join(' × ');
  if (dichtheid <= BUDGET_PER_UNIT) {
    ok(`${maat.driehoeken} tri in ${afmeting} = ${dichtheid} tri/unit (limiet ${BUDGET_PER_UNIT})`);
  } else {
    letOp(
      `${dichtheid} tri/unit boven de ${BUDGET_PER_UNIT} van §4 ` +
        `(${maat.driehoeken} tri in ${afmeting}) — bewust, zie bouw-orka.mjs`,
    );
  }
  console.log(`  info  ${maat.calls} tekenopdrachten`);

  /* 5. Oorsprong (§5): y=0 onderaan, voetafdruk gecentreerd. */
  if (Math.abs(maat.min[1]) < 0.001) ok('laagste punt op Y = 0');
  else fout(`laagste punt op Y = ${maat.min[1].toFixed(3)}`);
  const spilX = (maat.min[0] + maat.max[0]) / 2;
  const spilZ = (maat.min[2] + maat.max[2]) / 2;
  if (Math.abs(spilX) < 0.01 && Math.abs(spilZ) < 0.01) ok('spil in het midden van de voetafdruk');
  else fout(`spil uit het midden: x ${spilX.toFixed(3)}, z ${spilZ.toFixed(3)}`);

  /* 4b. Dikte (§4): geen massief onderdeel dunner dan 0,015, op ware grootte.
   *     De dikte van een plaat — rugvin, staart, borstvin — is de kleinste maat
   *     van zijn bounding box.
   *
   *     De vlekken en de witte onderkant van de staart tellen niet mee: dat
   *     zijn geen massieve stukken maar enkelzijdige velletjes op of vlak boven
   *     de huid, met een bounding box die in één richting nul is. Zo'n velletje
   *     kán niet aan een dikte-eis voldoen, en de regel gaat er ook niet over. */
  const schaal = json.nodes[0].scale?.[0] ?? 1;
  let dunste = Infinity;
  let velletjes = 0;
  for (const prim of json.meshes[0].primitives) {
    const acc = json.accessors[prim.attributes.POSITION];
    const maten = acc.max.map((v, i) => (v - acc.min[i]) * schaal);
    const kleinste = Math.min(...maten);
    if (kleinste < 1e-6) velletjes++;
    else dunste = Math.min(dunste, kleinste);
  }
  if (dunste >= 0.015) ok(`dunste massieve onderdeel ${dunste.toFixed(3)} ≥ 0.015`);
  else fout(`dunste massieve onderdeel ${dunste.toFixed(3)} < 0.015`);
  console.log(
    `  info  ${velletjes} onderdeel${velletjes === 1 ? '' : 'en'} zonder dikte: ` +
      'enkelzijdig velletje, valt buiten de dikte-eis',
  );

  /* 5b. Winding: elk onderdeel moet met zijn buitenkant naar buiten staan.
   *     Een binnenstebuiten onderdeel valt weg bij achterkantverwijdering — je
   *     kijkt dan dwars door het dier heen — en krijgt bovendien normalen die
   *     naar binnen wijzen, dus ook de belichting klopt niet. Het getekende
   *     volume verraadt het: negatief betekent omgekeerd. De vlekken zijn open
   *     velletjes; die worden apart op hun eigen richting gecontroleerd. */
  const namen = ['romp', 'rugvin', 'staart', 'staart-onderkant', 'borstvinnen', 'buik', 'oog', 'zadel'];
  let omgekeerd = 0;
  let onderling = 0;
  json.meshes[0].primitives.forEach((prim, i) => {
    const V = leesAccessor(glb, prim.attributes.POSITION).data;
    const F = leesAccessor(glb, prim.indices).data;

    /* Draaien alle driehoeken van dit onderdeel dezelfde kant op? Het getekende
     * volume hieronder ziet dat níét: het is één som over alle vlakken, dus
     * veertig doppen die de verkeerde kant op staan verdrinken in vijftienhonderd
     * ringvlakken die goed staan — precies de fout die de aangeleverde romp had.
     *
     * Per rib telt daarom hoe vaak hij in dezelfde richting wordt gelopen. Bij
     * twee buren die het eens zijn, loopt de gedeelde rib bij de één van a naar
     * b en bij de ander van b naar a. Komt een richting twee keer voor, dan
     * staan die twee driehoeken tegenover elkaar. Open randen (de vlekken)
     * hebben ribben die maar één keer voorkomen; die zeggen niets. */
    const richting = new Map();
    for (let t = 0; t < F.length; t += 3) {
      for (const [p, q] of [[0, 1], [1, 2], [2, 0]]) {
        const sleutel = `${F[t + p]}>${F[t + q]}`;
        richting.set(sleutel, (richting.get(sleutel) ?? 0) + 1);
      }
    }
    const botsingen = [...richting.values()].filter((n) => n > 1).length;
    if (botsingen) {
      fout(`${namen[i] ?? i}: ${botsingen} ribben waar twee driehoeken tegengesteld draaien`);
      onderling++;
    }

    let volume = 0;
    for (let t = 0; t < F.length; t += 3) {
      const [p, q, r] = [0, 1, 2].map((k) => [0, 1, 2].map((as) => V[F[t + k] * 3 + as]));
      volume +=
        p[0] * (q[1] * r[2] - q[2] * r[1]) -
        p[1] * (q[0] * r[2] - q[2] * r[0]) +
        p[2] * (q[0] * r[1] - q[1] * r[0]);
    }
    if (volume < 0) {
      fout(`${namen[i] ?? i} staat binnenstebuiten (getekend volume ${(volume / 6).toFixed(5)})`);
      omgekeerd++;
    }
  });
  if (omgekeerd === 0 && onderling === 0) {
    ok(`alle ${json.meshes[0].primitives.length} onderdelen sluitend en met de buitenkant naar buiten`);
  }

  /* 5c. De staart is zwart van boven en wit van onderen, niet andersom. */
  const kant = (i) => {
    const V = leesAccessor(glb, json.meshes[0].primitives[i].attributes.POSITION).data;
    const F = leesAccessor(glb, json.meshes[0].primitives[i].indices).data;
    let omhoog = 0;
    for (let t = 0; t < F.length; t += 3) {
      const [p, q, r] = [0, 1, 2].map((k) => [0, 1, 2].map((as) => V[F[t + k] * 3 + as]));
      const [u, v] = [q.map((c, k) => c - p[k]), r.map((c, k) => c - p[k])];
      omhoog += Math.sign(u[2] * v[0] - u[0] * v[2]); // y-component van u × v
    }
    return omhoog;
  };
  if (kant(2) > 0 && kant(3) < 0) ok('staart: zwarte bovenkant omhoog, witte onderkant omlaag');
  else fout('staart staat ondersteboven: de witte onderkant kijkt omhoog');

  /* 6. Rig: één skin, gewichten die optellen tot 1, en de zwemclip. */
  const skin = json.skins?.[0];
  if (!skin) fout('geen skin');
  else {
    let scheef = 0;
    for (const prim of json.meshes[0].primitives) {
      const gewichten = leesAccessor(glb, prim.attributes.WEIGHTS_0);
      const gewrichten = leesAccessor(glb, prim.attributes.JOINTS_0);
      for (let v = 0; v < gewichten.count; v++) {
        const som = [0, 1, 2, 3].reduce((s, k) => s + gewichten.data[v * 4 + k], 0);
        if (Math.abs(som - 1) > 1e-3) scheef++;
        for (let k = 0; k < 4; k++) {
          if (gewrichten.data[v * 4 + k] >= skin.joints.length) scheef++;
        }
      }
    }
    if (scheef === 0) ok(`${skin.joints.length} gewrichten, alle gewichten tellen op tot 1`);
    else fout(`${scheef} hoekpunten met scheve gewichten of een gewricht buiten de skin`);
  }
  const clip = (json.animations ?? []).find((a) => a.name === 'Swim');
  if (clip) ok(`animatie "Swim" met ${clip.channels.length} kanalen`);
  else fout('geen animatie "Swim"');
}

console.log(`\n${fouten} fouten, ${waarschuwingen} aandachtspunten`);
process.exit(fouten === 0 ? 0 : 1);
