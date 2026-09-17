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

const oneTerm = (term, model, mats) => {
  if (term.startsWith('!')) return !oneTerm(term.slice(1).trim(), model, mats);
  if (term === '*') return true;
  if (term.startsWith('kind:')) return idUnder(model.kind, term.slice(5));
  if (term.startsWith('mat:')) return [...mats].some((id) => idUnder(id, term.slice(4)));
  if (term.startsWith('mat=')) return mats.has(term.slice(4));
  throw new Error(`term outside kind and material ids: ${term}`);
};

export const termMatches = (expr, model, mats) =>
  expr.split('|').some((group) => group.split('&').every((term) => oneTerm(term.trim(), model, mats)));

const tokenMatches = (id, token) => (token.endsWith(':') ? idUnder(id, token.slice(0, -1)) : id === token);

const carried = (subject, mats) =>
  (subject === 'model' ? [...mats] : [...mats].filter((id) => idUnder(id, subject.slice(4)))).sort();

const ASSERTS = {
  is: (have, value) => have.every((id) => tokenMatches(id, value[0])),
  has: (have, value) => have.some((id) => value.some((token) => tokenMatches(id, token))),
  'any-of': (have, value) => have.length > 0 && have.every((id) => value.some((token) => tokenMatches(id, token))),
  min: (have, value) => have.length >= value[0],
};

export function materialFindings(model, mats, rules) {
  const applies = rules.filter((rule) =>
    termMatches(rule.when, model, mats) && !(rule.except && termMatches(rule.except, model, mats)));
  const settled = new Set(applies.filter((rule) => !rule.fallback).map((rule) => rule.subject));

  const out = [];
  for (const rule of applies) {
    if (rule.fallback && settled.has(rule.subject)) continue;
    const have = carried(rule.subject, mats);
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
