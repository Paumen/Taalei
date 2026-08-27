// Rendert elk model uit catalog.json met dezelfde acht views als render.mjs.
// Gebruik: node tools/renders/catalogus.mjs [uitdir]
// Standaard uitdir: docs/catalogus_views
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HIER, '..', '..');
const UIT = path.resolve(ROOT, process.argv[2] ?? 'docs/catalogus_views');

const catalogus = JSON.parse(readFileSync(path.join(ROOT, 'catalog', 'catalog.json'), 'utf8'));
const lijst = catalogus.models.map((m) => ({
  kit: m.kit,
  name: m.name,
  path: path.join(ROOT, 'kits', 'workfiles', m.kit, `${m.name}.glb`),
}));

// render.mjs leest een sets.json en schrijft per set een submap; één set
// 'catalogus' geeft dus alles onder <uitdir>/catalogus.
const werkmap = mkdtempSync(path.join(tmpdir(), 'catalogus-views-'));
const setsPad = path.join(werkmap, 'sets.json');
writeFileSync(setsPad, JSON.stringify({ catalogus: lijst }));
console.log(`${lijst.length} modellen -> ${UIT}`);
execFileSync('node', [path.join(HIER, 'render.mjs'), setsPad, UIT], { stdio: 'inherit' });
