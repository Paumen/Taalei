import { readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, measureScene } from '../../catalog/tools/glb.mjs';
import { BRONKITS } from '../../catalog/tools/bronkits.mjs';
import { bronModellen, meet, kebab } from '../../catalog/tools/bronmodellen.mjs';
import { scaleTarget, UNTOUCHED } from './scale-factors.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORK_DIR = join(ROOT, 'kits', 'workfiles');
const MIN_SIZE = 1e-9;

const number = (name, fallback) => {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!found) return fallback;
  const value = Number(found.slice(name.length + 3));
  if (!Number.isFinite(value) || value < 0) throw new Error(`--${name}= needs a number of 0 or more`);
  return value;
};

const tolerance = number('tol', 0.001);
const kitFilter = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const listAll = process.argv.includes('--all');

function workFiles(slug) {
  const dir = join(WORK_DIR, slug);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith('.glb'))
    .map((file) => {
      const path = join(dir, file);
      const glb = readGlb(path);
      const measured = measureScene(glb);
      return {
        path: `${slug}/${basename(file, '.glb')}`,
        name: basename(file, '.glb'),
        sourceModel: glb.json.asset?.extras?.taaleiland?.bronmodel ?? null,
        size: measured.wdhExact,
        triangles: measured.triangles,
      };
    });
}

function sourceModels(bronkit) {
  const measured = bronModellen(bronkit).modellen.map((model) => ({ model, ...meet(model.primitieven) }));
  const byName = new Map();
  for (const item of measured) {
    byName.set(item.model.naam, item);
    if (!byName.has(kebab(item.model.naam))) byName.set(kebab(item.model.naam), item);
  }
  return byName;
}

function judge(file, source, factor) {
  if ([0, 1, 2].some((k) => (source[k] > MIN_SIZE) !== (file.size[k] > MIN_SIZE))) {
    return { verdict: 'not-uniform', ratios: [], worst: Infinity };
  }
  const axes = [0, 1, 2].filter((k) => source[k] > MIN_SIZE);
  if (axes.length === 0) return { verdict: 'flat', ratios: [] };

  const ratios = axes.map((k) => file.size[k] / source[k]);
  const uniform = Math.max(...ratios) / Math.min(...ratios) - 1 <= tolerance;
  const worst = Math.max(...ratios.map((r) => Math.abs(r / factor - 1)));
  if (!uniform) return { verdict: 'not-uniform', ratios, worst };
  if (worst > tolerance) return { verdict: 'wrong-factor', ratios, worst };
  return { verdict: 'exact', ratios, worst };
}

const counts = { exact: 0, 'wrong-factor': 0, 'not-uniform': 0, flat: 0, edited: 0, unlinked: 0, 'no-target': 0, 'no-source': 0 };
const problems = [];

for (const bronkit of BRONKITS) {
  if (!bronkit.kit || UNTOUCHED.has(bronkit.kit)) continue;
  if (kitFilter.length && !kitFilter.includes(bronkit.kit)) continue;
  const files = workFiles(bronkit.kit);
  if (files.length === 0) continue;

  const factor = scaleTarget(bronkit.kit);
  if (factor === null) {
    counts['no-target'] += files.length;
    console.log(`${bronkit.kit.padEnd(17)} ${String(files.length).padStart(4)} files  no target factor`);
    continue;
  }

  let models;
  try {
    models = sourceModels(bronkit);
  } catch (error) {
    counts['no-source'] += files.length;
    console.log(`${bronkit.kit.padEnd(17)} ${String(files.length).padStart(4)} files  sources unreadable: ${error.message}`);
    continue;
  }

  const kit = { exact: 0, 'wrong-factor': 0, 'not-uniform': 0, flat: 0, edited: 0, unlinked: 0 };
  for (const file of files) {
    const source = file.sourceModel ? models.get(file.sourceModel) : null;
    if (!source) {
      kit.unlinked++;
      continue;
    }
    if (source.driehoeken !== file.triangles) {
      kit.edited++;
      continue;
    }
    const { verdict, ratios, worst } = judge(file, [source.wdh[0], source.wdh[2], source.wdh[1]], factor);
    kit[verdict]++;
    if (verdict === 'wrong-factor' || verdict === 'not-uniform') {
      problems.push(
        `${verdict.padEnd(12)} ${file.path.padEnd(38)} target ${String(factor).padEnd(8)}`
          + (ratios.length
            ? ` found ${ratios.map((r) => r.toPrecision(4)).join(' ')} (off by ${(worst * 100).toFixed(2)}%)`
            : ' an axis is flat on one side only'),
      );
    }
  }
  for (const key of Object.keys(kit)) counts[key] += kit[key];

  const bad = kit['wrong-factor'] + kit['not-uniform'];
  const skipped = kit.edited + kit.unlinked + kit.flat;
  console.log(
    `${bronkit.kit.padEnd(17)} ${String(files.length).padStart(4)} files  × ${String(factor).padEnd(8)}`
      + ` ${String(kit.exact).padStart(4)} exact  ${String(bad).padStart(3)} off  ${String(skipped).padStart(4)} unverifiable`,
  );
}

const verified = counts.exact + counts['wrong-factor'] + counts['not-uniform'];
console.log(
  `\n${verified} files compared with their source model: ${counts.exact} exactly source × factor, `
    + `${counts['wrong-factor']} at another factor, ${counts['not-uniform']} not a uniform scale of the source`,
);
console.log(
  `unverifiable: ${counts.unlinked} without a recorded source model, ${counts.edited} whose geometry differs from the source, `
    + `${counts.flat} flat, ${counts['no-target']} in a kit without a target factor, ${counts['no-source']} without readable sources`,
);
if (problems.length) {
  console.log('');
  for (const line of listAll ? problems : problems.slice(0, 40)) console.log(`  ${line}`);
  if (!listAll && problems.length > 40) console.log(`  … ${problems.length - 40} more, run with --all`);
  process.exitCode = 1;
}
