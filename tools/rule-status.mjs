// Regenerates the `FE`/`PE`/`FW`/`PW`/`--` marker and traffic light on every rule in
// docs/asset_style_guide.md (see "Status of a rule"). Run after changing a rule, a
// lint check or the catalogue. `--check` exits non-zero instead of writing, for CI.

import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const GUIDE = join(ROOT, 'docs/asset_style_guide.md');

// How far each rule is automated. Severity and pass/fail come from lint; only the
// full-versus-partial judgement is recorded here, because no tool can measure it:
// a check is partial when it proves less than the rule says, whether because it
// reads a proxy tag, a name, or only one clause.
const COVERAGE = {
  full: `M1 M2 M3 M6 M9 M10 M13 M14 M20 M22 M23 M24 M25 M28 M29 M30 M31 M33 M34
         M36 M41 M42 M43 C3 C8 C9 C10 C11 C15 N1 N2 N3 N4 N5 S4 W2`,
  partial: `G1 M4 M8 M11 M12 M15 M17 M18 18b M19 M26 M27 M37 M38 M39 M44
            M62 M63 M64 M65 M66 M67 M68
            C1 C2 C4 C5 C6 C7 C12 C13 C14 S1 S2 S3 S5`,
};
const coverage = new Map();
for (const [kind, list] of Object.entries(COVERAGE)) {
  for (const id of list.split(/\s+/).filter(Boolean)) coverage.set(id, kind);
}

// One rule may be checked by several lint ids, and one lint id may span two rules.
const GUIDE_ID = { 'M6-bark': 'M6', 'M12-wrought': 'M12', 'M12-cast': 'M12', 'M13-silver': 'M13', 'M14-only': 'M14',
  'M31-half': 'M31', 'M65-pair': 'M65', 'M42-planks': 'M42', 'M42-worked': 'M42', 'M42-beam': 'M42',
  'C9-light': 'C9', 'C9-middle': 'C9', 'C9-dark': 'C9', M18b: '18b' };
const guideId = (id) => GUIDE_ID[id] ?? id;

// Rules with no check of their own, whose severity and pass/fail follow another's:
// N5 lifts N4's ceiling from inside it, and the joker of S1-S5 runs inside every band
// rule. M12 has checks of its own now (M12-wrought, M12-cast) and no longer follows M11.
const FOLLOWS = { N5: 'N4', S1: 'M1', S2: 'M1', S3: 'M1', S5: 'M1' };

const tmp = join(tmpdir(), `rule-status-${process.pid}.json`);
// lint exits non-zero while any error-severity finding stands, which is the normal
// case here; the report is written either way.
try {
  execFileSync('node', [join(ROOT, 'tools/catalog-lint.mjs'), '--json', tmp], { stdio: 'ignore' });
} catch { /* findings, not a failure to run */ }
const report = JSON.parse(readFileSync(tmp, 'utf8'));
rmSync(tmp, { force: true });

const severity = new Map();
for (const r of report.rules) {
  const id = guideId(r.id);
  // an error anywhere in a rule's checks makes the rule an error
  if (r.severity === 'error' || !severity.has(id)) severity.set(id, r.severity);
}
const red = new Set(report.findings.map((f) => guideId(f.rule)));

const marker = (id) => {
  const how = coverage.get(id);
  if (!how) return ['--', '⚪'];
  const from = FOLLOWS[id] ?? id;
  const code = (how === 'full' ? 'F' : 'P') + (severity.get(from) === 'error' ? 'E' : 'W');
  return [code, red.has(from) ? '🔴' : '🟢'];
};

const before = readFileSync(GUIDE, 'utf8');
const after = before.replace(/(- \*\*([A-Za-z0-9]+)\.?\*\* )`(?:FE|PE|FW|PW|--)` (?:🟢|🔴|⚪) /gu,
  (whole, head, id) => (coverage.has(id) || !severity.has(id)) ? `${head}\`${marker(id)[0]}\` ${marker(id)[1]} ` : whole);

const stale = before !== after;
if (process.argv.includes('--check')) {
  console.log(stale ? 'rule statuses are stale — run node tools/rule-status.mjs' : 'rule statuses are current');
  process.exit(stale ? 1 : 0);
}
writeFileSync(GUIDE, after);
console.log(stale ? 'rule statuses updated' : 'rule statuses already current');
