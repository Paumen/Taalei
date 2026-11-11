import { dropHidden } from './lib.mjs';

const HELP = `hidden.mjs <in.glb> <out.glb> [--wall <w>] [--dirs <n>]
Drops faces that cannot be seen from outside from any angle, so walls hidden
inside a model (a gap between two halves, a buried layer, an inner shell) stop
counting as thin. Each face is tested from 13 points on it in up to <n> (1024)
directions. --wall limits the drop to faces whose own wall is under <w>.`;

const args = process.argv.slice(2);
if (args.length < 2 || args.includes('--help')) { console.log(HELP); process.exit(0); }
const opt = (k) => { const i = args.indexOf(k); return i < 0 ? null : args[i + 1]; };
const [file, out] = args;
const wall = opt('--wall') === null ? null : Number(opt('--wall'));

const r = dropHidden(file, out, { wall, dirs: Number(opt('--dirs') ?? 1024) });
console.log(`dropped ${r.dropped} of ${r.tris} faces`);
