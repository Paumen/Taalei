// One chip row, shared by the filter bar and the tag editor.
//
// A row is a single line that scrolls sideways rather than wrapping — that is what keeps
// it 44px whether it holds five chips or a hundred. Children hang in a tray off their
// parent and only appear once every ancestor is picked, so a closed tree costs one chip
// per root. The two callers differ only in what a pressed chip means: in the bar it
// narrows the view, in the editor it assigns the tag.

// Chip labels are abbreviated wherever a chip row shows them — the filter bar and the tag
// editor alike — so a row fits more chips before it has to be swiped. Keyed by tag id, so
// the same name under two ids can shorten differently. The full name stays in the tooltip.
const SHORT_NAME = {
  // kind
  assy: 'Asmbly',
  char: 'Char',
  env: 'Env',
  'env-flora-deadwood': 'Deadwd',
  'env-rock-formation': 'Formatn',
  'obj-container': 'Contnr',
  'obj-equipment': 'Equip',
  'obj-equipment-clothing': 'Cloth',
  'obj-food-vegetable': 'Veget',
  'obj-furniture': 'Furn',
  'obj-furniture-seating': 'Seatng',
  'obj-kitchenware': 'Kitchw',
  'obj-kitchenware-cookware': 'Cookw',
  'obj-kitchenware-tableware': 'Tablew',
  'obj-lighting': 'Light',
  'obj-pocketitem': 'Pocket',
  'obj-resource': 'Resrce',
  'obj-tool-supplies': 'Suppl',
  'obj-transport': 'Transp',
  'obj-transport-accessory': 'Accsry',
  'obj-weapon-ranged-accessory': 'Accsry',
  'obj-weapon-ranged-crossbow': 'Crossbw',
  str: 'Struct',
  'str-marker-tombstone': 'Tombst',
  'str-platform': 'Platfm',
  // material
  ceramic: 'Cerm',
  emissive: 'Emiss',
  foliage: 'Foliag',
  gemstone: 'Gemst',
  leather: 'Leathr',
  'metal-copper': 'Copper',
  'metal-gold': 'Gold',
  'metal-iron': 'Iron',
  'metal-silver': 'Silver',
  'stone-masonry': 'Masonry',
  'stone-rock': 'Rock',
  'stone-soil': 'Soil',
  textile: 'Textil',
  vegetation: 'Vegetn',
  'wood-bark': 'Bark',
  'wood-beam': 'Beam',
  'wood-log': 'Log',
  'wood-planks': 'Planks',
  'wood-worked': 'Worked',
  // tag
  animation: 'Anim',
  decorated: 'Dec food',
  halloween: 'Hallown',
  qua: 'Quat',
  'robin-hood': 'Robin',
  // use
  'use:container': 'Contnr',
  'use:transport': 'Transp',
  'use:wearable': 'Wearbl',
};

// tag: a catalog.json tag record, or anything with an id and a name.
export const chipName = (tag) => SHORT_NAME[tag.id] ?? tag.name ?? tag.id;

// 'only' is picked, 'not' excluded, 'open' reveals the tray without picking the chip
// itself — the editor needs that for a parent whose subtype the model carries.
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

// items: { id, name, full, hint, parent, count, dot } — `full` is the unabbreviated name,
// shown in the tooltip when the item carries no hint of its own.
export function makeChipStrip({
  label, items, container = null, shareRow = null,
  byCount = false, hideEmpty = false, stateOf, onPick,
}) {
  const row = shareRow ?? document.createElement('div');
  if (!shareRow) row.className = 'kleurbalk tagrij';
  const strip = span('tagbalk-knoppen');
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', label);

  // A subtype sits in a tray hung off its parent chip: the tray keeps the family together
  // when the row wraps, which adjacency alone does not.
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
    button.title = item.hint ?? item.full ?? item.name;
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
      parent: item.parent ?? null, ancestors, byCount, hideEmpty,
      count: item.count ?? 0, order: chips.length,
    });
  }

  row.append(strip);
  if (!shareRow && container) container.append(row);
  return { row, strip, chips };
}

// Chips nest to any depth: a parent's tray holds its children, and a child with children
// of its own hangs its tray inside that one. Materials go one level, kinds up to four.
export function layoutChips(chips) {
  for (const strip of new Set(chips.map((c) => c.strip))) {
    const all = chips.filter((c) => c.strip === strip);
    const sorted = (list) => list.sort((a, b) => (a.byCount
      ? b.count - a.count || a.order - b.order
      : Number(b.picked) - Number(a.picked) || a.order - b.order));
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

// A subtype waits behind its parent: it appears once every ancestor is picked. `onHide`
// lets the filter drop a hidden chip's state so nothing keeps filtering out of sight; the
// editor passes none, because a staged edit must survive its chip scrolling away.
export function syncChips(chips, { stateOf, countOf = null, onHide = null } = {}) {
  for (const chip of chips) {
    if (countOf) {
      chip.count = countOf(chip);
      chip.countEl.textContent = chip.count;
    }
    const state = stateOf(chip.id, chip);
    chip.picked = PICKED.has(state);
    // an ancestor sits in the same row, so it reads from the same state
    const hidden = (chip.hideEmpty && chip.count === 0)
      || chip.ancestors.some((id) => !PICKED.has(stateOf(id, chip)));
    if (hidden && state !== undefined) onHide?.(chip);
    showChipState(chip.element, hidden ? stateOf(chip.id, chip) : state);
    chip.element.hidden = hidden;
  }
  for (const row of new Set(chips.map((c) => c.row))) {
    row.hidden = !chips.some((c) => c.row === row && !c.element.hidden);
  }
}
