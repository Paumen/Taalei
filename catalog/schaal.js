import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/three-addons/GLTFLoader.js';

const RIJBREEDTE = 5;
const GAP = 0.35;
const REGEL = 2.3;
const FONT_KIT = '500 58px system-ui, sans-serif';
const FONT_MODEL = '700 72px system-ui, sans-serif';

let deler = null;
function gedeeldeRenderer(breedte, hoogte) {
  if (!deler) {
    deler = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    deler.setPixelRatio(1);
  }
  deler.setSize(breedte, hoogte, false);
  return deler;
}

function ruimOp(scene) {
  scene.traverse((obj) => {
    obj.geometry?.dispose();
    for (const mat of [obj.material].flat().filter(Boolean)) {
      mat.map?.dispose();
      mat.dispose();
    }
  });
}

const loader = new GLTFLoader();
const laad = (pad) => new Promise((res, rej) => loader.load(pad, res, undefined, rej));
const meetCtx = document.createElement('canvas').getContext('2d');

const tekstBreedte = ({ kit, model }) => {
  meetCtx.font = FONT_KIT;
  const a = kit ? meetCtx.measureText(kit).width : 0;
  meetCtx.font = FONT_MODEL;
  const b = meetCtx.measureText(model).width;
  return Math.ceil(Math.max(a, b)) + 16;
};

const kleuren = () => {
  const stijl = getComputedStyle(document.documentElement);
  const lees = (naam, terugval) => (stijl.getPropertyValue(naam).trim() || terugval);
  return {
    papier: lees('--papier-diep', '#f2e9dd'),
    inkt: lees('--inkt', '#2f2a26'),
    inktZacht: lees('--inkt-zacht', '#7d7166'),
    lijnFijn: lees('--raster-fijn', '#cdbfad'),
    lijnZwaar: lees('--raster-zwaar', '#8d8072'),
  };
};

function meetlat() {
  const hoog = 1;
  const deel = hoog / 4;
  const dik = 0.08;
  const blok = new THREE.BoxGeometry(dik, deel, dik);
  const rood = new THREE.MeshLambertMaterial({ color: 0xcc3333 });
  const wit = new THREE.MeshLambertMaterial({ color: 0xf0ece3 });
  return {
    w: dik,
    h: hoog,
    label: { kit: '', model: '' },
    maak() {
      const g = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const mesh = new THREE.Mesh(blok, i % 2 ? rood : wit);
        mesh.position.set(0, deel / 2 + i * deel, 0);
        g.add(mesh);
      }
      return g;
    },
  };
}

function labelRegels(rij, labelSchaal) {
  const rechts = [];
  for (const p of rij) {
    const breed = labelSchaal * (tekstBreedte(p.label) / 96);
    let r = rechts.findIndex((v) => p.x - breed / 2 > v + labelSchaal * 0.2);
    if (r === -1) { r = rechts.length; rechts.push(0); }
    rechts[r] = p.x + breed / 2;
    p.regel = r;
    p.labelBreed = breed;
  }
  return rechts.length;
}

function verdeel(stukken, labelSchaal, lat) {
  const rijen = [];
  let rij = [];
  let breed = 0;
  for (const p of stukken) {
    if (rij.length && breed + GAP + p.w > RIJBREEDTE) { rijen.push({ rij, breed }); rij = []; breed = 0; }
    breed += GAP + p.w / 2;
    p.x = breed;
    breed += p.w / 2;
    rij.push(p);
  }
  if (rij.length) rijen.push({ rij, breed });
  for (const x of rijen) {
    x.regels = labelRegels(x.rij, labelSchaal);
    x.labelBlok = labelSchaal * (0.7 + REGEL * (x.regels - 1) + REGEL);
    x.hoog = Math.max(lat.h + labelSchaal * 1.4, ...x.rij.map((p) => p.h)) + x.labelBlok;
  }
  return rijen;
}

function achtergrond(y, links, rechts, hoogte, fijn, zwaar) {
  const g = new THREE.Group();
  const top = Math.ceil(Math.max(hoogte, 1) * 4) / 4;
  for (const [stap, kleur, dekking, dikte] of [[0.25, fijn, 1, 1], [1, zwaar, 1, 2]]) {
    const punten = [];
    for (let x = Math.ceil(links / stap) * stap; x <= rechts + 1e-6; x += stap) punten.push(x, y, -0.5, x, y + top, -0.5);
    for (let h = 0; h <= top + 1e-6; h += stap) punten.push(links, y + h, -0.5, rechts, y + h, -0.5);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(punten, 3));
    g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: kleur, transparent: true, opacity: dekking, linewidth: dikte })));
  }
  return g;
}

export async function tekenFamilie(groep, canvas, breedte) {
  const { papier, inkt, inktZacht, lijnFijn, lijnZwaar } = kleuren();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(papier);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x887766, 1.4));
  const zon = new THREE.DirectionalLight(0xffffff, 1.6);
  zon.position.set(3, 6, 5);
  scene.add(zon);

  const stukken = [];
  for (const item of groep.items) {
    let gltf;
    try {
      gltf = await laad(`../${item.pad}`);
    } catch (fout) {
      console.error('load failed', item.pad, fout);
      continue;
    }
    const obj = gltf.scene;
    let doos = new THREE.Box3().setFromObject(obj);
    let maat = doos.getSize(new THREE.Vector3());
    const spil = new THREE.Group();
    spil.add(obj);

    if (groep.bovenaanzicht) obj.rotation.x = -Math.PI / 2;
    else if (maat.z > maat.x * 1.4) obj.rotation.y = Math.PI / 2;
    doos = new THREE.Box3().setFromObject(spil);
    maat = doos.getSize(new THREE.Vector3());
    obj.position.set(-(doos.min.x + doos.max.x) / 2, -doos.min.y, -(doos.min.z + doos.max.z) / 2);
    stukken.push({
      obj: spil,
      w: maat.x,
      h: maat.y,
      kit: item.kit,
      tags: item.tags ?? [],
      label: { kit: item.kit, model: `${item.model}  ${groep.bovenaanzicht ? 'd' : 'h'}=${maat.y.toFixed(2)}` },
    });
  }
  if (!stukken.length) return null;

  const lat = meetlat();
  const labelSchaal = RIJBREEDTE / 19;
  const rijen = verdeel(stukken, labelSchaal, lat);

  const basis = [];
  for (let i = rijen.length - 1, y = 0; i >= 0; i--) { basis[i] = y + rijen[i].labelBlok; y += rijen[i].hoog; }

  const latLinks = -GAP - lat.w / 2;
  const latRechts = RIJBREEDTE + GAP + lat.w / 2;

  const label = (tekst, x, y, breed) => {
    const c = document.createElement('canvas');
    c.width = tekstBreedte(tekst);
    c.height = tekst.kit ? 192 : 96;
    const ctx = c.getContext('2d');
    ctx.textAlign = 'center';
    if (tekst.kit) {
      ctx.font = FONT_KIT;
      ctx.fillStyle = inktZacht;
      ctx.fillText(tekst.kit, c.width / 2, 60);
    }
    ctx.font = FONT_MODEL;
    ctx.fillStyle = inkt;
    ctx.fillText(tekst.model, c.width / 2, tekst.kit ? 148 : 62);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
    spr.scale.set(breed, labelSchaal * (c.height / 96), 1);
    const halveBreedte = breed / 2;
    const geklemd = Math.min(Math.max(x, latLinks + halveBreedte), latRechts - halveBreedte);
    spr.position.set(geklemd, y, 1.2);
    spr.center.set(0.5, 1);
    scene.add(spr);
  };

  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  const vakken = [];

  rijen.forEach((r, i) => {
    const y = basis[i];
    scene.add(achtergrond(y, latLinks, latRechts, Math.max(lat.h, ...r.rij.map((p) => p.h)), lijnFijn, lijnZwaar));
    for (const lx of [latLinks, latRechts]) {
      const obj = lat.maak();
      obj.position.set(lx, y, 0);
      scene.add(obj);
      const breed = labelSchaal * (tekstBreedte(lat.label) / 96);
      const ly = y + lat.h + labelSchaal * 1.25;
      label(lat.label, lx, ly, breed);
      xMin = Math.min(xMin, lx - breed / 2);
      xMax = Math.max(xMax, lx + breed / 2);
      yMax = Math.max(yMax, ly);
    }
    for (const p of r.rij) {
      p.obj.position.set(p.x, y, 0);
      scene.add(p.obj);
      const ly = y - labelSchaal * 0.7 - p.regel * labelSchaal * REGEL;
      label(p.label, p.x, ly, p.labelBreed);
      xMin = Math.min(xMin, p.x - p.w / 2, p.x - p.labelBreed / 2);
      xMax = Math.max(xMax, p.x + p.w / 2, p.x + p.labelBreed / 2);
      yMin = Math.min(yMin, ly - labelSchaal * 2);
      yMax = Math.max(yMax, y + p.h);
      vakken.push({
        kit: p.kit,
        tags: p.tags ?? [],
        x0: Math.min(p.x - p.w / 2, p.x - p.labelBreed / 2),
        x1: Math.max(p.x + p.w / 2, p.x + p.labelBreed / 2),
        y0: ly - labelSchaal * 2,
        y1: y + p.h,
      });
    }
  });

  const rand = Math.max(GAP, labelSchaal);
  const viewW = latRechts - latLinks + rand * 2;
  const viewH = yMax - yMin + rand * 2;
  xMin = latLinks - rand;
  xMax = latRechts + rand;

  const MAX_H = 8000;
  let doekB = breedte;
  let hoogte = Math.round((breedte * viewH) / viewW);
  if (hoogte > MAX_H) { hoogte = MAX_H; doekB = Math.round((MAX_H * viewW) / viewH); }

  const renderer = gedeeldeRenderer(doekB, hoogte);

  const aspect = doekB / hoogte;
  const midX = (xMin + xMax) / 2;
  const midY = (yMin + yMax) / 2;
  const cam = new THREE.OrthographicCamera(
    (-viewH * aspect) / 2, (viewH * aspect) / 2, viewH / 2, -viewH / 2, 0.1, 200);
  cam.position.set(midX, midY + viewH * 0.1, 30);
  cam.lookAt(midX, midY, 0);
  renderer.render(scene, cam);
  canvas.width = doekB;
  canvas.height = hoogte;
  canvas.getContext('2d').drawImage(renderer.domElement, 0, 0);

  const naarPixel = (x, y) => {
    const v = new THREE.Vector3(x, y, 0).project(cam);
    return [((v.x + 1) / 2) * doekB, ((1 - v.y) / 2) * hoogte];
  };
  const inPixels = vakken.map((v) => {
    const [px0, py1] = naarPixel(v.x0, v.y0);
    const [px1, py0] = naarPixel(v.x1, v.y1);
    return { kit: v.kit, tags: v.tags ?? [], x: px0, y: py0, w: px1 - px0, h: py1 - py0 };
  });

  ruimOp(scene);
  return { hoogte, breedte: doekB, aantal: stukken.length, vakken: inPixels };
}

const versie = document.querySelector('meta[name=catalogus-versie]')?.content ?? '';
const groepen = await (await fetch(`schaalgroepen.json?v=${versie}`)).json();
const inhoud = document.getElementById('inhoud');

const MAATKLASSEN = [
  { id: 'klein', naam: 'Small', grens: 0.5 },
  { id: 'middel', naam: 'Medium', grens: 1.5 },
  { id: 'groot', naam: 'Large', grens: Infinity },
];
const maatVan = (item) => {
  const langste = Math.max(...(item.wdh ?? [item.hoogte]));
  return (MAATKLASSEN.find((k) => langste < k.grens) ?? MAATKLASSEN.at(-1)).id;
};

const kleurSleutel = (palet, hex) => `${palet}|${hex}`;
const kleurStaat = new Map();
const tagStaat = new Map();
const maatStaat = new Map();
const chipknoppen = [];
const VOLGENDE = { undefined: 'alleen', alleen: 'niet', niet: undefined };

function toonStaat(knop, staat) {
  knop.setAttribute('aria-pressed', String(staat === 'alleen'));
  if (staat === 'niet') knop.dataset.uit = '';
  else delete knop.dataset.uit;
}

const sleutelsMet = (staat, waarde) => [...staat].filter(([, v]) => v === waarde).map(([k]) => k);

function past(eigen, staat) {
  const alleen = sleutelsMet(staat, 'alleen');
  if (alleen.length && !eigen.some((e) => alleen.includes(e))) return false;
  return !eigen.some((e) => sleutelsMet(staat, 'niet').includes(e));
}

const komtDoor = (item) =>
  past((item.kleuren ?? []).map((hex) => kleurSleutel(item.palet, hex)), kleurStaat) &&
  past(item.tags ?? [], tagStaat) &&
  past([maatVan(item)], maatStaat);

const gefilterd = () =>
  groepen.map((g) => ({ ...g, items: g.items.filter(komtDoor) })).filter((g) => g.items.length);

function herschik() {
  for (const strip of new Set(chipknoppen.map((c) => c.strip))) {
    for (const chip of chipknoppen
      .filter((c) => c.strip === strip)
      .sort((a, b) => Number(b.staat.has(b.id)) - Number(a.staat.has(a.id)) || a.volgorde - b.volgorde)) {
      strip.append(chip.element);
    }
  }
}

function draai(staat, id, knop) {
  const nieuw = VOLGENDE[staat.get(id)];
  if (nieuw) staat.set(id, nieuw);
  else staat.delete(id);
  toonStaat(knop, nieuw);
  herschik();
  document.querySelector('#alles-wis').hidden =
    kleurStaat.size + tagStaat.size + maatStaat.size === 0;
  bouwSecties();
}

function chiprij(houder, items, staat) {
  const rij = document.createElement('div');
  rij.className = 'kleurbalk tagrij';
  const strip = document.createElement('div');
  strip.className = 'tagbalk-knoppen';
  strip.setAttribute('role', 'group');
  for (const item of items) {
    const knop = document.createElement('button');
    knop.type = 'button';
    knop.className = 'tagknop';
    knop.dataset.tag = item.id;
    const aantal = document.createElement('span');
    aantal.className = 'tagknop-aantal';
    aantal.textContent = item.aantal;
    knop.append(document.createTextNode(item.naam), aantal);
    toonStaat(knop, staat.get(item.id));
    knop.addEventListener('click', () => draai(staat, item.id, knop));
    strip.append(knop);
    chipknoppen.push({ id: item.id, element: knop, staat, strip, volgorde: chipknoppen.length });
  }
  rij.append(strip);
  houder.append(rij);
}

const BREEDTE = 1800;

let wachtrij = null;
let rij = Promise.resolve();

function bouwSecties() {
  wachtrij?.disconnect();
  inhoud.replaceChildren();
  const zichtbaar = gefilterd();

  for (const groep of zichtbaar) {
    const sectie = document.createElement('section');
    sectie.className = 'familie';
    sectie.id = groep.slug;
    sectie.innerHTML = `<h2>${groep.naam}</h2><div class="familie-doek"><canvas width="${BREEDTE}" height="400"></canvas></div>`;
    inhoud.appendChild(sectie);
  }

  wachtrij = new IntersectionObserver((ingangen) => {
    for (const ingang of ingangen) {
      if (!ingang.isIntersecting) continue;
      wachtrij.unobserve(ingang.target);
      const sectie = ingang.target;
      const groep = zichtbaar.find((g) => g.slug === sectie.id);
      const canvas = sectie.querySelector('canvas');
      sectie.classList.add('bezig');
      rij = rij.then(async () => {
        try {
          const uit = await tekenFamilie(groep, canvas, BREEDTE);
          if (!uit) sectie.classList.add('mislukt');
        } catch (fout) {
          console.error('family failed', sectie.id, fout);
          sectie.classList.add('mislukt');
        } finally {
          sectie.classList.remove('bezig');
        }
      });
    }
  }, { rootMargin: '600px 0px' });

  for (const sectie of inhoud.querySelectorAll('.familie')) wachtrij.observe(sectie);
}

async function bouwFilters() {
  const data = await (await fetch(`catalog.json?v=${versie}`)).json().catch(() => ({}));
  const alle = groepen.flatMap((g) => g.items);
  const tel = (f) => alle.filter(f).length;

  const kleurRij = document.querySelector('#kleurbalk-stalen');
  const gebruikt = new Set(alle.flatMap((i) => (i.kleuren ?? []).map((hex) => kleurSleutel(i.palet, hex))));
  for (const palet of data.paletten ?? []) {
    for (const kleur of palet.kleuren) {
      const sleutel = kleurSleutel(palet.id, kleur.hex);
      if (!gebruikt.has(sleutel)) continue;
      const knop = document.createElement('button');
      knop.type = 'button';
      knop.className = 'staal';
      knop.style.setProperty('--staal-kleur', kleur.hex);
      knop.title = `${kleur.naam} ${kleur.hex}`;
      knop.setAttribute('aria-label', knop.title);
      toonStaat(knop, kleurStaat.get(sleutel));
      knop.addEventListener('click', () => draai(kleurStaat, sleutel, knop));
      kleurRij.append(knop);
      chipknoppen.push({ id: sleutel, element: knop, staat: kleurStaat, strip: kleurRij, volgorde: chipknoppen.length });
    }
  }

  const tagbalk = document.querySelector('#tagbalk');
  chiprij(tagbalk, MAATKLASSEN
    .map((k) => ({ id: k.id, naam: k.naam, aantal: tel((i) => maatVan(i) === k.id) }))
    .filter((k) => k.aantal), maatStaat);

  const tags = (data.tags ?? [])
    .map((t) => ({ id: t.id, naam: t.naam, aantal: tel((i) => (i.tags ?? []).includes(t.id)) }))
    .filter((t) => t.aantal);
  if (tags.length) chiprij(tagbalk, tags, tagStaat);

  document.querySelector('#alles-wis').addEventListener('click', () => {
    kleurStaat.clear();
    tagStaat.clear();
    maatStaat.clear();
    for (const { element } of chipknoppen) toonStaat(element, undefined);
    herschik();
    document.querySelector('#alles-wis').hidden = true;
    bouwSecties();
  });
}

await bouwFilters();
bouwSecties();
