// The rules of docs/asset_style_guide.md, read from the guide and nowhere else: lint
// and rule-status take rule text, ids and the band table from here, so the guide is
// the single source by construction. Shared with kinds.mjs, which reads Appendix B.

import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const GUIDE = join(ROOT, 'docs/asset_style_guide.md');

export const CODES = ['FE', 'PE', 'FW', 'PW', '--'];
export const LIGHTS = ['🟢', '🔴', '⚪'];

// `- **M25.** `FE` 🟢 text`, text continuing on lines indented by two spaces
const RULE_LINE = /^- \*\*([A-Za-z0-9]+)\.?\*\* `(FE|PE|FW|PW|--)` (🟢|🔴|⚪) (.*)$/u;
const CONTINUATION = /^  (\S.*)$/;

// A rule id: block letter, number, optional letter suffix (M18b). The guide's own
// grammar; the check in rule-status reports every id that does not fit it.
export const ID_PATTERN = /^[A-Z]\d+[a-z]?$/;

// markdown to plain: no backticks, no bold
export const plain = (text) => text.replace(/`/g, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

export function readGuide(guide = readFileSync(GUIDE, 'utf8')) {
  const lines = guide.split('\n');
  const rules = new Map();
  let section = '';
  let block = '';
  let appendix = '';
  let current = null;
  lines.forEach((line, index) => {
    if (line.startsWith('## ')) {
      section = line.slice(3).trim();
      block = '';
      appendix = /^Appendix ([A-Z])/.exec(section)?.[1] ?? '';
      current = null;
      return;
    }
    if (line.startsWith('### ')) {
      block = line.slice(4).trim();
      current = null;
      return;
    }
    const rule = RULE_LINE.exec(line);
    if (rule) {
      const [, id, code, light, text] = rule;
      current = { id, code, light, text, section, block, appendix, line: index + 1 };
      rules.set(id, current);
      return;
    }
    const more = current && CONTINUATION.exec(line);
    if (more) current.text += ` ${more[1]}`;
    else current = null;
  });
  for (const rule of rules.values()) rule.plain = plain(rule.text);
  return { rules, bands: readBandTable(guide) };
}

// The band table opens Appendix A: `light grey 15,3 · dark grey 13,3 · …`. A name
// written `yellow/gold` is the canonical name and one alias.
export function readBandTable(guide = readFileSync(GUIDE, 'utf8')) {
  const head = guide.split('## Appendix A')[1]?.split('###')[0] ?? '';
  const bands = new Map();
  for (const [, names, lane] of head.matchAll(/([a-z][a-z\- ]*(?:\/[a-z][a-z\- ]*)?) (\d+,\d+)/g)) {
    const [name, ...aliases] = names.trim().split('/').map((n) => n.trim());
    bands.set(name, { name, lane, aliases });
  }
  return bands;
}

// The ids a rule's text refers to, e.g. `(M83)` or `Fungi: M72`.
export const referencedIds = (text) => [...new Set([...text.matchAll(/(?<![\w-])([A-Z]\d+[a-z]?|\d+[a-z])(?![\w,])/g)].map((m) => m[1]))];

export const readRules = (guide) => readGuide(guide).rules;
