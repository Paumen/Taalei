import { pendingCount, clearEdits, allEdits, onChange as onTagEdit } from './tag-edits.js?v=32123776ef';
import { markCount, clearMarks, allMarks, onChange as onMark } from './color-edits.js?v=32123776ef';
import { commentCount, clearComments, allComments, allViews, onChange as onComment } from './comments.js?v=32123776ef';

const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.content ?? '';

const NOTE = [
  'One extract per session, whatever was staged in the browser.',
  '"tags" holds the tag and kind edits: per tag, "add" ids join that tag\'s "models" in catalog/tags.json and "remove" ids leave it.',
  '"colours" holds colour marks per model, keyed by the hex the panel shows: "partial" is partly wrong, "wrong" is the wrong colour outright, "add" is a band the model does not carry and should.',
  '"comments" holds one free-text note per model.',
  '"views" holds, per commented model, the angle the panel was showing when the note was written: "view" and "fov" go straight to tools/renders/render.mjs --views and --fov, "zoom" is how far in the view was against the framing the panel chose, so above about 1.3 the note is about a detail, and "orbit" is what the panel reported.',
  '"swipe" holds the swipe run: the label of every direction with the paths judged that way.',
].join(' ');

const timeStamp = () => new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);

let ownSections = () => ({});
let ownCounts = () => [];

export function setPageParts({ sections = () => ({}), counts = () => [] } = {}) {
  ownSections = sections;
  ownCounts = counts;
}

const staged = () => {
  const out = {};
  const tags = allEdits();
  const colours = allMarks();
  const comments = allComments();
  const views = allViews();
  if (Object.keys(tags).length) out.tags = tags;
  if (Object.keys(colours).length) out.colours = colours;
  if (Object.keys(comments).length) out.comments = comments;
  if (Object.keys(views).length) out.views = views;
  return out;
};

export function buildExtract() {
  const page = document.title;
  const own = ownSections();
  return {
    tool: 'taalei catalog extract',
    page,
    version: meta('catalogus-versie'),
    built: meta('catalogus-gebouwd'),
    created: new Date().toISOString(),
    note: NOTE,
    ...staged(),
    ...own,
  };
}

const counts = () => [
  { n: pendingCount(), one: 'tag edit', many: 'tag edits' },
  { n: markCount(), one: 'colour mark', many: 'colour marks' },
  { n: commentCount(), one: 'comment', many: 'comments' },
  ...ownCounts(),
];

export const extractCount = () => counts().reduce((sum, part) => sum + part.n, 0);

export function downloadExtract() {
  const blob = new Blob([JSON.stringify(buildExtract(), null, 1) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `taalei-extract-${timeStamp()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function mountExtractBar() {
  const bar = document.querySelector('#extract-balk');
  if (!bar) return () => {};
  const label = document.querySelector('#extract-balk-telling');
  const downloadButton = document.querySelector('#extract-balk-download');
  const clearButton = document.querySelector('#extract-balk-wis');

  function refresh() {
    const parts = counts().filter((part) => part.n > 0);
    bar.hidden = parts.length === 0;
    if (label) {
      label.textContent = parts
        .map((part) => `${part.n} ${part.n === 1 ? part.one : part.many}`)
        .join(' · ');
    }
  }

  downloadButton?.addEventListener('click', () => downloadExtract());
  clearButton?.addEventListener('click', () => {
    if (pendingCount() + markCount() + commentCount() === 0) return;
    if (!confirm('Clear the staged tag edits, colour marks and comments? Nothing in the catalog changes either way.')) return;
    clearEdits();
    clearMarks();
    clearComments();
  });

  for (const on of [onTagEdit, onMark, onComment]) on(refresh);
  refresh();
  return refresh;
}
