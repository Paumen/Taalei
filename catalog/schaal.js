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
const REGEL = 2.3;   // hoogte van een labelblok in eenheden labelSchaal (twee regels plus lucht)
const FONT_KIT = '500 38px system-ui, sans-serif';
const FONT_MODEL = '600 44px system-ui, sans-serif';

const loader = new GLTFLoader();
const laad = (pad) => new Promise((res, rej) => loader.load(pad, res, undefined, rej));
const meetCtx = document.createElement('canvas').getContext('2d');
// Een label heeft twee regels: de kitnaam zacht boven, de modelnaam met de maat eronder.
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
    lijnFijn: lees('--lijn', '#e3d7c7'),
    lijnZwaar: lees('--inkt-zacht', '#9c9285'),
  };
};

// Meetlat van 1 unit in vier blokken rood/wit, aan beide kanten van elke rij. Altijd 1 unit,
// ook bij een familie van platte props: dan is het beeld laag, maar de maatstaf is overal dezelfde.
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
    label: { kit: '', model: '1 unit' },
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
    x.labelBlok = labelSchaal * (0.7 + REGEL * (x.regels - 1) + REGEL);
    x.hoog = Math.max(lat.h + labelSchaal * 1.4, ...x.rij.map((p) => p.h)) + x.labelBlok;
  }
  return rijen.reduce((s, x) => s + x.hoog, 0);
}

// Ruitjespapier achter de modellen: fijne lijnen om de 0,25 unit, zware om de hele unit.
// De stap is overal dezelfde, dus je kunt in elke familie even goed een hoogte aflezen.
function achtergrond(y, links, rechts, hoogte, fijn, zwaar) {
  const g = new THREE.Group();
  const top = Math.ceil(Math.max(hoogte, 1) * 4) / 4;
  for (const [stap, kleur, dekking] of [[0.25, fijn, 0.55], [1, zwaar, 0.85]]) {
    const punten = [];
    for (let x = Math.ceil(links / stap) * stap; x <= rechts + 1e-6; x += stap) punten.push(x, y, -0.5, x, y + top, -0.5);
    for (let h = 0; h <= top + 1e-6; h += stap) punten.push(links, y + h, -0.5, rechts, y + h, -0.5);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(punten, 3));
    g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: kleur, transparent: true, opacity: dekking })));
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
    } catch {
      continue;  // een model dat niet laadt mag de rest van de familie niet ophouden
    }
    const obj = gltf.scene;
    let doos = new THREE.Box3().setFromObject(obj);
    let maat = doos.getSize(new THREE.Vector3());
    const spil = new THREE.Group();
    spil.add(obj);
    // Platte dingen (schappen, zeesterren) lees je van boven, niet van opzij.
    if (groep.bovenaanzicht) obj.rotation.x = -Math.PI / 2;
    else if (maat.z > maat.x * 1.4) obj.rotation.y = Math.PI / 2;
    doos = new THREE.Box3().setFromObject(spil);
    maat = doos.getSize(new THREE.Vector3());
    obj.position.set(-(doos.min.x + doos.max.x) / 2, -doos.min.y, -(doos.min.z + doos.max.z) / 2);
    stukken.push({
      obj: spil,
      w: maat.x,
      h: maat.y,
      label: { kit: item.kit, model: `${item.model}  ${groep.bovenaanzicht ? 'd' : 'h'}=${maat.y.toFixed(2).replace('.', ',')}` },
    });
  }
  if (!stukken.length) return null;

  const lat = meetlat();
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
    c.height = tekst.kit ? 192 : 96;   // zonder kitnaam (de meetlat) is één regel genoeg
    const ctx = c.getContext('2d');
    ctx.textAlign = 'center';
    if (tekst.kit) {
      ctx.font = FONT_KIT;
      ctx.fillStyle = inktZacht;
      ctx.fillText(tekst.kit, c.width / 2, 52);
    }
    ctx.font = FONT_MODEL;
    ctx.fillStyle = inkt;
    ctx.fillText(tekst.model, c.width / 2, tekst.kit ? 140 : 62);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
    spr.scale.set(breed, labelSchaal * (c.height / 96), 1);
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
