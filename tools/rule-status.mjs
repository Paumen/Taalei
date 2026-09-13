// Regenerates the `FE`/`PE`/`FW`/`PW`/`--` marker and traffic light on every rule in
// docs/asset_style_guide.md (see "Status of a rule"), and checks the guide's rule
// grammar. Run after changing a rule, a lint check or the catalogue. `--check` exits
// non-zero instead of writing, for CI.
//
// Coverage (full or partial) and which rule another follows are declared on the checks
// in tools/catalog-lint.mjs; severity and pass/fail come from running it.

import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { GUIDE, readGuide, referencedIds, ID_PATTERN } from '../catalog/tools/rules.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const RULE_LENGTH = 140; // Appendix A rules stay below this (CLAUDE.md)

const tmp = join(tmpdir(), `rule-status-${process.pid}.json`);
// lint exits non-zero while any error-severity finding stands, which is the normal
// case here; the report is written either way.
let modelsRead = null;
try {
  modelsRead = Number(/^(\d+) models/.exec(execFileSync('node', [join(ROOT, 'tools/catalog-lint.mjs'), '--json', tmp], { encoding: 'utf8' }))?.[1]);
} catch (e) { modelsRead = Number(/^(\d+) models/.exec(e.stdout ?? '')?.[1]); }
const report = JSON.parse(readFileSync(tmp, 'utf8'));
rmSync(tmp, { force: true });

// docs/rule_index.md is lint's --index output, regenerated here like the markers
const INDEX = join(ROOT, 'docs/rule_index.md');
execFileSync('node', [join(ROOT, 'tools/catalog-lint.mjs'), '--index', tmp], { stdio: 'ignore' });
const indexAfter = readFileSync(tmp, 'utf8');
rmSync(tmp, { force: true });
let indexBefore = '';
try { indexBefore = readFileSync(INDEX, 'utf8'); } catch { /* not written yet */ }

const before = readFileSync(GUIDE, 'utf8');
const { rules, bands } = readGuide(before);

const coverage = new Map();
const follows = new Map();
const severity = new Map();
for (const r of report.rules) {
  // an error anywhere in a rule's checks makes the rule an error; partial anywhere makes it partial
  if (r.severity === 'error' || !severity.has(r.guide)) severity.set(r.guide, r.severity);
  if (r.coverage === 'partial' || !coverage.has(r.guide)) coverage.set(r.guide, r.coverage);
  if (r.follows) follows.set(r.guide, r.follows);
}
const red = new Set(report.findings.map((f) => report.rules.find((r) => r.id === f.rule)?.guide ?? f.rule));

const marker = (id) => {
  const how = coverage.get(id);
  if (!how) return ['--', '⚪'];
  const from = follows.get(id) ?? id;
  const code = (how === 'full' ? 'F' : 'P') + (severity.get(from) === 'error' ? 'E' : 'W');
  return [code, red.has(from) ? '🔴' : '🟢'];
};

let after = before.replace(/(- \*\*([A-Za-z0-9]+)\.?\*\* )`(?:FE|PE|FW|PW|--)` (?:🟢|🔴|⚪) /gu,
  (whole, head, id) => (coverage.has(id) || !severity.has(id)) ? `${head}\`${marker(id)[0]}\` ${marker(id)[1]} ` : whole);
if (modelsRead) after = after.replace(/Lint reads \d+ models/, `Lint reads ${modelsRead} models`);

// The grammar every rule line answers to. A problem here is reported, never repaired.
const problems = [];
const at = (rule) => `${rule.id} (line ${rule.line})`;
const bandNames = new Set([...bands.values()].flatMap((b) => [b.name, ...b.aliases]));
for (const rule of rules.values()) {
  if (!ID_PATTERN.test(rule.id)) problems.push(`${at(rule)}: id does not fit the pattern letter, number, optional suffix`);
  if (rule.appendix === 'A' && rule.plain.length >= RULE_LENGTH) problems.push(`${at(rule)}: ${rule.plain.length} chars, limit ${RULE_LENGTH}`);
  for (const ref of referencedIds(rule.plain)) if (!rules.has(ref)) problems.push(`${at(rule)}: refers to ${ref}, which is no rule`);
  // a band written with its id must be that band's: `blue-grey 3,2` is wrong, and an
  // alias (`gold 6,0`) is not the band's name. A word that is no band name (a material
  // tag, `or`) is left alone.
  for (const [, name, lane] of rule.plain.matchAll(/(?<![\w-])([a-z]+(?:-[a-z]+)?(?: [a-z]+(?:-[a-z]+)?)?) (\d+,\d+)/gi)) {
    const words = name.toLowerCase().split(' ');
    const known = [words.join(' '), words.at(-1)].find((w) => bandNames.has(w));
    if (!known) continue;
    const entry = [...bands.values()].find((b) => b.name === known || b.aliases.includes(known));
    if (entry.lane !== lane) problems.push(`${at(rule)}: "${known} ${lane}" — ${known} is ${entry.lane}`);
    if (entry.name !== known) problems.push(`${at(rule)}: "${known} ${lane}" is an alias; the band is ${entry.name} ${entry.lane}`);
  }
  if (rule.code !== '--' && !coverage.has(rule.id)) problems.push(`${at(rule)}: marked ${rule.code} but lint has no check for it`);
}
for (const r of report.rules) if (!rules.has(r.guide)) problems.push(`lint check ${r.id}: no rule ${r.guide} in the guide`);
for (const line of after.split('\n')) {
  const loose = /^- \*\*([A-Za-z0-9]+)\.?\*\* /.exec(line);
  if (loose && !rules.has(loose[1])) problems.push(`${loose[1]}: rule line does not fit the grammar \`- **ID.** \`code\` light text\``);
}

const stale = before !== after || indexBefore !== indexAfter;
for (const p of problems) console.log(`guide: ${p}`);
if (process.argv.includes('--check')) {
  console.log(stale ? 'rule statuses or index are stale — run node tools/rule-status.mjs' : 'rule statuses and index are current');
  console.log(problems.length ? `${problems.length} grammar problem(s)` : 'rule grammar is clean');
  process.exit(stale || problems.length ? 1 : 0);
}
writeFileSync(GUIDE, after);
if (indexBefore !== indexAfter) writeFileSync(INDEX, indexAfter);
console.log(stale ? 'rule statuses and index updated' : 'rule statuses and index already current');
if (problems.length) process.exit(1);
