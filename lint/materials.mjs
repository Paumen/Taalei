import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { idUnder, materialFindings, treeIds } from './rules.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));

const VARS = read('lint/variables.json');
const KINDS = treeIds(read(VARS.kinds).kinds);
const MATERIALS = treeIds(read(VARS.materials).materials);
const { models } = read(VARS.models);

const RULES = [
  {
    id: 'M00',
    when: 'mat=metal-iron',
    except: 'kind:obj-kitchenware-cookware',
    subject: 'mat:metal-iron',
    assert: 'is',
    value: ['metal-iron-wrought'],
    fallback: true,
  },
  {
    id: 'M01',
    when: 'kind:obj-kitchenware-tableware | kind:obj-weapon | kind:obj-tool | kind:obj-equipment | kind:char',
    except: 'kind:obj-weapon-cannon | kind:obj-tool-supplies',
    subject: 'mat:metal-iron',
    assert: 'is',
    value: ['metal-iron-steel'],
  },
  { id: 'M02', when: 'kind:obj-weapon-cannon | kind:str', subject: 'mat:metal-iron', assert: 'is', value: ['metal-iron-cast'] },
  { id: 'M03', when: 'kind:obj-tool-supplies', subject: 'mat:metal-iron', assert: 'is', value: ['metal-iron-wrought'] },
  { id: 'M05', when: 'kind:obj-container-barrel | kind:obj-container-bucket', subject: 'mat:metal', assert: 'is', value: ['metal-iron'] },
  { id: 'M06', when: 'kind:obj-container-chest', subject: 'mat:metal', assert: 'is', value: ['metal-iron'] },
  { id: 'M07', when: 'kind:obj-container-crate', subject: 'mat:metal', assert: 'is', value: ['metal-iron'] },
  { id: 'M09', when: 'kind:obj-container-bottle', subject: 'model', assert: 'has', value: ['glass', 'ceramic'] },
  {
    id: 'M11',
    when: 'kind:obj-kitchenware-tableware-plate | kind:obj-kitchenware-tableware-bowl',
    subject: 'model',
    assert: 'any-of',
    value: ['ceramic', 'metal-iron:', 'wood:'],
  },
  { id: 'M14', when: 'kind:obj-furniture-seating', subject: 'model', assert: 'has', value: ['textile'] },
  { id: 'M22', when: 'kind:obj-tool-hand', subject: 'mat:wood', assert: 'is', value: ['wood-planks'] },
  { id: 'M23', when: 'kind:obj-tool-long', subject: 'mat:wood', assert: 'is', value: ['wood-beam'] },
  { id: 'M25', when: 'kind:obj-transport-boat | kind:obj-transport-ship', subject: 'mat:wood', assert: 'min', value: [2] },
  { id: 'M26', when: 'kind:obj-pocketitem-coin', subject: 'model', assert: 'any-of', value: ['metal-gold'] },
  { id: 'M27', when: 'kind:obj-pocketitem-key', subject: 'model', assert: 'any-of', value: ['metal-iron:', 'metal-gold'] },
  { id: 'M29', when: 'kind:obj-pocketitem-jewellery', subject: 'model', assert: 'any-of', value: ['metal-gold', 'gemstone'] },
  { id: 'M30', when: 'kind:obj-resource-wood-log', subject: 'model', assert: 'has', value: ['wood-log'] },
  { id: 'M31', when: 'kind:obj-resource-wood-log', subject: 'model', assert: 'has', value: ['wood-bark'] },
  { id: 'M35', when: 'kind:str-part-roof', subject: 'model', assert: 'has', value: ['ceramic'] },
  { id: 'M36', when: 'kind:str-marker-flag', subject: 'model', assert: 'has', value: ['textile'] },
  {
    id: 'M37',
    when: 'kind:str-marker-sign | kind:str-barrier-post | kind:str-marker-flag',
    subject: 'model',
    assert: 'has',
    value: ['wood:'],
  },
];

const fail = (rule, what) => { throw new Error(`${rule.id}: ${what}`); };

for (const rule of RULES) {
  for (const expr of [rule.when, rule.except].filter(Boolean)) {
    for (const raw of expr.split(/[|&]/)) {
      const term = raw.trim().replace(/^!/, '');
      if (term === '*') continue;
      if (term.startsWith('kind:')) {
        if (!KINDS.has(term.slice(5))) fail(rule, `${term} is not in ${VARS.kinds}`);
      } else if (term.startsWith('mat:') || term.startsWith('mat=')) {
        if (!MATERIALS.has(term.slice(4))) fail(rule, `${term} is not in ${VARS.materials}`);
      } else fail(rule, `${term} is outside kind and material ids`);
    }
  }
  if (rule.subject !== 'model') {
    if (!rule.subject.startsWith('mat:')) fail(rule, `subject ${rule.subject} is outside kind and material ids`);
    if (!MATERIALS.has(rule.subject.slice(4))) fail(rule, `subject ${rule.subject} is not in ${VARS.materials}`);
  }
  if (rule.assert === 'min') {
    if (rule.value.length !== 1 || typeof rule.value[0] !== 'number') fail(rule, 'min takes one number');
  } else {
    for (const token of rule.value) {
      if (!MATERIALS.has(token.replace(/:$/, ''))) fail(rule, `${token} is not in ${VARS.materials}`);
    }
  }
}

const findings = [];
let checked = 0;
let skipped = 0;

for (const m of models) {
  if (!m.kind || VARS.exemptKinds.some((k) => idUnder(m.kind, k))) { skipped++; continue; }
  checked++;
  const mats = new Set((m.tags ?? []).filter((t) => MATERIALS.has(t)));
  for (const f of materialFindings(m, mats, RULES)) {
    findings.push({ ...f, id: `${m.kit}/${m.name}`, kit: m.kit, kind: m.kind });
  }
}

findings.sort((a, b) => a.rule.localeCompare(b.rule) || a.kit.localeCompare(b.kit) || a.id.localeCompare(b.id));

const width = (key) => Math.max(...findings.map((f) => String(f[key]).length), 0);
const w = { id: width('id'), kind: width('kind'), subject: width('subject') };

for (const f of findings) {
  const wants = `${f.assert} ${f.value.join(', ')}`;
  const has = f.have.length ? f.have.join(', ') : '—';
  console.log(`${f.rule}  ${f.id.padEnd(w.id)}  ${f.kind.padEnd(w.kind)}  ${f.subject.padEnd(w.subject)}  ${wants}  (has ${has})`);
}

const perKit = new Map();
for (const f of findings) perKit.set(f.kit, (perKit.get(f.kit) ?? 0) + 1);
if (perKit.size) {
  console.log('');
  const kw = Math.max(...[...perKit.keys()].map((k) => k.length));
  for (const [kit, count] of [...perKit].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`${kit.padEnd(kw)}  ${String(count).padStart(4)} errors`);
  }
}

console.log(`\n${RULES.length} rules, ${checked} checked, ${skipped} exempt, ${findings.length} errors`);

process.exitCode = findings.length ? 1 : 0;
