import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/three-addons/GLTFLoader.js';

const ROW_WIDTH = innerWidth < 700 ? 3 : 5;
const LABEL_PX = 20;
const GAP = 0.35;
const LINE = 2.3;
const FONT_KIT = '500 58px system-ui, sans-serif';
const FONT_MODEL = '700 58px system-ui, sans-serif';

let shared = null;
function sharedRenderer(width, height) {
  if (!shared) {
    shared = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    shared.setPixelRatio(1);
  }
  shared.setSize(width, height, false);
  return shared;
}

function cleanUp(scene) {
  scene.traverse((obj) => {
    obj.geometry?.dispose();
    for (const mat of [obj.material].flat().filter(Boolean)) {
      mat.map?.dispose();
      mat.dispose();
    }
  });
}

const loader = new GLTFLoader();
const load = (path) => new Promise((res, rej) => loader.load(path, res, undefined, rej));
const measureCtx = document.createElement('canvas').getContext('2d');

const textWidth = ({ kit, model }) => {
  measureCtx.font = FONT_KIT;
  const a = kit ? measureCtx.measureText(kit).width : 0;
  measureCtx.font = FONT_MODEL;
  const b = measureCtx.measureText(model).width;
  return Math.ceil(Math.max(a, b)) + 16;
};

const colors = () => {
  const style = getComputedStyle(document.documentElement);
  const read = (name, fallback) => (style.getPropertyValue(name).trim() || fallback);
  return {
    paper: read('--papier-diep', '#f2e9dd'),
    ink: read('--inkt', '#2f2a26'),
    inkSoft: read('--inkt-zacht', '#7d7166'),
    lineFine: read('--raster-fijn', '#cdbfad'),
    lineHeavy: read('--raster-zwaar', '#8d8072'),
  };
};

function ruler() {
  const height = 1;
  const part = height / 4;
  const thickness = 0.08;
  const block = new THREE.BoxGeometry(thickness, part, thickness);
  const red = new THREE.MeshLambertMaterial({ color: 0xcc3333 });
  const white = new THREE.MeshLambertMaterial({ color: 0xf0ece3 });
  return {
    w: thickness,
    h: height,
    label: { kit: '', model: '' },
    build() {
      const g = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const mesh = new THREE.Mesh(block, i % 2 ? red : white);
        mesh.position.set(0, part / 2 + i * part, 0);
        g.add(mesh);
      }
      return g;
    },
  };
}

function labelLines(row, labelScale) {
  const right = [];
  for (const p of row) {
    const width = labelScale * (textWidth(p.label) / 96);
    let r = right.findIndex((v) => p.x - width / 2 > v + labelScale * 0.2);
    if (r === -1) { r = right.length; right.push(0); }
    right[r] = p.x + width / 2;
    p.line = r;
    p.labelWidth = width;
  }
  return right.length;
}

function layOut(pieces, labelScale, rulerObj) {
  const rows = [];
  let row = [];
  let width = 0;
  for (const p of pieces) {
    if (row.length && width + GAP + p.w > ROW_WIDTH) { rows.push({ row, width }); row = []; width = 0; }
    width += GAP + p.w / 2;
    p.x = width;
    width += p.w / 2;
    row.push(p);
  }
  if (row.length) rows.push({ row, width });
  for (const x of rows) {
    x.lines = labelLines(x.row, labelScale);
    x.labelBlock = labelScale * (0.7 + LINE * (x.lines - 1) + LINE);
    x.height = Math.max(rulerObj.h + labelScale * 1.4, ...x.row.map((p) => p.h)) + x.labelBlock;
  }
  return rows;
}

function background(y, left, right, height, fine, heavy) {
  const g = new THREE.Group();
  const top = Math.ceil(Math.max(height, 1) * 4) / 4;
  for (const [step, color, opacity, thickness] of [[0.25, fine, 1, 1], [1, heavy, 1, 2]]) {
    const points = [];
    for (let x = Math.ceil(left / step) * step; x <= right + 1e-6; x += step) points.push(x, y, -0.5, x, y + top, -0.5);
    for (let h = 0; h <= top + 1e-6; h += step) points.push(left, y + h, -0.5, right, y + h, -0.5);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity, linewidth: thickness })));
  }
  return g;
}

export async function drawFamily(group, canvas, width) {
  const { paper, ink, inkSoft, lineFine, lineHeavy } = colors();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(paper);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x887766, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(3, 6, 5);
  scene.add(sun);

  const pieces = [];
  for (const item of group.items) {
    let gltf;
    try {
      gltf = await load(modelUrl(`../${item.path}`));
    } catch (error) {
      console.error('load failed', item.path, error);
      continue;
    }
    const obj = gltf.scene;
    let box = new THREE.Box3().setFromObject(obj);
    let size = box.getSize(new THREE.Vector3());
    const pivot = new THREE.Group();
    pivot.add(obj);

    if (group.topView) obj.rotation.x = -Math.PI / 2;
    else if (size.z > size.x * 1.4) obj.rotation.y = Math.PI / 2;
    box = new THREE.Box3().setFromObject(pivot);
    size = box.getSize(new THREE.Vector3());
    obj.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    pieces.push({
      obj: pivot,
      w: size.x,
      h: size.y,
      kit: item.kit,
      tags: item.tags ?? [],
      label: { kit: item.kit, model: `${item.model}  ${group.topView ? 'd' : 'h'}=${size.y.toFixed(2)}` },
    });
  }
  if (!pieces.length) return null;

  const rulerObj = ruler();
  const onScreen = canvas.getBoundingClientRect().width || width;
  const labelScale = (LABEL_PX * ROW_WIDTH) / onScreen;
  const rows = layOut(pieces, labelScale, rulerObj);

  const base = [];
  for (let i = rows.length - 1, y = 0; i >= 0; i--) { base[i] = y + rows[i].labelBlock; y += rows[i].height; }

  const rulerLeft = -GAP - rulerObj.w / 2;
  const rulerRight = ROW_WIDTH + GAP + rulerObj.w / 2;

  const label = (text, x, y, width) => {
    const c = document.createElement('canvas');
    c.width = textWidth(text);
    c.height = text.kit ? 192 : 96;
    const ctx = c.getContext('2d');
    ctx.textAlign = 'center';
    if (text.kit) {
      ctx.font = FONT_KIT;
      ctx.fillStyle = inkSoft;
      ctx.fillText(text.kit, c.width / 2, 60);
    }
    ctx.font = FONT_MODEL;
    ctx.fillStyle = ink;
    ctx.fillText(text.model, c.width / 2, text.kit ? 148 : 62);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
    spr.scale.set(width, labelScale * (c.height / 96), 1);
    spr.position.set(x, y, 1.2);
    spr.center.set(0.5, 1);
    scene.add(spr);
  };

  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  const boxes = [];

  rows.forEach((r, i) => {
    const y = base[i];
    scene.add(background(y, rulerLeft, rulerRight, Math.max(rulerObj.h, ...r.row.map((p) => p.h)), lineFine, lineHeavy));
    for (const lx of [rulerLeft, rulerRight]) {
      const obj = rulerObj.build();
      obj.position.set(lx, y, 0);
      scene.add(obj);
      const width = labelScale * (textWidth(rulerObj.label) / 96);
      const ly = y + rulerObj.h + labelScale * 1.25;
      label(rulerObj.label, lx, ly, width);
      xMin = Math.min(xMin, lx - width / 2);
      xMax = Math.max(xMax, lx + width / 2);
      yMax = Math.max(yMax, ly);
    }
    for (const p of r.row) {
      p.obj.position.set(p.x, y, 0);
      scene.add(p.obj);
      const ly = y - labelScale * 0.7 - p.line * labelScale * LINE;
      label(p.label, p.x, ly, p.labelWidth);
      xMin = Math.min(xMin, p.x - p.w / 2, p.x - p.labelWidth / 2);
      xMax = Math.max(xMax, p.x + p.w / 2, p.x + p.labelWidth / 2);
      yMin = Math.min(yMin, ly - labelScale * 2);
      yMax = Math.max(yMax, y + p.h);
      boxes.push({
        kit: p.kit,
        tags: p.tags ?? [],
        x0: Math.min(p.x - p.w / 2, p.x - p.labelWidth / 2),
        x1: Math.max(p.x + p.w / 2, p.x + p.labelWidth / 2),
        y0: ly - labelScale * 2,
        y1: y + p.h,
      });
    }
  });

  const margin = Math.max(GAP, labelScale);
  const viewW = rulerRight - rulerLeft + margin * 2;
  const viewH = yMax - yMin + margin * 2;
  xMin = rulerLeft - margin;
  xMax = rulerRight + margin;

  const MAX_H = 8000;
  let canvasW = width;
  let height = Math.round((width * viewH) / viewW);
  if (height > MAX_H) { height = MAX_H; canvasW = Math.round((MAX_H * viewW) / viewH); }

  const renderer = sharedRenderer(canvasW, height);

  const aspect = canvasW / height;
  const midX = (xMin + xMax) / 2;
  const midY = (yMin + yMax) / 2;
  const cam = new THREE.OrthographicCamera(
    (-viewH * aspect) / 2, (viewH * aspect) / 2, viewH / 2, -viewH / 2, 0.1, 200);
  cam.position.set(midX, midY + viewH * 0.1, 30);
  cam.lookAt(midX, midY, 0);
  renderer.render(scene, cam);
  canvas.width = canvasW;
  canvas.height = height;
  canvas.getContext('2d').drawImage(renderer.domElement, 0, 0);

  const toPixel = (x, y) => {
    const v = new THREE.Vector3(x, y, 0).project(cam);
    return [((v.x + 1) / 2) * canvasW, ((1 - v.y) / 2) * height];
  };
  const inPixels = boxes.map((v) => {
    const [px0, py1] = toPixel(v.x0, v.y0);
    const [px1, py0] = toPixel(v.x1, v.y1);
    return { kit: v.kit, tags: v.tags ?? [], x: px0, y: py0, w: px1 - px0, h: py1 - py0 };
  });

  cleanUp(scene);
  return { height, width: canvasW, count: pieces.length, boxes: inPixels };
}

const version = document.querySelector('meta[name=catalogus-versie]')?.content ?? '';
// Zelfde stempel als op catalog.json, anders blijft een gecachte .glb hangen.
const modelUrl = (path) => (version ? `${path}?v=${version}` : path);
const MODEL_PATH = 'kits/workfiles';

function colorName(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  if (saturation < 0.18) {
    if (lightness > 0.8) return 'white';
    if (lightness > 0.45) return 'light grey';
    if (lightness > 0.25) return 'grey';
    return 'dark grey';
  }

  let tint = 0;
  if (max === r) tint = ((g - b) / delta) % 6;
  else if (max === g) tint = (b - r) / delta + 2;
  else tint = (r - g) / delta + 4;
  tint = (tint * 60 + 360) % 360;

  const base =
    tint < 15 || tint >= 345 ? 'red'
    : tint < 40 ? (lightness < 0.45 ? 'brown' : 'orange')
    : tint < 50 ? (lightness < 0.5 ? 'brown' : 'orange')
    : tint < 70 ? 'yellow'
    : tint < 165 ? 'green'
    : tint < 200 ? 'turquoise'
    : tint < 260 ? 'blue'
    : tint < 300 ? 'purple'
    : 'pink';

  if (lightness < 0.3) return `dark ${base}`;
  if (lightness > 0.75) return `light ${base}`;
  return base;
}

const [groups, catalogData] = await Promise.all([
  fetch(`schaalgroepen.json?v=${version}`).then((r) => r.json()),
  fetch(`catalog.json?v=${version}`).then((r) => r.json()).catch(() => ({})),
]);

const kitsMap = new Map((catalogData.kits ?? []).map((k) => [k.slug, k]));
const shortKit = (slug) => (kitsMap.get(slug)?.name ?? slug).replace(/\s+Kit$/, '');

for (const group of groups) {
  for (const item of group.items) {
    item.path = `${MODEL_PATH}/${item.slug}/${item.model}.glb`;
    item.kit = shortKit(item.slug);
  }
}

const content = document.getElementById('inhoud');

const SIZE_CLASSES = [
  { id: 'small', name: 'Small', limit: 0.5 },
  { id: 'medium', name: 'Medium', limit: 1.5 },
  { id: 'large', name: 'Large', limit: Infinity },
];
const sizeOf = (item) => {
  const longest = Math.max(...item.wdh);
  return (SIZE_CLASSES.find((k) => longest < k.limit) ?? SIZE_CLASSES.at(-1)).id;
};

const colorState = new Map();
const tagState = new Map();
const sizeState = new Map();
const chipButtons = [];
const NEXT = { undefined: 'only', only: 'not', not: undefined };

function showState(button, state) {
  button.setAttribute('aria-pressed', String(state === 'only'));
  if (state === 'not') button.dataset.uit = '';
  else delete button.dataset.uit;
}

const keysWith = (state, value) => [...state].filter(([, v]) => v === value).map(([k]) => k);

function matches(own, state) {
  const only = keysWith(state, 'only');
  if (only.length && !own.some((e) => only.includes(e))) return false;
  return !own.some((e) => keysWith(state, 'not').includes(e));
}

const passesFilter = (item) =>
  matches(item.colors ?? [], colorState) &&
  matches(item.tags ?? [], tagState) &&
  matches([sizeOf(item)], sizeState);

const filtered = () =>
  groups.map((g) => ({ ...g, items: g.items.filter(passesFilter) })).filter((g) => g.items.length);

function reorder() {
  for (const strip of new Set(chipButtons.map((c) => c.strip))) {
    for (const chip of chipButtons
      .filter((c) => c.strip === strip)
      .sort((a, b) => Number(b.state.has(b.id)) - Number(a.state.has(a.id)) || a.order - b.order)) {
      strip.append(chip.element);
    }
  }
}

function rotate(state, id, button) {
  const next = NEXT[state.get(id)];
  if (next) state.set(id, next);
  else state.delete(id);
  showState(button, next);
  reorder();
  document.querySelector('#alles-wis').hidden =
    colorState.size + tagState.size + sizeState.size === 0;
  buildSections();
}

function chipRow(container, items, state) {
  const row = document.createElement('div');
  row.className = 'kleurbalk tagrij';
  const strip = document.createElement('div');
  strip.className = 'tagbalk-knoppen';
  strip.setAttribute('role', 'group');
  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tagknop';
    button.dataset.tag = item.id;
    const count = document.createElement('span');
    count.className = 'tagknop-aantal';
    count.textContent = item.count;
    button.append(document.createTextNode(item.name), count);
    showState(button, state.get(item.id));
    button.addEventListener('click', () => rotate(state, item.id, button));
    strip.append(button);
    chipButtons.push({ id: item.id, element: button, state, strip, order: chipButtons.length });
  }
  row.append(strip);
  container.append(row);
}

const WIDTH = 1800;

let watcher = null;
let queue = Promise.resolve();

function buildSections() {
  watcher?.disconnect();
  content.replaceChildren();
  const visible = filtered();

  for (const group of visible) {
    const section = document.createElement('section');
    section.className = 'familie';
    section.id = group.slug;
    section.innerHTML = `<h2>${group.name}</h2><div class="familie-doek"><canvas width="${WIDTH}" height="400"></canvas></div>`;
    content.appendChild(section);
  }

  watcher = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      watcher.unobserve(entry.target);
      const section = entry.target;
      const group = visible.find((g) => g.slug === section.id);
      const canvas = section.querySelector('canvas');
      section.classList.add('bezig');
      queue = queue.then(async () => {
        try {
          const out = await drawFamily(group, canvas, WIDTH);
          if (!out) section.classList.add('mislukt');
        } catch (error) {
          console.error('family failed', section.id, error);
          section.classList.add('mislukt');
        } finally {
          section.classList.remove('bezig');
        }
      });
    }
  }, { rootMargin: '600px 0px' });

  for (const section of content.querySelectorAll('.familie')) watcher.observe(section);
}

function buildFilters() {
  const all = groups.flatMap((g) => g.items);
  const count = (f) => all.filter(f).length;

  const colorRow = document.querySelector('#kleurbalk-stalen');
  const colorCounts = new Map();
  for (const item of all) {
    for (const hex of item.colors ?? []) colorCounts.set(hex, (colorCounts.get(hex) ?? 0) + 1);
  }
  const colorList = [...colorCounts]
    .map(([hex, c]) => ({ hex, count: c, name: colorName(hex) }))
    .sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex));

  for (const color of colorList) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'staal';
    button.style.setProperty('--staal-kleur', color.hex);
    button.title = `${color.name} ${color.hex}`;
    button.setAttribute('aria-label', button.title);
    showState(button, colorState.get(color.hex));
    button.addEventListener('click', () => rotate(colorState, color.hex, button));
    colorRow.append(button);
    chipButtons.push({ id: color.hex, element: button, state: colorState, strip: colorRow, order: chipButtons.length });
  }

  const tagbar = document.querySelector('#tagbalk');
  chipRow(tagbar, SIZE_CLASSES
    .map((k) => ({ id: k.id, name: k.name, count: count((i) => sizeOf(i) === k.id) }))
    .filter((k) => k.count), sizeState);

  const tags = (catalogData.tags ?? [])
    .map((t) => ({ id: t.id, name: t.name, count: count((i) => (i.tags ?? []).includes(t.id)) }))
    .filter((t) => t.count);
  if (tags.length) chipRow(tagbar, tags, tagState);

  document.querySelector('#alles-wis').addEventListener('click', () => {
    colorState.clear();
    tagState.clear();
    sizeState.clear();
    for (const { element } of chipButtons) showState(element, undefined);
    reorder();
    document.querySelector('#alles-wis').hidden = true;
    buildSections();
  });
}

buildFilters();
buildSections();
