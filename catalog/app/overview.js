import { buildLimits, KIND_FIELDS, idUnder } from '../../lint/rules.mjs';

const load = (path) => fetch(path).then((r) => (r.ok ? r.json() : null)).catch(() => null);

const [catalog, packs, curves, kinds, measures, vars] = await Promise.all([
  load('../build/catalog.json'),
  load('../build/packs.json'),
  load('../build/size-curves.json'),
  load('../../lint/kinds.json'),
  load('../../lint/measures.json'),
  load('../../lint/variables.json'),
]);

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const DASH = '<span class="muted">—</span>';
const extra = (n, title) => (n ? ` <span class="extra" title="${esc(title)}">+${n}</span>` : '');
const breakdown = (counts, label = (k) => k) =>
  Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${label(k)} ×${n}`).join(' · ');

function majority(counts) {
  const entries = Object.entries(counts ?? {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const total = entries.reduce((s, [, n]) => s + n, 0);
  if (!entries.length) return { key: null, rest: 0 };
  return { key: entries[0][0], rest: total - entries[0][1] };
}

function kitRows() {
  const slope = new Map((curves?.kits ?? []).map((k) => [k.kit, k]));
  const packsOf = (slug) => (packs ?? []).filter((p) => p.kit === slug);

  return catalog.kits.map((kit) => {
    const own = (kit.members?.map((m) => m.slug) ?? [kit.slug]).flatMap(packsOf);
    const origins = Object.keys(kit.origins ?? {}).filter((o) => o !== 'none');
    const sources = kit.packs?.length ? kit.packs : origins;
    const formats = [...new Set(own.flatMap((p) => p.format))];
    const inSource = own.length && own.every((p) => p.inSource != null)
      ? own.reduce((s, p) => s + p.inSource, 0) : null;

    const scale = majority(kit.scales);
    const scaleValue = scale.key === null || scale.key === 'none' ? null : Number(scale.key);

    const smoothTotal = Object.values(kit.smooth ?? {}).reduce((s, n) => s + n, 0);
    const flat = kit.smooth?.none ?? 0;
    const smoothed = smoothTotal - flat;
    const angles = Object.fromEntries(Object.entries(kit.smooth ?? {}).filter(([k]) => k !== 'none'));
    const angle = majority(angles);
    const fit = slope.get(kit.slug);

    return {
      kit: kit.slug,
      members: kit.members?.map((m) => m.slug) ?? null,
      url: kit.url,
      artist: kit.artist ?? null,
      source: sources.join(', ') || null,
      license: kit.licenseLabel ?? null,
      scale: scaleValue,
      scaleRest: scale.rest,
      scaleTitle: breakdown(kit.scales ?? {}),
      count: kit.count ?? null,
      inSource,
      format: formats.join(', ') || null,
      smooth: smoothTotal ? (smoothed >= flat ? 'Yes' : 'No') : null,
      smoothRest: Math.min(smoothed, flat),
      smoothTitle: `${smoothed} smoothed · ${flat} not`,
      angle: angle.key === null ? null : Number(angle.key),
      angleRest: angle.rest,
      angleTitle: breakdown(angles, (k) => `${k}°`),
      slope: fit?.slope ?? null,
      scatter: fit?.scatter ?? null,
      kitSize: kit.kitCheck?.factor ?? null,
      kitSizeLevel: kit.kitCheck?.level ?? null,
      kitSizeKinds: kit.kitCheck?.kinds ?? null,
    };
  });
}

const KIT_COLUMNS = [
  { key: 'kit', label: 'Kit', cell: (r) => (r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.kit)}</a>` : esc(r.kit))
    + (r.members ? ` <span class="extra" title="collection of ${r.members.length} kits">${r.members.map(esc).join(' + ')}</span>` : '') },
  { key: 'artist', label: 'Artist' },
  { key: 'source', label: 'Source', wrap: true },
  { key: 'license', label: 'License' },
  { key: 'scale', label: 'Scale', num: true, cell: (r) => (r.scale === null ? DASH : r.scale + extra(r.scaleRest, r.scaleTitle)) },
  { key: 'count', label: 'In catalog', num: true },
  { key: 'inSource', label: 'In source', num: true },
  { key: 'format', label: 'Format' },
  { key: 'smooth', label: 'Auto smooth', cell: (r) => (r.smooth === null ? DASH : r.smooth + extra(r.smoothRest, r.smoothTitle)) },
  { key: 'angle', label: 'Angle °', num: true, cell: (r) => (r.angle === null ? DASH : r.angle + extra(r.angleRest, r.angleTitle)) },
  { key: 'slope', label: 'Slope', num: true, cell: (r) => (r.slope === null ? DASH : r.slope.toFixed(2)) },
  { key: 'scatter', label: 'Scatter', num: true, cell: (r) => (r.scatter === null ? DASH : r.scatter.toFixed(2)) },
  { key: 'kitSize', label: 'Kit size', num: true, cell: (r) => (r.kitSize === null ? DASH
    : `<span title="median over ${r.kitSizeKinds} kinds">×${r.kitSize.toFixed(2)}</span>${r.kitSizeLevel ? ` <span class="extra">${r.kitSizeLevel}</span>` : ''}`) },
];

function sortableTable(table, columns, rows, initial) {
  let sortKey = initial;
  let asc = true;

  const compare = (a, b) => {
    const x = a[sortKey];
    const y = b[sortKey];
    if (x === null && y === null) return a.kit.localeCompare(b.kit);
    if (x === null) return 1;
    if (y === null) return -1;
    const d = typeof x === 'number' ? x - y : String(x).localeCompare(String(y));
    return (asc ? d : -d) || a.kit.localeCompare(b.kit);
  };

  const draw = () => {
    const head = columns.map((c) => {
      const sort = c.key === sortKey ? ` aria-sort="${asc ? 'ascending' : 'descending'}"` : '';
      return `<th class="${c.num ? 'n' : ''}"${sort}><button type="button" data-k="${c.key}">${c.label}</button></th>`;
    }).join('');
    const body = [...rows].sort(compare).map((r) => `<tr>${columns.map((c) => {
      const v = c.cell ? c.cell(r) : (r[c.key] === null ? DASH : esc(r[c.key]));
      return `<td class="${[c.num && 'n', c.wrap && 'wrapt'].filter(Boolean).join(' ')}">${v}</td>`;
    }).join('')}</tr>`).join('');
    table.innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>`;
  };

  table.addEventListener('click', (e) => {
    const key = e.target.closest('th button')?.dataset.k;
    if (!key) return;
    asc = key === sortKey ? !asc : true;
    sortKey = key;
    draw();
  });
  draw();
}

const kindTerms = (expr) => (expr ?? '').split(/[|&]/).map((t) => t.trim().replace(/^!/, ''))
  .filter((t) => t.startsWith('kind:')).map((t) => t.slice(5));

const rowText = (row) => `${row.id} ${row.field} ${row.assert} ${Array.isArray(row.value) ? row.value.join('–') : row.value}`;

function exemptionsByKind() {
  const scopes = new Map();
  const rows = new Map();
  const add = (map, kind, text) => map.set(kind, [...(map.get(kind) ?? []), text]);
  const walk = (node, path) => {
    for (const [key, value] of Object.entries(node ?? {})) {
      if (key === 'exemptKinds' && Array.isArray(value)) {
        for (const kind of value) add(scopes, kind, path || 'limits');
      } else if (value && typeof value === 'object' && !Array.isArray(value)) walk(value, path ? `${path}.${key}` : key);
    }
  };
  walk(vars, '');
  for (const row of measures?.rows ?? []) {
    for (const kind of kindTerms(row.except)) add(rows, kind, row.id);
  }
  const out = new Map();
  for (const kind of new Set([...scopes.keys(), ...rows.keys()])) {
    out.set(kind, [
      scopes.has(kind) && `exempt from ${scopes.get(kind).join(', ')}`,
      rows.has(kind) && `exempt from ${rows.get(kind).join(', ')}`,
    ].filter(Boolean));
  }
  return out;
}

function rulesByKind() {
  const out = new Map();
  for (const row of measures?.rows ?? []) {
    for (const kind of kindTerms(row.when)) out.set(kind, [...(out.get(kind) ?? []), rowText(row)]);
  }
  return out;
}

const OWN_SKIP = new Set(['id', 'nouns', 'children', 'high.min', 'high.max', 'longest.min', 'longest.max', 'tpu.max', ...KIND_FIELDS]);
const scaleRule = (value) => {
  if (typeof value === 'number') return `×${value}`;
  const fields = Object.entries(value);
  if (!fields.length) return 'no limits yet';
  const measures = [...new Set(fields.map(([f]) => f.split('.')[0]))];
  return measures.map((m) => `${m} ${value[`${m}.min`] ?? '…'}–${value[`${m}.max`] ?? '…'}`).join(', ');
};

const ownRules = (node) => Object.entries(node).filter(([k]) => !OWN_SKIP.has(k)).map(([k, v]) => {
  if (k === 'has') return `has ${v.map((alt) => (Array.isArray(alt) ? alt.join(' | ') : alt)).join(' & ')}`;
  if (k === 'scale') return `scale ${Object.entries(v).map(([name, rule]) => `${name} ${scaleRule(rule)}`).join(', ')}`;
  if (k === 'defaults') return `defaults ${Object.entries(v).map(([field, value]) => `${field} ${value}`).join(', ')}`;
  return `${k} ${Array.isArray(v) ? v.join(', ') : v}`;
});

function kindTree() {
  const limits = buildLimits(kinds);
  const bandsMax = buildLimits(kinds, KIND_FIELDS);
  const curveOf = new Map((curves?.kinds ?? []).map((k) => [k.kind, k]));
  const rules = rulesByKind();
  const exempt = exemptionsByKind();
  const models = catalog.models;

  const rows = [];
  const walk = (node, depth, parent) => {
    const inTree = models.filter((m) => idUnder(m.kind, node.id));
    rows.push({
      id: node.id,
      depth,
      parent,
      leaf: !node.children?.length,
      own: models.filter((m) => m.kind === node.id).length,
      total: inTree.length,
      kits: new Set(inTree.map((m) => m.collection ?? m.kit)).size,
      limits: limits.get(node.id),
      bands: bandsMax.get(node.id)['bands.max'],
      curve: curveOf.get(node.id),
      rules: [...ownRules(node), ...(rules.get(node.id) ?? [])],
      exempt: exempt.get(node.id) ?? [],
    });
    for (const child of node.children ?? []) walk(child, depth + 1, node.id);
  };
  for (const root of kinds.kinds) walk(root, 0, null);
  return rows;
}

function limitCell(limits, id, lo, hi) {
  const part = (f) => {
    const l = limits[f];
    return l.from === id ? `<b>${l.value}</b>` : `<span class="muted" title="from ${esc(l.from)}">${l.value}</span>`;
  };
  const hasLo = Boolean(limits?.[lo]);
  const hasHi = Boolean(limits?.[hi]);
  if (hasLo && hasHi) return `${part(lo)} – ${part(hi)}`;
  if (hasLo) return `≥ ${part(lo)}`;
  if (hasHi) return `≤ ${part(hi)}`;
  return DASH;
}

function tpuCell(limits, id) {
  const l = limits?.['tpu.max'];
  if (!l) return DASH;
  return l.from === id ? `<b>${l.value}</b>` : `<span class="muted" title="from ${esc(l.from)}">${l.value}</span>`;
}

function curveCell(c) {
  if (!c) return DASH;
  if (!c.curve) return `No <span class="extra">${esc(c.reason)}</span>`;
  const scale = c.scale ? Object.entries(c.scale).map(([k, v]) => `${k} ${v} m`).join(', ') : '';
  const base = c.real === undefined ? '' : `${c.real} m`;
  const size = c.storeys ? 'storeys' : `${[base, scale].filter(Boolean).join(' · ')}${c.high ? ' high' : ''}`;
  return `Yes <span class="extra">${size}</span>`;
}

function drawKinds(table, rows) {
  const open = new Set(rows.filter((r) => r.depth === 0).map((r) => r.id));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const visible = (r) => {
    for (let p = r.parent; p; p = byId.get(p).parent) if (!open.has(p)) return false;
    return true;
  };
  const defaultBands = kinds.defaults?.['bands.max'];

  const head = ['Kind', 'Models', 'Kits', 'High m', 'Longest m', 'TPU max', 'Bands max', 'Size curve', 'Lint rules', 'Exceptions']
    .map((h, i) => `<th class="${[1, 2, 5, 6].includes(i) ? 'n' : ''}">${h}</th>`).join('');

  const draw = () => {
    const body = rows.filter(visible).map((r) => {
      const name = r.id.split('-').at(-1);
      const arrow = r.leaf ? '' : (open.has(r.id) ? '▾' : '▸');
      const bands = r.bands
        ? (r.bands.from === r.id || r.bands.value !== defaultBands
          ? `<span class="afwijk" title="set on ${esc(r.bands.from)}">${r.bands.value}</span>`
          : `<span class="muted">${r.bands.value}</span>`)
        : DASH;
      const chips = (list, cls = '') => list.map((t) => `<span class="chip ${cls}">${esc(t)}</span>`).join('') || '';
      const models = r.own && r.own !== r.total ? `${r.total} <span class="extra" title="own">${r.own}</span>` : String(r.total);
      return `<tr data-id="${esc(r.id)}">`
        + `<td class="${r.leaf ? '' : 'boom'}" ${r.leaf ? '' : 'tabindex="0"'} title="${esc(r.id)}" style="padding-left:${r.depth * 14}px"><span class="pijl">${arrow}</span>${esc(name)}</td>`
        + `<td class="n">${r.total ? models : DASH}</td>`
        + `<td class="n">${r.kits || DASH}</td>`
        + `<td>${limitCell(r.limits, r.id, 'high.min', 'high.max')}</td>`
        + `<td>${limitCell(r.limits, r.id, 'longest.min', 'longest.max')}</td>`
        + `<td class="n">${tpuCell(r.limits, r.id)}</td>`
        + `<td class="n">${bands}</td>`
        + `<td>${curveCell(r.curve)}</td>`
        + `<td class="wrapt">${chips(r.rules)}</td>`
        + `<td class="wrapt">${chips(r.exempt, 'uit')}</td>`
        + '</tr>';
    }).join('');
    table.innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>`;
  };

  const toggle = (id) => {
    if (open.has(id)) open.delete(id);
    else open.add(id);
    draw();
    table.querySelector(`tr[data-id="${CSS.escape(id)}"] .boom`)?.focus();
  };
  table.addEventListener('click', (e) => {
    const cell = e.target.closest('.boom');
    if (cell) toggle(cell.parentElement.dataset.id);
  });
  table.addEventListener('keydown', (e) => {
    const cell = e.target.closest('.boom');
    if (cell && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      toggle(cell.parentElement.dataset.id);
    }
  });
  document.getElementById('alles-open').addEventListener('click', () => {
    for (const r of rows) if (!r.leaf) open.add(r.id);
    draw();
  });
  document.getElementById('alles-dicht').addEventListener('click', () => {
    open.clear();
    for (const r of rows) if (r.depth === 0) open.add(r.id);
    draw();
  });
  draw();
}

const kitList = kitRows();
sortableTable(document.getElementById('kits'), KIT_COLUMNS, kitList, 'kit');
const kindList = kindTree();
drawKinds(document.getElementById('kinds'), kindList);

const counts = {
  kits: `${kitList.length} kits · ${catalog.models.length} models`,
  kinds: `${kindList.length} kinds`,
};
const TABS = ['kits', 'kinds'];
function pick(name) {
  for (const t of TABS) {
    document.getElementById(`tab-${t}`).setAttribute('aria-selected', String(t === name));
    document.getElementById(`panel-${t}`).hidden = t !== name;
  }
  document.getElementById('telling').textContent = counts[name];
  history.replaceState(null, '', `#${name}`);
}
for (const t of TABS) document.getElementById(`tab-${t}`).addEventListener('click', () => pick(t));
pick(TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'kits');
