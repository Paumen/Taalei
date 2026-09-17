export const LIMIT_FIELDS = ['high.min', 'high.max', 'longest.min', 'longest.max'];

const EPSILON = 1e-9;

export const idUnder = (id, ancestor) => id === ancestor || Boolean(id?.startsWith(`${ancestor}-`));

export function treeIds(roots) {
  const out = new Set();
  const walk = (node) => {
    out.add(node.id);
    for (const child of node.children ?? []) walk(child);
  };
  for (const root of roots) walk(root);
  return out;
}

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

const token = (id, want) => (want.endsWith(':') ? idUnder(id, want.slice(0, -1)) : id === want);

const ASSERTS = {
  is: (have, value) => have.every((id) => token(id, value[0])),
  has: (have, value) => have.some((id) => value.some((want) => token(id, want))),
  'any-of': (have, value) => have.length > 0 && have.every((id) => value.some((want) => token(id, want))),
  min: (have, value) => have.length >= value,
};

export function buildRules(kinds, materials) {
  const ids = treeIds(materials.materials);
  const check = (rule, text) => {
    if (!ids.has(text.replace(/^mat:/, '').replace(/:$/, ''))) throw new Error(`${rule.id}: ${text} is not a material`);
  };

  const rules = new Map();
  const walk = (node, from) => {
    const own = node.materials ?? [];
    for (const rule of own) {
      if (rule.subject !== 'model') check(rule, rule.subject);
      if (rule.assert !== 'min') for (const want of rule.value) check(rule, want);
    }
    const subjects = new Set(own.map((rule) => rule.subject));
    rules.set(node.id, [...own, ...from.filter((rule) => !subjects.has(rule.subject))]);
    for (const child of node.children ?? []) walk(child, rules.get(node.id));
  };
  for (const root of kinds.kinds) walk(root, []);
  return rules;
}

export function materialFindingsFor(model, mats, rules) {
  const out = [];
  for (const rule of rules ?? []) {
    const have = (rule.subject === 'model' ? [...mats] : [...mats].filter((id) => idUnder(id, rule.subject.slice(4)))).sort();
    if (ASSERTS[rule.assert](have, rule.value)) continue;
    out.push({ rule: rule.id, subject: rule.subject, assert: rule.assert, value: rule.value, have });
  }
  return out;
}

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
