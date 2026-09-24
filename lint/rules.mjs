export const LIMIT_FIELDS = ['high.min', 'high.max', 'longest.min', 'longest.max', 'tpu.max'];
export const KIND_FIELDS = ['bands.max'];

const EPSILON = 1e-9;
const MAT_PREFIX = 'mat.';
const BAND = 'band';

export const idUnder = (id, ancestor) => id === ancestor || Boolean(id?.startsWith(`${ancestor}-`));

const SIZE_MEASURES = ['high', 'longest'];
const measureOf = (field) => field.split('.')[0];

export function buildLimits(kinds, fields = LIMIT_FIELDS) {
  const own = new Map();
  const parent = new Map();
  const walk = (node, from) => {
    own.set(node.id, Object.fromEntries(
      fields.filter((f) => node[f] !== undefined).map((f) => [f, node[f]]),
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

  const measuresOf = (at) => new Set(Object.keys(own.get(at) ?? {}).map(measureOf).filter((m) => SIZE_MEASURES.includes(m)));

  const limits = new Map();
  for (const id of own.keys()) {
    const chain = chainOf(id);
    const owner = chain.find((at) => measuresOf(at).size);
    const measures = owner ? measuresOf(owner) : null;
    const out = {};
    for (const field of fields) {
      const other = measures && SIZE_MEASURES.includes(measureOf(field)) && !measures.has(measureOf(field));
      const from = other ? undefined : chain.find((at) => own.get(at)?.[field] !== undefined);
      if (from) out[field] = { value: own.get(from)[field], from };
      else if (kinds.defaults?.[field] !== undefined) out[field] = { value: kinds.defaults[field], from: 'defaults' };
    }
    limits.set(id, out);
  }
  return limits;
}

export const SCALE_PREFIX = 'scale-';

export function buildScales(kinds) {
  const scales = new Map();
  const walk = (node, from) => {
    const at = node.scale ? { config: node.scale, from: node.id } : from;
    scales.set(node.id, at);
    for (const child of node.children ?? []) walk(child, at);
  };
  for (const root of kinds.kinds) walk(root, null);
  return scales;
}

const roundLimit = (v) => Math.round(v * 1e6) / 1e6;

function scaledLimits(limits, tag, scale) {
  const rule = scale?.config[tag.slice(SCALE_PREFIX.length)];
  if (rule === undefined) return null;
  const out = {};
  for (const [field, entry] of Object.entries(limits ?? {})) {
    if (field.startsWith('tpu.')) out[field] = entry;
    else if (typeof rule === 'number' && entry.from === 'defaults') out[field] = entry;
    else if (typeof rule === 'number') out[field] = { value: roundLimit(entry.value * rule), from: `${entry.from} ${tag}` };
    else if (rule[field] !== undefined) out[field] = { value: rule[field], from: `${scale.from} ${tag}` };
    else out[field] = entry;
  }
  if (typeof rule === 'object') {
    for (const [field, value] of Object.entries(rule)) out[field] ??= { value, from: `${scale.from} ${tag}` };
  }
  return out;
}

export function attributeKinds(tagId, vars, scales) {
  const [family, ...rest] = tagId.split('-');
  if (`${family}-` === SCALE_PREFIX) {
    return [...scales].filter(([id, at]) => at?.from === id && at.config[rest.join('-')] !== undefined).map(([id]) => id);
  }
  return vars.attributeKinds?.[family] ?? null;
}

export function scaleTagOf(model) {
  const found = (model.tags ?? []).filter((t) => t.startsWith(SCALE_PREFIX));
  return found.length ? found : null;
}

export function limitsForModel(model, limits, scales) {
  const tags = scaleTagOf(model);
  if (!tags) return { limits };
  if (tags.length > 1) return { refused: tags.join(' '), why: 'one scale value at most' };
  const scaled = scaledLimits(limits, tags[0], scales?.get(model.kind));
  return scaled ? { limits: scaled, scale: tags[0] } : { refused: tags[0], why: 'kind sets no scale' };
}

const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

const rangeOf = (limits) => {
  for (const m of SIZE_MEASURES) {
    const lo = limits?.[`${m}.min`];
    const hi = limits?.[`${m}.max`];
    if (lo && hi && lo.from !== 'defaults' && hi.from !== 'defaults') return { measure: m, lo: lo.value, hi: hi.value };
  }
  return null;
};

export function buildKitScales(models, { vars, limits: kindLimits, scales }) {
  const byKit = new Map();
  for (const m of models) {
    if (!m.kind || isExempt(m, vars) || (m.tags ?? []).some((t) => vars.exemptTags.includes(t))) continue;
    const range = rangeOf(limitsForModel(m, kindLimits.get(m.kind), scales).limits);
    const value = range && (range.measure === 'high' ? m.wdh[2] : Math.max(...m.wdh));
    if (!(value > 0)) continue;
    const group = `${m.kind} ${scaleTagOf(m)?.join(' ') ?? ''}`;
    const kinds = byKit.get(m.kit) ?? new Map();
    kinds.set(group, [...(kinds.get(group) ?? []), Math.log(value / Math.sqrt(range.lo * range.hi))]);
    byKit.set(m.kit, kinds);
  }
  const out = new Map();
  for (const [kit, kinds] of byKit) {
    if (kinds.size < vars.kit.minKinds) continue;
    const offset = median([...kinds.values()].map(median));
    const level = Math.abs(offset) > Math.log(vars.kit.error) + EPSILON ? 'error'
      : Math.abs(offset) > Math.log(vars.kit.warn) + EPSILON ? 'warning' : undefined;
    out.set(kit, { offset, factor: Math.round(Math.exp(offset) * 100) / 100, kinds: kinds.size, level });
  }
  return out;
}

export function buildKindFields(kinds) {
  const byKind = new Map();
  const defaults = Object.fromEntries(KIND_FIELDS.filter((f) => kinds.defaults?.[f] !== undefined)
    .map((f) => [f, { value: kinds.defaults[f], from: 'defaults' }]));
  byKind.set(null, defaults);
  for (const [id, fields] of buildLimits(kinds, KIND_FIELDS)) byKind.set(id, fields);
  return byKind;
}

function withKindFields(model, kindFields) {
  if (!kindFields) return model;
  const fields = kindFields.get(model.kind) ?? kindFields.get(null);
  return {
    ...model,
    ...Object.fromEntries(Object.entries(fields).map(([field, { value }]) => [field.replace('.', ''), value])),
  };
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
  for (const parent of mats) {
    const under = mats.filter((m) => m !== parent && idUnder(m, parent));
    if (under.length) out.push({ family: parent, required: 'no parent tag', from: 'tags', present: [parent, ...under].join(' ') });
  }
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

export function measureFindingsFor(subject, rows, materialIds, vars, kindFields) {
  const model = withKindFields(subject, kindFields);
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
      level: row.level ?? 'error',
    });
  }
  return out;
}

export const isExempt = (model, vars) => vars.exemptKinds.some((k) => idUnder(model.kind, k));

const CHECK_TEXT = {
  size: (f) => (f.measure === 'scale'
    ? `${f.value} not on ${f.limit} (${f.from})`
    : `${f.measure} ${f.value} ${f.bound === 'min' ? 'under min' : 'over max'} ${f.limit} (${f.from})`),
  mat: (f) => `${f.family} needs ${f.required}, has ${f.present} (${f.from})`,
  palette: (f) => `${f.material} wants ${f.wants}, has ${f.has}`,
  bands: (f) => `${f.material} wants ${f.wants}, has ${f.has} (${f.from})`,
  measures: (f) => `${f.rule} ${f.field} ${f.actual} wants ${f.wants}`,
};

export function buildChecks({ vars, kinds, materials, measures }) {
  const materialIds = new Set();
  const collect = (nodes) => {
    for (const node of nodes) {
      materialIds.add(node.id);
      collect(node.children ?? []);
    }
  };
  collect(materials.materials);

  return {
    vars,
    materialIds,
    limits: buildLimits(kinds),
    scales: buildScales(kinds),
    mat: buildMaterialRules(kinds),
    palettes: buildPalettes(materials, vars),
    bands: buildKindBands(kinds),
    measures: measures.rows,
    kindFields: buildKindFields(kinds),
  };
}

export function checkModel(model, checks) {
  const { vars, materialIds } = checks;
  const exempt = (check) => vars[check].exemptKinds.some((k) => idUnder(model.kind, k));
  const found = [];
  const push = (check, level, rows) => {
    for (const row of rows) found.push({ level: level ?? row.level, check, text: CHECK_TEXT[check](row) });
  };

  if (model.kind) {
    if (!isExempt(model, vars)) {
      push('size', null, findingsFor(model, checks.limits.get(model.kind), vars, checks.scales, checks.kitScales?.get(model.kit)));
    }
    if (!exempt('mat')) {
      push('mat', 'error', materialFindingsFor(model, checks.mat.get(model.kind), materialIds, vars));
    }
    if (!exempt('palette')) {
      push('palette', 'error', paletteFindingsFor(model, checks.palettes, materialIds, vars));
    }
    if (!exempt('bands')) {
      push('bands', 'error',
        kindBandFindingsFor(model, checks.bands.get(model.kind), checks.palettes, materialIds, vars));
    }
  }

  const mark = [];
  for (const row of measureFindingsFor(model, checks.measures, materialIds, vars, checks.kindFields)) {
    if (vars.mark.includes(row.rule)) mark.push(row.field);
    else push('measures', row.level, [row]);
  }

  return { lint: found.length ? found : undefined, mark: mark.length ? mark : undefined };
}

export function findingsFor(model, kindLimits, vars, scales, kitScale) {
  const out = [];
  const { limits, refused, why } = limitsForModel(model, kindLimits, scales);
  if (refused) return [{ level: 'error', measure: 'scale', value: refused, bound: 'not on', limit: model.kind, from: why }];
  const kit = kitScale ? Math.exp(kitScale.offset) : 1;
  const kitNote = kitScale ? ` · kit ×${kitScale.factor}` : '';
  const unkit = (v) => Math.round((v / kit) * 1000) / 1000;
  const measures = { high: unkit(model.wdh[2]), longest: unkit(Math.max(...model.wdh)), tpu: model.tpu };
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
      measure, value, bound, limit, from: measure === 'tpu' ? from : from + kitNote,
    });
  }
  return out;
}
