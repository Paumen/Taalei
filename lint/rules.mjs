export const LIMIT_FIELDS = ['high.min', 'high.max', 'longest.min', 'longest.max'];

const EPSILON = 1e-9;

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
