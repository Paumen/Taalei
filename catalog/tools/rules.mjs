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

// A rule as a table row: `| **M12** | `PE` 🔴 | cells… |` opens a rule, `| M12 | | cells… |`
// adds a row to it. Column names come from the table's header row.
const TABLE_ROW = /^\|(.*)\|$/;
const STATUS_CELL = /^`(FE|PE|FW|PW|--)` (🟢|🔴|⚪)$/u;

// A rule id: block letter, number, optional letter suffix (M18b). The guide's own
// grammar; the check in rule-status reports every id that does not fit it.
export const ID_PATTERN = /^[A-Z]\d+[a-z]?$/;

// Section C is one row per band, derived from the rows of M (rule-status writes it).
export const C_BANDS = {
  C1: ['light grey'], C2: ['blue-grey'], C3: ['light blue-grey'], C4: ['blue'], C5: ['yellow'],
  C6: ['dark red'], C7: ['dark green'], C8: ['light green'], C9: ['light brown', 'mid brown', 'dark brown'],
  C10: ['bark'], C11: ['clear glass'], C12: ['taupe'], C13: ['off-white'], C14: ['terracotta'], C15: ['dark grey'],
};

// markdown to plain: no backticks, no bold
export const plain = (text) => text.replace(/`/g, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

const splitCells = (line) => TABLE_ROW.exec(line)[1].split('|').map((c) => c.trim());
const listOf = (cell) => (cell ? cell.split(',').map((s) => s.trim()).filter(Boolean) : []);

// One row of M or C as a sentence, so --explain, the index and the 140-char limit read
// a table rule like a line rule. A kind or material repeated from the row above is said
// once; the rule's text is its rows joined.
export function rowText(cells, above = null) {
  if ('takes' in cells) return `${cells.band}: ${cells.takes}`;
  const same = (key) => above && cells[key] && cells[key] === above[key];
  const subject = [same('kind') ? '' : cells.kind, cells.part].filter(Boolean).join(' · ');
  const target = cells.bands || cells.material;
  const material = cells.bands && !same('material') ? cells.material : '';
  const head = [subject, material].filter(Boolean).join(' · ');
  return `${head ? `${head} → ` : ''}${target}${cells.note ? ` (${cells.note})` : ''}`;
}
export const rulesText = (rows) => rows.map((row, i) => rowText(row, rows[i - 1] ?? null)).join('; ');

export function readGuide(guide = readFileSync(GUIDE, 'utf8')) {
  const lines = guide.split('\n');
  const rules = new Map();
  let section = '';
  let block = '';
  let appendix = '';
  let current = null;
  let columns = null;
  lines.forEach((line, index) => {
    if (line.startsWith('## ')) {
      section = line.slice(3).trim();
      block = '';
      appendix = /^Appendix ([A-Z])/.exec(section)?.[1] ?? '';
      current = null;
      columns = null;
      return;
    }
    if (line.startsWith('### ')) {
      block = line.slice(4).trim();
      current = null;
      columns = null;
      return;
    }
    const rule = RULE_LINE.exec(line);
    if (rule) {
      const [, id, code, light, text] = rule;
      current = { id, code, light, text, section, block, appendix, line: index + 1 };
      rules.set(id, current);
      return;
    }
    if (TABLE_ROW.test(line)) {
      const cells = splitCells(line);
      if (cells[0] === 'id') { columns = cells; current = null; return; }
      if (!columns || /^-+$/.test(cells[0])) return;
      const opens = /^\*\*(.+)\*\*$/.exec(cells[0]);
      const id = opens ? opens[1] : cells[0];
      const named = Object.fromEntries(columns.map((c, i) => [c, cells[i] ?? '']));
      const row = { ...named, id, line: index + 1 };
      row.bandList = listOf(named.bands);
      if (opens) {
        const status = STATUS_CELL.exec(named.status) ?? [null, '--', '⚪'];
        // a table with a `takes` column is section C, written by rule-status, not authored
        current = { id, code: status[1], light: status[2], text: '', rows: [], generated: columns.includes('takes'), section, block, appendix, line: index + 1 };
        rules.set(id, current);
      } else if (!current || current.id !== id) { current = null; return; }
      current.rows.push(row);
      current.text = rulesText(current.rows);
      return;
    }
    const more = current && !current.rows && CONTINUATION.exec(line);
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

// Section C from the rows of M: for each band, what takes it — the row's material, or
// its part, or its kind — with the ids that say so. Rows open to any colour are left out.
export function deriveC(rules) {
  const byBand = new Map();
  for (const rule of rules.values()) {
    if (!rule.rows || !rule.id.startsWith('M')) continue;
    for (const row of rule.rows) {
      const label = row.material || row.part || row.kind;
      for (const band of row.bandList) {
        if (band === 'any') continue;
        const list = byBand.get(band) ?? new Map();
        list.set(label, [...new Set([...(list.get(label) ?? []), rule.id])]);
        byBand.set(band, list);
      }
    }
  }
  const takes = (band) => [...(byBand.get(band) ?? [])].map(([label, ids]) => `${label} (${ids.join(', ')})`).join(', ');
  return Object.entries(C_BANDS).flatMap(([id, bands]) => bands.map((band) => ({ id, band, takes: takes(band) })));
}

// The ids a rule's text refers to, e.g. `(M83)` or `Fungi: M72`.
export const referencedIds = (text) => [...new Set([...text.matchAll(/(?<![\w-])([A-Z]\d+[a-z]?|\d+[a-z])(?![\w,])/g)].map((m) => m[1]))];

export const readRules = (guide) => readGuide(guide).rules;
