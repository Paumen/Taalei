import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Schaalt elke bron-render in één Lanczos-pass terug naar elke sport van de
// ladder. Geen JPEG, geen verscherping, geen tweede pass: elke sport komt
// rechtstreeks uit de 2576px bron. Werkelijke afmetingen worden gelogd.
// Gebruik: node tools/resolutie-stijl/ladder.mjs [stimulidir]
const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HIER, '..', '..');
const BASIS = path.resolve(process.argv[2] || path.join(ROOT, 'docs', 'resolutie-stijl', 'stimuli'));
const SPORTEN = [2576, 1568, 1092, 768, 512, 384, 256, 192];
const BRON = path.join(BASIS, String(SPORTEN[0]));

const log = [];
for (const sport of SPORTEN.slice(1)) {
  const uit = path.join(BASIS, String(sport));
  mkdirSync(uit, { recursive: true });
  for (const f of readdirSync(BRON).filter((n) => n.endsWith('.png')).sort()) {
    const doel = path.join(uit, f);
    if (!existsSync(doel)) {
      execFileSync('convert', [
        path.join(BRON, f), '-colorspace', 'RGB', '-filter', 'Lanczos',
        '-resize', `${sport}x${sport}`, '-colorspace', 'sRGB', '-strip', 'PNG24:' + doel,
      ]);
    }
  }
}

for (const sport of SPORTEN) {
  const dir = path.join(BASIS, String(sport));
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.png')).sort()) {
    const p = path.join(dir, f);
    const [b, h] = execFileSync('identify', ['-format', '%w %h', p]).toString().split(' ');
    log.push({ sport, bestand: `${sport}/${f}`, breedte: Number(b), hoogte: Number(h) });
    if (Math.max(Number(b), Number(h)) !== sport) console.log('AFWIJKING', p, b, h);
  }
}
writeFileSync(path.join(BASIS, 'afmetingen.json'), JSON.stringify(log, null, 1));
console.log('sporten:', SPORTEN.join(', '), '| bestanden:', log.length);
