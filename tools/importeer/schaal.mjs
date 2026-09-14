import { readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, measureScene } from '../../catalog/tools/glb.mjs';
import { BRONKITS } from '../../catalog/tools/bronkits.mjs';
import { bronModellen, meet, kebab } from '../../catalog/tools/bronmodellen.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WERK_DIR = join(ROOT, 'kits', 'workfiles');

const KEN_DOEL = { 'ken-pirate': 0.26, 'ken-survival': 1.3, 'ken-cave': 0.1625 };
const KEN_STANDAARD = 0.65;
const ONGEMOEID = new Set(['quat-ocean', 'taalei-kit']);
const SPREIDING = 0.02;
const SNAP = 0.005;

const alleenRapport = process.argv.includes('--report');

function werkbestanden(slug) {
  const dir = join(WERK_DIR, slug);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith('.glb'))
    .map((bestand) => {
      const pad = join(dir, bestand);
      const glb = readGlb(pad);
      const gemeten = measureScene(glb);
      return {
        pad,
        naam: basename(bestand, '.glb'),
        bronmodel: glb.json.asset?.extras?.taaleiland?.bronmodel ?? null,
        schaal: glb.json.asset?.extras?.taaleiland?.schaal ?? null,
        wdh: gemeten.wdh,
        driehoeken: gemeten.triangles,
      };
    });
}

function metenTegenBron(bronkit, bestanden) {
  const gemeten = new Map();
  let bron;
  try {
    bron = bronModellen(bronkit).modellen;
  } catch {
    return gemeten;
  }

  const opBronmodel = new Map();
  const opNaam = new Map();
  const opDriehoeken = new Map();
  for (const bestand of bestanden) {
    if (bestand.bronmodel) opBronmodel.set(bestand.bronmodel, bestand);
    opNaam.set(bestand.naam, bestand);
    const gelijk = opDriehoeken.get(bestand.driehoeken);
    if (gelijk) gelijk.push(bestand);
    else opDriehoeken.set(bestand.driehoeken, [bestand]);
  }

  const gemetenBron = bron.map((model) => ({ model, ...meet(model.primitieven) }));
  const bronPerDriehoek = new Map();
  for (const item of gemetenBron) {
    const gelijk = bronPerDriehoek.get(item.driehoeken);
    if (gelijk) gelijk.push(item);
    else bronPerDriehoek.set(item.driehoeken, [item]);
  }

  const zelfdeMaat = (groep) =>
    groep.every((g) => g.wdh.every((v, k) => Math.abs(v - groep[0].wdh[k]) <= SPREIDING * Math.max(v, 1e-9)));

  for (const { model, driehoeken, wdh } of gemetenBron) {
    const opMaat =
      opDriehoeken.get(driehoeken)?.length === 1 && zelfdeMaat(bronPerDriehoek.get(driehoeken))
        ? opDriehoeken.get(driehoeken)[0]
        : null;
    const bestand = opBronmodel.get(model.naam) ?? opNaam.get(kebab(model.naam)) ?? opMaat;
    if (!bestand) continue;
    const bronWdh = [wdh[0], wdh[2], wdh[1]];
    const assen = [0, 1, 2].filter((k) => bronWdh[k] > 1e-9 && bestand.wdh[k] > 1e-9);
    if (assen.length === 0) continue;
    const verhoudingen = assen.map((k) => bestand.wdh[k] / bronWdh[k]);
    if (Math.max(...verhoudingen) / Math.min(...verhoudingen) > 1 + SPREIDING) continue;
    gemeten.set(bestand.naam, verhoudingen.reduce((a, b) => a + b, 0) / verhoudingen.length);
  }
  return gemeten;
}

function groepeer(waarden) {
  const gesorteerd = [...waarden].sort((a, b) => a - b);
  const groepen = [];
  for (const waarde of gesorteerd) {
    const laatste = groepen[groepen.length - 1];
    if (laatste && waarde / laatste[0] <= 1 + SPREIDING * 2) laatste.push(waarde);
    else groepen.push([waarde]);
  }
  return groepen.map((groep) => ({
    factor: Number(groep[Math.floor(groep.length / 2)].toPrecision(4)),
    aantal: groep.length,
    laag: groep[0],
    hoog: groep[groep.length - 1],
  }));
}

function schaalWortels(json, k) {
  for (const index of json.scenes?.[json.scene ?? 0]?.nodes ?? []) {
    const node = json.nodes[index];
    if (node.matrix) {
      for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14]) node.matrix[i] *= k;
      continue;
    }
    node.scale = (node.scale ?? [1, 1, 1]).map((v) => v * k);
    if (node.translation) node.translation = node.translation.map((v) => v * k);
  }
}

let geschreven = 0;
let herschaald = 0;

for (const bronkit of BRONKITS) {
  if (!bronkit.kit || ONGEMOEID.has(bronkit.kit)) continue;
  const bestanden = werkbestanden(bronkit.kit);
  if (bestanden.length === 0) continue;

  const gemeten = metenTegenBron(bronkit, bestanden);
  const groepen = groepeer(gemeten.values());
  if (groepen.length === 0) {
    console.log(`${bronkit.kit.padEnd(17)} no source model matched — left alone`);
    continue;
  }
  const hoofdgroep = groepen.reduce((a, b) => (b.aantal > a.aantal ? b : a));
  const factorVan = (bestand) => {
    const waarde = gemeten.get(bestand.naam);
    const groep =
      waarde === undefined
        ? hoofdgroep
        : (groepen.find((g) => waarde >= g.laag && waarde <= g.hoog) ?? hoofdgroep);
    if (bestand.schaal !== null && Math.abs(bestand.schaal / groep.factor - 1) <= SNAP) {
      return bestand.schaal;
    }
    return Number(groep.factor.toPrecision(3));
  };

  const doel = bronkit.kit.startsWith('ken-') ? (KEN_DOEL[bronkit.kit] ?? KEN_STANDAARD) : null;
  const uit = new Map();

  for (const bestand of bestanden) {
    const huidig = factorVan(bestand);
    const nieuw = doel ?? huidig;
    const k = nieuw / huidig;
    const beweegt = Math.abs(k - 1) > 1e-6;
    if (bestand.schaal === nieuw && !beweegt) {
      uit.set(nieuw, (uit.get(nieuw) ?? 0) + 1);
      continue;
    }

    const glb = readGlb(bestand.pad);
    if (beweegt) {
      schaalWortels(glb.json, k);
      herschaald++;
    }
    glb.json.asset ??= {};
    glb.json.asset.extras ??= {};
    glb.json.asset.extras.taaleiland ??= {};
    glb.json.asset.extras.taaleiland.schaal = nieuw;
    if (!alleenRapport) writeGlb(bestand.pad, glb.json, glb.bin, writeFileSync);
    geschreven++;
    uit.set(nieuw, (uit.get(nieuw) ?? 0) + 1);
  }

  const was = [...new Set(bestanden.map((b) => b.schaal))].join('/');
  const wordt = [...uit.entries()].sort((a, b) => b[1] - a[1]).map(([v, n]) => `${v}×${n}`).join(' ');
  const gemetenUit = groepen.map((g) => `${g.factor}×${g.aantal}`).join(' ');
  console.log(
    `${bronkit.kit.padEnd(17)} recorded ${was.padEnd(14)} measured ${gemetenUit.padEnd(22)} → ${wordt}`,
  );
}

console.log(
  `\n${geschreven} files ${alleenRapport ? 'would be rewritten' : 'rewritten'}, ${herschaald} of them rescaled`,
);
