export const LIMIT_FIELDS = ['high.min', 'high.max', 'longest.min', 'longest.max'];

const EPSILON = 1e-9;
const MAT_PREFIX = 'mat.';

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

const depthOf = (id) => id.split('-').length;

export function kindBandRulesFor(kind, rows) {
  const byMaterial = new Map();
  for (const row of rows) {
    const from = row.kinds.filter((k) => idUnder(kind, k)).sort((a, b) => depthOf(b) - depthOf(a))[0];
    if (!from) continue;
    const current = byMaterial.get(row.material);
    if (current && depthOf(current.from) >= depthOf(from)) continue;
    byMaterial.set(row.material, { id: row.id, bands: row.bands, from });
  }
  return byMaterial;
}

export function kindBandFindingsFor(model, rules, palettes, materialIds, vars) {
  const out = [];
  const used = Object.keys(model.spread ?? {});
  const mats = materialsOf(model, materialIds, vars);
  for (const [family, row] of rules) {
    const present = mats.filter((m) => idUnder(m, family));
    if (!present.length) continue;
    const lanes = row.bands.map((band) => palettes.lanes.get(band));
    if (lanes.some((lane) => lane === null || used.includes(lane))) continue;
    out.push({
      rule: row.id,
      from: row.from,
      material: present.join(' '),
      wants: row.bands.join(' '),
      has: used.map((lane) => palettes.names.get(lane) ?? lane).join(' ') || '—',
    });
  }
  return out;
}

export const isExempt = (model, vars) =>
  vars.exemptKinds.some((k) => idUnder(model.kind, k))
  || (model.tags ?? []).some((t) => vars.exemptTags.includes(t));

export function findingsFor(model, limits, vars) {
  const out = [];
  const measures = { high: model.wdh[2], longest: Math.max(...model.wdh) };
  for (const [field, { value: limit, from }] of Object.entries(limits ?? {})) {
    const [measure, bound] = field.split('.');
    const value = measures[measure];
    const deviation = bound === 'min' ? (limit - value) / limit : (value - limit) / limit;
    if (deviation <= EPSILON) continue;
    out.push({
      level: deviation <= vars.warnBand + EPSILON ? 'warning' : 'error',
      measure, value, bound, limit, from,
    });
  }
  return out;
}
