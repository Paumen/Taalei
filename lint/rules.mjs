export const LIMIT_FIELDS = ['high.min', 'high.max', 'longest.min', 'longest.max', 'tpu.max'];

const EPSILON = 1e-9;
const MAT_PREFIX = 'mat.';
const BAND = 'band';

export const idUnder = (id, ancestor) => id === ancestor || Boolean(id?.startsWith(`${ancestor}-`));

export function buildLimits(kinds) {
  const own = new Map();
  const parent = new Map();
  const walk = (node, from) => {
    own.set(node.id, Object.fromEntries(
      LIMIT_FIELDS.filter((f) => node[f] !== undefined).map((f) => [f, node[f]]),
    ));
    parent.set(node.id, from);
    for (const child of node.children ?? []) walk(child, node.id);
  };
  for (const root of kinds.kinds) walk(root, null);

  const chainOf = (id) => {
    const out = [];
    for (let at = id; at; at = parent.get(at)) out.push(at);
    return out;
  };

  const limits = new Map();
  for (const id of own.keys()) {
    const chain = chainOf(id);
    const out = {};
    for (const field of LIMIT_FIELDS) {
      const from = chain.find((at) => own.get(at)?.[field] !== undefined);
      if (from) out[field] = { value: own.get(from)[field], from };
      else if (kinds.defaults?.[field] !== undefined) out[field] = { value: kinds.defaults[field], from: 'defaults' };
    }
    limits.set(id, out);
  }
  return limits;
}

export function buildMaterialRules(kinds) {
  const own = new Map();
  const parent = new Map();
  const walk = (node, from) => {
    own.set(node.id, {
      subtype: Object.entries(node)
        .filter(([key]) => key.startsWith(MAT_PREFIX))
        .map(([key, required]) => [key.slice(MAT_PREFIX.length), required]),
      has: (node.has ?? []).map((entry) => (Array.isArray(entry) ? entry : [entry])),
    });
    parent.set(node.id, from);
    for (const child of node.children ?? []) walk(child, node.id);
  };
  for (const root of kinds.kinds) walk(root, null);

  const rules = new Map();
  for (const id of own.keys()) {
    const subtype = new Map();
    const has = [];
    const seen = new Set();
    for (let at = id; at; at = parent.get(at)) {
      for (const [family, required] of own.get(at).subtype) {
        if (!subtype.has(family)) subtype.set(family, { required, from: at });
      }
      for (const any of own.get(at).has) {
        const key = any.join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        has.push({ any, from: at });
      }
    }
    rules.set(id, { subtype, has });
  }
  return rules;
}

export function materialsOf(model, materialIds, vars) {
  const ignored = vars.mat.ignoreMaterials;
  return (model.tags ?? []).filter((t) => materialIds.has(t) && !ignored.includes(t));
}

export function materialFindingsFor(model, rules, materialIds, vars) {
  const out = [];
  const mats = materialsOf(model, materialIds, vars);
  for (const [family, { required, from }] of rules?.subtype ?? []) {
    const present = mats.filter((m) => idUnder(m, family));
    if (!present.length || present.some((m) => idUnder(m, required))) continue;
    out.push({ family, required, from, present: present.join(' ') });
  }
  for (const { any, from } of rules?.has ?? []) {
    if (mats.some((m) => any.some((id) => idUnder(m, id)))) continue;
    out.push({ family: '—', required: any.join(' or '), from, present: mats.join(' ') || '—' });
  }
  return out;
}

export function buildPalettes(materials, vars) {
  const lanes = new Map(Object.entries(materials.bands));
  const names = new Map([...lanes].map(([band, lane]) => [lane, band]));
  const rows = [];
  const walk = (node) => {
    if (node.bands) rows.push({ mat: node.id, size: null, bands: node.bands });
    for (const child of node.children ?? []) walk(child);
  };
  for (const root of materials.materials) walk(root);
  for (const [mat, bySize] of Object.entries(vars.palette.sizeBands ?? {})) {
    for (const [size, bands] of Object.entries(bySize)) rows.push({ mat, size, bands });
  }
  rows.sort((a, b) => b.mat.length - a.mat.length);
  return { lanes, names, rows };
}

export function paletteOf(material, size, palettes) {
  const rows = palettes.rows.filter((row) => idUnder(material, row.mat));
  const row = rows.find((r) => r.size === size) ?? rows.find((r) => r.size === null);
  if (!row) return null;
  return { bands: row.bands, lanes: row.bands.map((band) => palettes.lanes.get(band)) };
}

export function paletteFindingsFor(model, palettes, materialIds, vars) {
  const out = [];
  const used = Object.keys(model.spread ?? {});
  for (const material of materialsOf(model, materialIds, vars)) {
    const palette = paletteOf(material, model.size, palettes);
    if (!palette) continue;
    if (palette.lanes.some((lane) => lane === null || used.includes(lane))) continue;
    out.push({
      material,
      wants: palette.bands.join(' '),
      has: used.map((lane) => palettes.names.get(lane) ?? lane).join(' ') || '—',
    });
  }
  return out;
}

export function buildKindBands(kinds) {
  const own = new Map();
  const parent = new Map();
  const walk = (node, from) => {
    own.set(node.id, Object.entries(node)
      .filter(([key]) => key === BAND || key.startsWith(`${BAND}.`))
      .map(([key, bands]) => [key === BAND ? null : key.slice(BAND.length + 1), bands]));
    parent.set(node.id, from);
    for (const child of node.children ?? []) walk(child, node.id);
  };
  for (const root of kinds.kinds) walk(root, null);

  const byKind = new Map();
  for (const id of own.keys()) {
    const byMat = new Map();
    for (let at = id; at; at = parent.get(at)) {
      for (const [mat, bands] of own.get(at)) {
        if (!byMat.has(mat)) byMat.set(mat, { bands, from: at });
      }
    }
    byKind.set(id, byMat);
  }
  return byKind;
}

export function kindBandFindingsFor(model, rules, palettes, materialIds, vars) {
  const out = [];
  const used = Object.keys(model.spread ?? {});
  const mats = materialsOf(model, materialIds, vars);
  for (const [mat, row] of rules ?? []) {
    const present = mat === null ? [] : mats.filter((m) => idUnder(m, mat));
    if (mat !== null && !present.length) continue;
    const lanes = row.bands.map((band) => palettes.lanes.get(band));
    if (lanes.some((lane) => lane === null || used.includes(lane))) continue;
    out.push({
      from: row.from,
      material: present.join(' ') || '—',
      wants: row.bands.join(' '),
      has: used.map((lane) => palettes.names.get(lane) ?? lane).join(' ') || '—',
    });
  }
  return out;
}

const NUMERIC_OPS = {
  '=': (a, b) => a === b,
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
};

export function fieldOf(model, name, materialIds, vars) {
  if (name === 'nmat') return materialsOf(model, materialIds, vars).length;
  if (name === 'bands') return model.bands - ((model.tags ?? []).includes('special') ? 1 : 0);
  return model[name];
}

export function matchTerm(term, model, materialIds, vars) {
  const text = term.trim();
  if (text === '') return false;
  const or = text.split('|');
  if (or.length > 1) return or.some((t) => matchTerm(t, model, materialIds, vars));
  const and = text.split('&');
  if (and.length > 1) return and.every((t) => matchTerm(t, model, materialIds, vars));
  if (text.startsWith('!')) return !matchTerm(text.slice(1), model, materialIds, vars);
  if (text === '*') return true;
  const [, key, op, value] = text.match(/^([a-zA-Z]+)(:|=|>=|<=|>|<)(.+)$/) ?? [];
  if (!key) throw new Error(`term not understood: ${text}`);
  switch (key) {
    case 'kind': return idUnder(model.kind, value);
    case 'mat': {
      const mats = materialsOf(model, materialIds, vars);
      return op === ':' ? mats.some((m) => idUnder(m, value)) : mats.includes(value);
    }
    case 'tag': return (model.tags ?? []).includes(value);
    case 'size': return model.size === value;
    default: return NUMERIC_OPS[op](fieldOf(model, key, materialIds, vars), Number(value));
  }
}

function resolveValue(value, model, materialIds, vars) {
  if (typeof value !== 'string') return value;
  const scaled = value.match(/^([a-zA-Z]+)(?:\s*×\s*([\d.]+))?$/);
  if (scaled) return fieldOf(model, scaled[1], materialIds, vars) * Number(scaled[2] ?? 1);
  const range = value.match(/^([\d.]+)\s*[–-]\s*([\d.]+)$/);
  if (range) return [Number(range[1]), Number(range[2])];
  throw new Error(`value not understood: ${value}`);
}

function holds(assert, actual, wanted) {
  switch (assert) {
    case 'min': return actual >= wanted;
    case 'max': return actual <= wanted;
    case 'range': return actual >= wanted[0] && actual <= wanted[1];
    case 'is': return (actual ?? false) === wanted;
    case 'not': return (actual ?? false) !== wanted;
    default: throw new Error(`assert not understood: ${assert}`);
  }
}

export function measureFindingsFor(model, rows, materialIds, vars) {
  const out = [];
  for (const row of rows) {
    if (!matchTerm(row.when, model, materialIds, vars)) continue;
    if (row.except && matchTerm(row.except, model, materialIds, vars)) continue;
    const actual = fieldOf(model, row.field, materialIds, vars);
    const wanted = resolveValue(row.value, model, materialIds, vars);
    if (holds(row.assert, actual, wanted)) continue;
    out.push({
      rule: row.id,
      field: row.field,
      actual: actual ?? '—',
      wants: `${row.assert} ${Array.isArray(wanted) ? wanted.join('–') : wanted}`,
    });
  }
  return out;
}

export const isExempt = (model, vars) => vars.exemptKinds.some((k) => idUnder(model.kind, k));

export function findingsFor(model, limits, vars) {
  const out = [];
  const measures = { high: model.wdh[2], longest: Math.max(...model.wdh), tpu: model.tpu };
  const tags = model.tags ?? [];
  for (const [field, { value: limit, from }] of Object.entries(limits ?? {})) {
    const [measure, bound] = field.split('.');
    const value = measures[measure];
    if (value === null || value === undefined) continue;
    if (tags.some((t) => (vars[measure]?.exemptTags ?? vars.exemptTags).includes(t))) continue;
    const deviation = bound === 'min' ? (limit - value) / limit : (value - limit) / limit;
    if (deviation <= EPSILON) continue;
    out.push({
      level: deviation <= vars.warnBand + EPSILON ? 'warning' : 'error',
      measure, value, bound, limit, from,
    });
  }
  return out;
}
