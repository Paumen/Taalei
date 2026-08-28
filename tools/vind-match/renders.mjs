// Rendert elk model uit modellen.txt met dezelfde acht views als render.mjs.
// Gebruik: node tools/vind-match/renders.mjs [lijst] [uitdir]
// Standaard: tools/vind-match/modellen.txt -> docs/missing_matches/.tussenstand/views
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HIER, '..', '..');
const LIJST = path.resolve(ROOT, process.argv[2] ?? 'tools/vind-match/modellen.txt');
const UIT = path.resolve(ROOT, process.argv[3] ?? 'docs/missing_matches/.tussenstand/views');

// De mapnaam onder kits/missing is de kit; het bestand zonder .glb de naam.
// Samen geven ze het asset-id <kit>__<naam> dat render.mjs als bestandsnaam
// gebruikt, hetzelfde patroon als in docs/catalogus_views/catalogus.
const lijst = readFileSync(LIJST, 'utf8')
  .split('\n')
  .map((r) => r.trim())
  .filter(Boolean)
  .map((rel) => ({
    kit: rel.split('/')[2],
    name: path.basename(rel, '.glb'),
    path: path.join(ROOT, rel),
  }));

const werkmap = mkdtempSync(path.join(tmpdir(), 'vind-match-views-'));
const setsPad = path.join(werkmap, 'sets.json');
writeFileSync(setsPad, JSON.stringify({ missing: lijst }));
console.log(`${lijst.length} modellen -> ${UIT}`);
execFileSync('node', [path.join(ROOT, 'tools', 'renders', 'render.mjs'), setsPad, UIT], { stdio: 'inherit' });
