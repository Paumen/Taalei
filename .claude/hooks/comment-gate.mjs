import { readFileSync, existsSync } from 'node:fs';
import { extname } from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8'));
const t = input.tool_input ?? {};
const file = t.file_path ?? '';

const styles = {
  '.js': 'c', '.mjs': 'c', '.cjs': 'c', '.ts': 'c',
  '.css': 'css',
  '.html': 'html', '.htm': 'html',
  '.sh': 'sh', '.bash': 'sh', '.py': 'sh',
};
const style = styles[extname(file).toLowerCase()];
if (!style || /(^|\/)vendor\//.test(file)) process.exit(0);

const allowed = /QUIRK:|SPDX-License-Identifier|copyright|\blicen[cs]e\b/i;

function isComment(line) {
  const lead = line.trimStart();
  if (style === 'html' && (lead.startsWith('//') || lead.startsWith('/*'))) return true;
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    const at = (s) => line.startsWith(s, i);
    if (style === 'c' && (at('//') || at('/*'))) return true;
    if (style === 'css' && at('/*')) return true;
    if (style === 'html' && at('<!--')) return true;
    if (style === 'sh' && ch === '#' && line[i + 1] !== '!' && (i === 0 || /\s/.test(line[i - 1]))) return true;
  }
  return false;
}

const comments = (text) => (text ?? '').split('\n').filter(isComment).map((l) => l.trim());

let before = '';
let after = '';
if (input.tool_name === 'Write') {
  before = existsSync(file) ? readFileSync(file, 'utf8') : '';
  after = t.content;
} else if (input.tool_name === 'Edit') {
  before = t.old_string;
  after = t.new_string;
} else if (input.tool_name === 'MultiEdit') {
  before = (t.edits ?? []).map((e) => e.old_string).join('\n');
  after = (t.edits ?? []).map((e) => e.new_string).join('\n');
}

const left = new Map();
for (const c of comments(before)) left.set(c, (left.get(c) ?? 0) + 1);
const added = comments(after).filter((c) => {
  const n = left.get(c) ?? 0;
  if (n > 0) { left.set(c, n - 1); return false; }
  return !allowed.test(c);
});

if (added.length) {
  const reason = `Canon C06: no new comments in code files. Remove these, or tag one QUIRK: if it is likely to bite later:\n${added.slice(0, 5).join('\n')}`;
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
}
