import { tidy } from './lib.mjs';

const HELP = `tidy.mjs <in.glb> <out.glb> <ref.glb>
Puts the model back on the floor of <ref.glb> (the version before an edit)
and recomputes the normals of every point that moved since <ref.glb>, so an
edit by thicken or a point-moving script leaves no floating model and no stale
shading.`;

const args = process.argv.slice(2);
if (args.length < 3 || args.includes('--help')) { console.log(HELP); process.exit(0); }
const r = tidy(args[0], args[1], args[2]);
console.log(`normals ${r.normals}, lifted ${(r.lift * 1000).toFixed(2)} mm`);
