// Schaalpagina: per familie alle modellen naast elkaar op één schaal, met meetlatten.
//
// De pagina laadt de .glb's zelf, dus wat je ziet is altijd wat er in kits/workfiles staat —
// ook meteen na een herschaling. Families komen uit schaalgroepen.json, dat build-catalog.mjs
// uit de catalogus afleidt.
//
// De indeling is dezelfde als in tools/vergelijk-groottes: rijen vullen tot ze vol zijn,
// labels wijken per regel uit tot ze niet botsen, en de meetlat zakt mee met de familie.

import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/three-addons/GLTFLoader.js';

const GAP_FACTOR = 0.35;
const MAX_ASPECT = 2.4;
const MAX_RIJEN = 12;
const LATTEN = [0.05, 0.1, 0.25, 0.5, 1];
const FONT = '600 44px system-ui, sans-serif';

const loader = new GLTFLoader();
const laad = (pad) => new Promise((res, rej) => loader.load(pad, res, undefined, rej));
const meetCtx = document.createElement('canvas').getContext('2d');
const tekstBreedte = (tekst) => {
  meetCtx.font = FONT;
  return Math.ceil(meetCtx.measureText(tekst).width) + 16;
};

const kleuren = () => {
  const stijl = getComputedStyle(document.documentElement);
  const lees = (naam, terugval) => (stijl.getPropertyValue(naam).trim() || terugval);
  return { papier: lees('--papier-diep', '#f2e9dd'), inkt: lees('--inkt', '#2f2a26') };
};

function meetlat(maxH) {
  const hoog = LATTEN.find((l) => l >= maxH * 1.2) ?? LATTEN[LATTEN.length - 1];
  const deel = hoog / 4;
  const dik = Math.max(0.012, hoog * 0.08);
  const blok = new THREE.BoxGeometry(dik, deel, dik);
  const rood = new THREE.MeshLambertMaterial({ color: 0xcc3333 });
  const wit = new THREE.MeshLambertMaterial({ color: 0xf0ece3 });
  return {
    w: dik,
    h: hoog,
    label: hoog === 1 ? '1 unit' : `${String(hoog).replace('.', ',')} unit`,
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

// Labels van één rij over zo min mogelijk regels: elk label zakt een regel als het
// tegen zijn linkerbuur aan loopt.
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

function verdeel(stukken, gap, r, labelSchaal, rek) {
  const loop = stukken.reduce((s, p) => s + gap + p.w, 0);
  const limiet = Math.max((loop / r) * rek, Math.max(...stukken.map((p) => p.w)) + gap);
  const rijen = [];
  let rij = [];
  let breed = 0;
  for (const p of stukken) {
    if (rij.length && breed + gap + p.w > limiet) { rijen.push({ rij, breed }); rij = []; breed = 0; }
    breed += gap + p.w / 2;
    p.x = breed;
    breed += p.w / 2;
    rij.push(p);
  }
  if (rij.length) rijen.push({ rij, breed });
  return { rijen, contentW: Math.max(...rijen.map((x) => x.breed)) + gap };
}

function meetRijen(rijen, lat, labelSchaal) {
  for (const x of rijen) {
    x.regels = labelRegels(x.rij, labelSchaal);
    x.labelBlok = labelSchaal * (0.7 + 1.15 * (x.regels - 1) + 1);
    x.hoog = Math.max(lat.h + labelSchaal * 1.4, ...x.rij.map((p) => p.h)) + x.labelBlok;
  }
  return rijen.reduce((s, x) => s + x.hoog, 0);
}

export async function tekenFamilie(groep, canvas, breedte) {
  const { papier, inkt } = kleuren();
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
    } catch {
      continue;  // een model dat niet laadt mag de rest van de familie niet ophouden
    }
    const obj = gltf.scene;
    let doos = new THREE.Box3().setFromObject(obj);
    let maat = doos.getSize(new THREE.Vector3());
    const spil = new THREE.Group();
    spil.add(obj);
    if (maat.z > maat.x * 1.4) obj.rotation.y = Math.PI / 2;
    doos = new THREE.Box3().setFromObject(spil);
    maat = doos.getSize(new THREE.Vector3());
    obj.position.set(-(doos.min.x + doos.max.x) / 2, -doos.min.y, -(doos.min.z + doos.max.z) / 2);
    stukken.push({ obj: spil, w: maat.x, h: maat.y, label: `${item.id}  h=${maat.y.toFixed(2)}` });
  }
  if (!stukken.length) return null;

  const lat = meetlat(Math.max(...stukken.map((p) => p.h)));
  const gap = Math.max(0.02, (GAP_FACTOR * stukken.reduce((s, p) => s + p.w, 0)) / stukken.length);

  let keuze = { r: 1, rek: 1 };
  let labelSchaal = 0.1;
  let indeling = null;
  for (let r = 1; r <= MAX_RIJEN; r++) {
    indeling = verdeel(stukken, gap, r, labelSchaal, 1);
    labelSchaal = indeling.contentW / 62;
    let contentH = meetRijen(verdeel(stukken, gap, r, labelSchaal, 1).rijen, lat, labelSchaal);
    keuze = { r, rek: 1 };
    for (let rek = 1.0; rek <= 1.6; rek += 0.03) {
      const beter = verdeel(stukken, gap, r, labelSchaal, rek);
      if (beter.rijen.length > r) continue;
      indeling = beter;
      contentH = meetRijen(beter.rijen, lat, labelSchaal);
      keuze = { r, rek };
      if (beter.rijen[beter.rijen.length - 1].breed >= beter.contentW * 0.5) break;
    }
    if (indeling.contentW / contentH <= MAX_ASPECT || r === MAX_RIJEN) break;
  }
  // verdeel() zet x, regel en labelBreed op de stukken zelf: de winnende indeling moet de laatste zijn.
  const { rijen } = verdeel(stukken, gap, keuze.r, labelSchaal, keuze.rek);
  meetRijen(rijen, lat, labelSchaal);

  const basis = [];
  for (let i = rijen.length - 1, y = 0; i >= 0; i--) { basis[i] = y + rijen[i].labelBlok; y += rijen[i].hoog; }

  const label = (tekst, x, y, breed) => {
    const c = document.createElement('canvas');
    c.width = tekstBreedte(tekst);
    c.height = 96;
    const ctx = c.getContext('2d');
    ctx.fillStyle = inkt;
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.fillText(tekst, c.width / 2, 62);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
    spr.scale.set(breed, labelSchaal, 1);
    spr.position.set(x, y, 1.2);
    spr.center.set(0.5, 1);
    scene.add(spr);
  };

  const contentW = Math.max(...rijen.map((r) => r.breed));
  const latLinks = -gap - lat.w / 2;
  const latRechts = contentW + gap + lat.w / 2;
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;

  rijen.forEach((r, i) => {
    const y = basis[i];
    const raster = new THREE.GridHelper(80, 80, 0xaaa298, 0xc6bfb2);
    raster.position.set(39, y, -41);
    raster.material.opacity = 0.5;
    raster.material.transparent = true;
    scene.add(raster);
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
      const ly = y - labelSchaal * 0.7 - p.regel * labelSchaal * 1.15;
      label(p.label, p.x, ly, p.labelBreed);
      xMin = Math.min(xMin, p.x - p.w / 2, p.x - p.labelBreed / 2);
      xMax = Math.max(xMax, p.x + p.w / 2, p.x + p.labelBreed / 2);
      yMin = Math.min(yMin, ly - labelSchaal);
      yMax = Math.max(yMax, y + p.h);
    }
  });

  const rand = Math.max(gap, labelSchaal);
  const viewW = xMax - xMin + rand * 2;
  const viewH = yMax - yMin + rand * 2;
  const hoogte = Math.round((breedte * viewH) / viewW);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(breedte, hoogte, false);

  const aspect = breedte / hoogte;
  const midX = (xMin + xMax) / 2;
  const midY = (yMin + yMax) / 2;
  const cam = new THREE.OrthographicCamera(
    (-viewH * aspect) / 2, (viewH * aspect) / 2, viewH / 2, -viewH / 2, 0.1, 200);
  cam.position.set(midX, midY + viewH * 0.1, 30);
  cam.lookAt(midX, midY, 0);
  renderer.render(scene, cam);
  renderer.dispose();
  return { hoogte, aantal: stukken.length };
}

const groepen = await (await fetch(`schaalgroepen.json?v=${document.querySelector('meta[name=catalogus-versie]')?.content ?? ''}`)).json();
const paneel = document.getElementById('families');
const inhoud = document.getElementById('inhoud');

document.getElementById('samenvatting').textContent =
  `${groepen.length} families, ${groepen.reduce((s, g) => s + g.items.length, 0)} modellen — allemaal op dezelfde schaal, met een meetlat aan weerszijden van elke rij.`;

const BREEDTE = 1800;
for (const groep of groepen) {
  const sectie = document.createElement('section');
  sectie.className = 'familie';
  sectie.id = groep.slug;
  const hoogtes = groep.items.map((i) => i.hoogte);
  sectie.innerHTML = `
    <h2>${groep.naam}</h2>
    <p class="familie-meta">${groep.items.length} modellen · ${Math.min(...hoogtes).toFixed(2).replace('.', ',')} – ${Math.max(...hoogtes).toFixed(2).replace('.', ',')} hoog</p>
    <div class="familie-doek"><canvas width="${BREEDTE}" height="400"></canvas></div>`;
  inhoud.appendChild(sectie);

  const link = document.createElement('a');
  link.href = `#${groep.slug}`;
  link.textContent = groep.naam;
  paneel.appendChild(link);
}

// Pas tekenen als een familie in beeld komt: 658 modellen tegelijk laden is zonde.
const wachtrij = new IntersectionObserver((ingangen) => {
  for (const ingang of ingangen) {
    if (!ingang.isIntersecting) continue;
    wachtrij.unobserve(ingang.target);
    const sectie = ingang.target;
    const groep = groepen.find((g) => g.slug === sectie.id);
    const canvas = sectie.querySelector('canvas');
    sectie.classList.add('bezig');
    tekenFamilie(groep, canvas, BREEDTE)
      .then((uit) => {
        sectie.classList.remove('bezig');
        if (!uit) sectie.classList.add('mislukt');
      })
      .catch(() => {
        sectie.classList.remove('bezig');
        sectie.classList.add('mislukt');
      });
  }
}, { rootMargin: '600px 0px' });

for (const sectie of inhoud.querySelectorAll('.familie')) wachtrij.observe(sectie);
