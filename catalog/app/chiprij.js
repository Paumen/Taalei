const SHORT_NAME = {
  obj: 'Obj',
  char: 'Char',
  env: 'Env',
  str: 'Str',
  set: 'Set',
  'env-remains-deadwood': 'Deadwd',
  'env-terrain-rock-formation': 'Formatn',
  'obj-container': 'Contnr',
  'obj-equipment': 'Equip',
  'obj-equipment-apparel': 'Apparel',
  'obj-equipment-apparel-jewellery': 'Jewel',
  'obj-equipment-pocketitem': 'Pocket',
  'obj-equipment-weapon': 'Weapon',
  'obj-equipment-weapon-melee-warhammer': 'Warhmr',
  'obj-equipment-weapon-ranged-crossbow': 'Crossbw',
  'obj-equipment-weapon-siege-ammunition': 'Ammo',
  'obj-food-vegetable': 'Veget',
  'obj-furnishing': 'Furnish',
  'obj-furnishing-furniture-seating': 'Seatng',
  'obj-kitchenware': 'Kitchw',
  'obj-device-appliance': 'Applnce',
  'obj-kitchenware-cookware': 'Cookw',
  'obj-kitchenware-tableware': 'Tablew',
  'obj-furnishing-light': 'Light',
  'obj-resource': 'Resrce',
  'obj-equipment-tool-supplies': 'Suppl',
  'obj-transport': 'Transp',
  'obj-transport-watercraft': 'Watercr',
  'obj-transport-part': 'Accsry',
  'str-building-work-agricultural': 'Agricl',
  'str-building-work-industrial': 'Indust',
  'str-building-religious': 'Relig',
  'str-building-residential': 'Residnt',
  'str-access-platform': 'Platfm',
  ceramic: 'Cerm',
  emissive: 'Emiss',
  foliage: 'Foliag',
  gemstone: 'Gemst',
  leather: 'Leathr',
  'metal-copper': 'Copper',
  'metal-gold': 'Gold',
  'metal-iron': 'Iron',
  'stone-masonry': 'Masonry',
  'stone-rock': 'Rock',
  'stone-soil': 'Soil',
  textile: 'Textil',
  vegetation: 'Vegetn',
  'wood-bark': 'Bark',
  'wood-cardboard': 'Cardbd',
  'wood-beam': 'Beam',
  'wood-log': 'Log',
  'wood-planks': 'Planks',
  'wood-worked': 'Worked',
  kay: 'Kay',
  ken: 'Ken',
  qua: 'Qua',
  aq: 'AQ',
  '3dm': '3DM',
  sq: 'SQ',
  ct: 'CT',
  mab: 'MaB',
  shm: 'Shmig',
  gua: 'Gual',
  pm: 'PM',
  rey: 'Rey',
  ipoly: 'iPoly',
  animation: 'Anim',
  halloween: 'Hallown',
  'robin-hood': 'Robin',
};

export const chipName = (tag) => SHORT_NAME[tag.id] ?? tag.name ?? tag.id;

const VOWEL = /[aeiou]/i;

export function shortChipName(tag, max = 7) {
  const name = chipName(tag);
  if (name.length <= max) return name;
  const letters = [...name.split(/[\s-]/)[0]];
  for (let i = letters.length - 1; letters.length > max && i > 0; i--) {
    if (VOWEL.test(letters[i]) && !VOWEL.test(letters[i - 1])) letters.splice(i, 1);
  }
  return letters.slice(0, max).join('');
}

const PICKED = new Set(['only', 'open']);

export function showChipState(button, state) {
  button.setAttribute('aria-pressed', String(state === 'only'));
  button.classList.toggle('tagknop-open', state === 'open');
  if (state === 'not') button.dataset.uit = '';
  else delete button.dataset.uit;
}

const span = (className) => {
  const el = document.createElement('span');
  el.className = className;
  return el;
};

export function makeChipStrip({
  label, items, container = null, shareRow = null,
  byCount = false, hideEmpty = false, stable = false, stateOf, onPick,
}) {
  const row = shareRow ?? document.createElement('div');
  if (!shareRow) row.className = 'kleurbalk tagrij';
  const strip = span('tagbalk-knoppen');
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', label);

  const trays = new Map();
  for (const parent of new Set(items.map((i) => i.parent).filter(Boolean))) {
    const tray = span('tagbak');
    tray.dataset.parent = parent;
    trays.set(parent, tray);
  }

  const chips = [];
  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tagknop';
    button.dataset.tag = item.id;
    const full = item.full && item.full !== item.name ? item.full : null;
    button.title = [full, item.hint].filter(Boolean).join(' — ') || item.name;
    showChipState(button, stateOf(item.id));
    const countEl = span('tagknop-aantal');
    if (item.count !== undefined) countEl.textContent = item.count;
    button.append(document.createTextNode(item.name), countEl);
    button.addEventListener('click', () => onPick(item.id, button));

    if (item.dot) button.classList.add('tagknop-punt');

    const tray = item.parent ? trays.get(item.parent) : null;
    if (tray) { button.classList.add('tagknop-subtype'); tray.append(button); } else { strip.append(button); }

    const ancestors = [];
    for (let p = item.parent; p; p = items.find((i) => i.id === p)?.parent ?? null) ancestors.push(p);

    chips.push({
      id: item.id, element: button, countEl, row, strip, tray,
      parent: item.parent ?? null, ancestors, byCount, hideEmpty, stable,
      count: item.count ?? 0, order: chips.length,
    });
  }

  row.append(strip);
  if (!shareRow && container) container.append(row);
  return { row, strip, chips };
}

export function layoutChips(chips) {
  for (const strip of new Set(chips.map((c) => c.strip))) {
    const all = chips.filter((c) => c.strip === strip);
    const sorted = (list) => list.sort((a, b) => {
      if (a.stable) return a.order - b.order;
      return a.byCount
        ? b.count - a.count || a.order - b.order
        : Number(b.picked) - Number(a.picked) || a.order - b.order;
    });
    const mount = (into, parent) => {
      for (const chip of sorted(all.filter((c) => (c.parent ?? null) === parent))) {
        into.append(chip.element);
        const kids = all.filter((c) => c.parent === chip.id);
        if (!kids.length) continue;
        const tray = kids[0].tray;
        mount(tray, chip.id);
        tray.hidden = kids.every((c) => c.element.hidden);
        chip.element.classList.toggle('tagknop-ouder', !tray.hidden);
        into.append(tray);
      }
    };
    mount(strip, null);
  }
}

export function syncChips(chips, { stateOf, countOf = null, onHide = null, skip = null } = {}) {
  for (const chip of chips) {
    if (countOf) {
      chip.count = countOf(chip);
      chip.countEl.textContent = chip.count;
    }
    const state = stateOf(chip.id, chip);
    chip.picked = PICKED.has(state);
    const hidden = (chip.hideEmpty && chip.count === 0)
      || chip.ancestors.some((id) => !PICKED.has(stateOf(id, chip)));
    if (hidden && state !== undefined) onHide?.(chip);
    showChipState(chip.element, hidden ? stateOf(chip.id, chip) : state);
    chip.element.hidden = hidden || Boolean(skip?.(chip));
  }
  for (const row of new Set(chips.map((c) => c.row))) {
    row.hidden = !chips.some((c) => c.row === row && !c.element.hidden);
  }
}

const NEXT = { undefined: 'only', only: 'not', not: undefined };

export const nextState = (state) => NEXT[state];

export function rotateState(states, key, button) {
  const next = NEXT[states.get(key)];
  if (next) states.set(key, next);
  else states.delete(key);
  showChipState(button, next);
  return next;
}

export const keysWithState = (states, value) => [...states].filter(([, v]) => v === value).map(([k]) => k);

export function matchesState(own, states, { any = [] } = {}) {
  const only = keysWithState(states, 'only');
  const either = only.filter((e) => any.includes(e));
  const all = only.filter((e) => !any.includes(e));
  if (either.length && !own.some((e) => either.includes(e))) return false;
  if (!all.every((e) => own.includes(e))) return false;
  const not = keysWithState(states, 'not');
  return !own.some((e) => not.includes(e));
}

function checkColor(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? '#2f2a26' : '#ffffff';
}

export function buildColorBar(colors, states, onPick) {
  const container = document.querySelector('#kleurbalk-stalen');
  const swatches = document.createElement('div');
  swatches.className = 'kleurgroep-stalen';
  swatches.setAttribute('role', 'group');
  swatches.setAttribute('aria-label', 'Filter by colour');

  for (const color of colors) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'staal';
    button.dataset.sleutel = color.hex;
    button.style.setProperty('--staal-kleur', color.hex);
    button.style.setProperty('--vink', checkColor(color.hex));
    showChipState(button, states.get(color.hex));
    button.title = `${color.name} ${color.hex} — ${color.count} models`;
    button.setAttribute('aria-label', `${color.name} ${color.hex}, ${color.count} models`);

    button.addEventListener('click', () => {
      rotateState(states, color.hex, button);
      onPick();
    });

    swatches.append(button);
  }

  const group = document.createElement('div');
  group.className = 'kleurgroep';
  group.append(swatches);
  container.append(group);
}

export function buildChipRow(chipButtons, container, head, items, states, field, onPick, { shareRow = null, byCount = false, extra = false } = {}) {
  const { row, chips } = makeChipStrip({
    label: `Filter by ${head.toLowerCase()}`,
    items, container, shareRow, byCount, hideEmpty: true,
    stateOf: (id) => states.get(id),
    onPick: (id, button) => {
      rotateState(states, id, button);
      onPick(id);
    },
  });
  for (const chip of chips) { chip.state = states; chip.field = field; chip.extra = extra; }
  chipButtons.push(...chips);
  return row;
}

export function syncSubtypes(chipButtons, { countOf = null, skip = null } = {}) {
  syncChips(chipButtons, {
    stateOf: (id, chip) => chip.state.get(id),
    countOf,
    onHide: (chip) => { chip.state.delete(chip.id); },
    skip,
  });
  for (const chip of chipButtons) {
    if (chip.count === 0 && chip.state.get(chip.id) === 'only') chip.state.delete(chip.id);
  }
}

export function clearStates(stateMaps, chipButtons) {
  for (const states of stateMaps) states.clear();
  for (const button of document.querySelectorAll('.staal')) showChipState(button, undefined);
  for (const { element } of chipButtons) showChipState(element, undefined);
}
