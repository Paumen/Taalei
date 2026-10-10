import { readdirSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, measureScene } from '../catalog/tools/glb.mjs';
import { VARS } from './report.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { workfiles, minLongest } = VARS.golden;

const RULES = [
  {
    id: 'R01',
    check: (glb) => {
      const longest = Math.max(...measureScene(glb).wdhExact);
      return longest < minLongest ? `longest side ${longest.toFixed(4)} under ${minLongest}` : null;
    },
  },
];

const glbs = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const path = join(dir, e.name);
  if (e.isDirectory()) return glbs(path);
  return e.name.endsWith('.glb') ? [path] : [];
});

const files = glbs(join(ROOT, workfiles)).sort();
const findings = [];
for (const file of files) {
  const id = relative(join(ROOT, workfiles), file).replace(/\.glb$/, '');
  let glb;
  try {
    glb = readGlb(file);
  } catch (e) {
    findings.push({ id, rule: 'read', text: e.message });
    continue;
  }
  for (const rule of RULES) {
    const text = rule.check(glb);
    if (text) findings.push({ id, rule: rule.id, text });
  }
}

const w = Math.max(0, ...findings.map((f) => f.id.length));
for (const f of findings) console.log(`error  ${f.id.padEnd(w)}  ${f.rule}  ${f.text}`);
console.log(`\n${files.length} checked, ${RULES.length} rules, ${findings.length} errors`);

process.exitCode = findings.length ? 1 : 0;
