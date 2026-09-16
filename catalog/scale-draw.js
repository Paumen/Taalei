import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/three-addons/GLTFLoader.js';

const GRID_MINOR = 0.1;
const GRID_MAJOR = 0.2;
const ROW_WIDTH = 5;
const WIDE_FACTOR = 2;
const LABEL_PX = 20;
const GAP = 0.2;
const LINE = 2.05;
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

const LOAD_LIMIT = 8;
const models = new Map();
let inFlight = 0;
const waiting = [];
const slot = () => new Promise((res) => (inFlight < LOAD_LIMIT ? (inFlight++, res()) : waiting.push(res)));
const free = () => (waiting.length ? waiting.shift()() : inFlight--);

export function loadModel(path) {
  if (!models.has(path)) {
    const p = slot()
      .then(() => load(modelUrl(`../${path}`)))
      .then((gltf) => gltf.scene, (error) => { models.delete(path); throw error; })
      .finally(free);
    models.set(path, p);
  }
  return models.get(path);
}

const measureCtx = document.createElement('canvas').getContext('2d');

const textWidth = ({ kit, model }) => {
  measureCtx.font = FONT_KIT;
  const a = kit ? measureCtx.measureText(kit).width : 0;
  measureCtx.font = FONT_MODEL;
  const b = measureCtx.measureText(model).width;
  return Math.ceil(Math.max(a, b)) + 16;
};

const kindWords = (name) =>
  new Set(name.split('›').pop().trim().toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));

const shortModel = (model, words) =>
  model.split('-').filter((part) => !words.has(part.toLowerCase())).join('-');

const colors = () => {
  const style = getComputedStyle(document.documentElement);
  const read = (name, fallback) => (style.getPropertyValue(name).trim() || fallback);
  return {
    paper: read('--papier-diep', '#f2e9dd'),
    ink: read('--inkt', '#2f2a26'),
    inkSoft: read('--inkt-zacht', '#7d7166'),
    lineFine: read('--raster-fijn', '#cdbfad'),
    lineHeavy: read('--raster-zwaar', '#8d8072'),
    limit: read('--limiet-lijn', '#b5543f'),
  };
};

const RULER_STEP = GRID_MAJOR;

function ruler(height) {
  const steps = Math.max(1, Math.round(height / RULER_STEP));
  const part = height / steps;
  const thickness = 0.08;
  const block = new THREE.BoxGeometry(thickness, part, thickness);
  const red = new THREE.MeshLambertMaterial({ color: 0xcc3333 });
  const white = new THREE.MeshLambertMaterial({ color: 0xf0ece3 });
  return {
    w: thickness,
    h: height,
    build() {
      const g = new THREE.Group();
      for (let i = 0; i < steps; i++) {
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

function layOut(pieces, labelScale, rulerObj, rowWidth) {
  const rows = [];
  let row = [];
  let width = 0;
  for (const p of pieces) {
    if (row.length && width + GAP + p.w > rowWidth) { rows.push({ row, width }); row = []; width = 0; }
    width += GAP + p.w / 2;
    p.x = width;
    width += p.w / 2;
    row.push(p);
  }
  if (row.length) rows.push({ row, width });
  for (const x of rows) {
    x.lines = labelLines(x.row, labelScale);
    x.labelBlock = labelScale * (0.45 + LINE * x.lines);
    x.height = Math.max(rulerObj.h, ...x.row.map((p) => p.h)) + x.labelBlock;
  }
  return rows;
}

const GRID_UNIT = 1;
const UNIT_WEIGHT = 0.006;
const DASH = 0.022;

function gridLines(y, left, right, top, step, color, { dashed = false, vertical = true } = {}) {
  const points = [];
  if (vertical) {
    for (let x = Math.ceil(left / step) * step; x <= right + 1e-6; x += step) points.push(x, y, -0.5, x, y + top, -0.5);
  }
  for (let h = 0; h <= top + 1e-6; h += step) points.push(left, y + h, -0.5, right, y + h, -0.5);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const material = dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: DASH, gapSize: DASH })
    : new THREE.LineBasicMaterial({ color });
  const lines = new THREE.LineSegments(geo, material);
  if (dashed) lines.computeLineDistances();
  return lines;
}

function unitLines(y, left, right, top, color) {
  const g = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color });
  const bar = (w, h, cx, cy) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.position.set(cx, cy, -0.49);
    g.add(mesh);
  };
  for (let x = Math.ceil(left / GRID_UNIT) * GRID_UNIT; x <= right + 1e-6; x += GRID_UNIT) {
    bar(UNIT_WEIGHT, top, x, y + top / 2);
  }
  for (let h = 0; h <= top + 1e-6; h += GRID_UNIT) {
    bar(right - left, UNIT_WEIGHT, (left + right) / 2, y + h);
  }
  return g;
}

const LIMIT_WEIGHT = 0.012;

function limitLines(y, left, right, limits, color) {
  const g = new THREE.Group();
  if (!limits) return g;
  const material = new THREE.MeshBasicMaterial({ color });
  const bar = (w, cx, cy) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, LIMIT_WEIGHT), material);
    mesh.position.set(cx, cy, -0.45);
    g.add(mesh);
  };
  for (const [field, value] of Object.entries(limits)) {
    if (!Number.isFinite(value)) continue;
    const at = y + value;
    if (field.startsWith('high')) { bar(right - left, (left + right) / 2, at); continue; }
    const dash = (right - left) / 41;
    for (let x = left; x < right - 1e-6; x += dash * 2) {
      bar(Math.min(dash, right - x), x + Math.min(dash, right - x) / 2, at);
    }
  }
  return g;
}

const drawableLimits = (limits, contentTop) => Object.fromEntries(
  Object.entries(limits ?? {}).filter(([, v]) => Number.isFinite(v) && v > 0 && v <= contentTop),
);

function background(y, left, right, height, fine, heavy) {
  const g = new THREE.Group();
  const top = Math.ceil(Math.max(height, GRID_MAJOR) / GRID_MAJOR - 1e-6) * GRID_MAJOR;
  g.add(gridLines(y, left, right, top, GRID_MINOR, fine, { dashed: true, vertical: false }));
  g.add(gridLines(y, left, right, top, GRID_MAJOR, fine));
  g.add(unitLines(y, left, right, top, heavy));
  return g;
}

export async function drawFamily(group, canvas, width) {
  const { paper, ink, inkSoft, lineFine, lineHeavy, limit: limitColor } = colors();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(paper);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x887766, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(3, 6, 5);
  scene.add(sun);

  const words = kindWords(group.name);
  const pieces = [];
  const loaded = await Promise.all(group.items.map((item) =>
    loadModel(item.path).catch((error) => { console.error('load failed', item.path, error); return null; })));
  for (const [i, item] of group.items.entries()) {
    const obj = loaded[i];
    if (!obj) continue;
    obj.removeFromParent();
    obj.rotation.set(0, 0, 0);
    obj.position.set(0, 0, 0);
    let box = new THREE.Box3().setFromObject(obj);
    let size = box.getSize(new THREE.Vector3());
    const pivot = new THREE.Group();
    pivot.add(obj);

    if (group.standUp) {
      if (size.z >= size.x && size.z >= size.y) obj.rotation.x = -Math.PI / 2;
      else if (size.x > size.y) obj.rotation.z = Math.PI / 2;
    } else if (group.topView) obj.rotation.x = -Math.PI / 2;
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
      label: { kit: item.kit, model: shortModel(item.model, words) },
    });
  }
  if (!pieces.length) return null;

  const rulerObj = ruler(group.rulerHeight ?? 1);
  const rowWidth = group.rowWidth ?? (group.wideRow ? ROW_WIDTH * WIDE_FACTOR : ROW_WIDTH);
  const onScreen = canvas.getBoundingClientRect().width || width;
  const labelScale = (LABEL_PX * rowWidth) / onScreen;
  const rows = layOut(pieces, labelScale, rulerObj, rowWidth);

  const base = [];
  for (let i = rows.length - 1, y = 0; i >= 0; i--) { base[i] = y + rows[i].labelBlock; y += rows[i].height; }

  const rulerLeft = -GAP - rulerObj.w / 2;
  const rulerRight = rowWidth + GAP + rulerObj.w / 2;

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
    const rowTop = Math.max(rulerObj.h, ...r.row.map((p) => p.h));
    const shown = drawableLimits(group.limits, rowTop);
    scene.add(background(y, rulerLeft, rulerRight, rowTop, lineFine, lineHeavy));
    scene.add(limitLines(y, rulerLeft, rulerRight, shown, limitColor));
    yMax = Math.max(yMax, y + rowTop);
    for (const lx of [rulerLeft, rulerRight]) {
      const obj = rulerObj.build();
      obj.position.set(lx, y, 0);
      scene.add(obj);
      yMax = Math.max(yMax, y + rulerObj.h);
    }
    for (const p of r.row) {
      p.obj.position.set(p.x, y, 0);
      scene.add(p.obj);
      const ly = y - labelScale * 0.45 - p.line * labelScale * LINE;
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

  const margin = labelScale;
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
  cam.position.set(midX, midY, 30);
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

  for (const p of pieces) scene.remove(p.obj);
  cleanUp(scene);
  return { height, width: canvasW, count: pieces.length, boxes: inPixels };
}

export const version = document.querySelector('meta[name=catalogus-versie]')?.content ?? '';
const modelUrl = (path) => (version ? `${path}?v=${version}` : path);
