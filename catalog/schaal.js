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

// Elke familie krijgt precies even veel units in beeld, zodat een vat in elke familie even
// groot op het scherm staat. Een rij is RIJBREEDTE units breed; wat er niet meer bij past gaat
// naar de volgende rij. Alleen de hoogte van het beeld verschilt dus nog per familie.
const RIJBREEDTE = 5;
const GAP = 0.35;
const REGEL = 2.3;   // hoogte van een labelblok in eenheden labelSchaal (twee regels plus lucht)
const FONT_KIT = '600 44px system-ui, sans-serif';    // even groot en zwaar als de modelnaam; alleen de kleur verschilt
const FONT_MODEL = '600 44px system-ui, sans-serif';

// Eén gedeelde WebGL-context voor alle families. Een eigen renderer per familie loopt op een
// telefoon tegen de limiet aan (browsers staan er maar een stuk of acht toe) en dan tekent de
// rest niet meer. We renderen dus in één doek en kopiëren het resultaat naar het doek van de
// familie, dat gewoon 2D is.
let deler = null;
function gedeeldeRenderer(breedte, hoogte) {
  if (!deler) {
    deler = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    deler.setPixelRatio(1);
  }
  deler.setSize(breedte, hoogte, false);
  return deler;
}

// Alles wat een familie op de GPU heeft staan weer vrijgeven; anders loopt het geheugen vol
// als je door 39 families scrollt.
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
    } catch (fout) {
      console.error('laden mislukt', item.pad, fout);
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
      kit: item.kit,
      label: { kit: item.kit, model: `${item.model}  ${groep.bovenaanzicht ? 'd' : 'h'}=${maat.y.toFixed(2).replace('.', ',')}` },
    });
  }
  if (!stukken.length) return null;

  const lat = meetlat();
  const labelSchaal = RIJBREEDTE / 38;   // groter dan de 52 waarmee we begonnen: dit leest een stuk prettiger
  const rijen = verdeel(stukken, labelSchaal, lat);

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
      ctx.fillText(tekst.kit, c.width / 2, 60);
    }
    ctx.font = FONT_MODEL;
    ctx.fillStyle = inkt;
    ctx.fillText(tekst.model, c.width / 2, tekst.kit ? 148 : 62);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
    spr.scale.set(breed, labelSchaal * (c.height / 96), 1);
    spr.position.set(x, y, 1.2);
    spr.center.set(0.5, 1);
    scene.add(spr);
  };

  const latLinks = -GAP - lat.w / 2;
  const latRechts = RIJBREEDTE + GAP + lat.w / 2;
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  const vakken = [];   // wereldvak per stuk, om er later een kit mee uit te lichten

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
        x0: Math.min(p.x - p.w / 2, p.x - p.labelBreed / 2),
        x1: Math.max(p.x + p.w / 2, p.x + p.labelBreed / 2),
        y0: ly - labelSchaal * 2,
        y1: y + p.h,
      });
    }
  });

  // Breedte ligt vast (dus de schaal ook); alleen de hoogte volgt de inhoud.
  const rand = Math.max(GAP, labelSchaal);
  const viewW = latRechts - latLinks + rand * 2;
  const viewH = yMax - yMin + rand * 2;
  xMin = latLinks - rand;
  xMax = latRechts + rand;
  // Nooit uitrekken: loopt het beeld tegen de maximale hoogte aan, dan gaat de breedte mee omlaag
  // zodat de verhouding klopt. Een doek van meer dan ~8000 px hoog weigeren telefoons sowieso.
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

  // Wereldvakken omrekenen naar pixels, zodat het uitlichten later alleen nog 2D-werk is.
  const naarPixel = (x, y) => {
    const v = new THREE.Vector3(x, y, 0).project(cam);
    return [((v.x + 1) / 2) * doekB, ((1 - v.y) / 2) * hoogte];
  };
  const inPixels = vakken.map((v) => {
    const [px0, py1] = naarPixel(v.x0, v.y0);
    const [px1, py0] = naarPixel(v.x1, v.y1);
    return { kit: v.kit, x: px0, y: py0, w: px1 - px0, h: py1 - py0 };
  });

  ruimOp(scene);
  return { hoogte, breedte: doekB, aantal: stukken.length, vakken: inPixels };
}

const groepen = await (await fetch(`schaalgroepen.json?v=${document.querySelector('meta[name=catalogus-versie]')?.content ?? ''}`)).json();
const paneel = document.getElementById('families');
const inhoud = document.getElementById('inhoud');

document.getElementById('samenvatting').textContent =
  `${groepen.length} families, ${groepen.reduce((s, g) => s + g.items.length, 0)} modellen — allemaal op dezelfde schaal, met een meetlat aan weerszijden van elke rij.`;

const BREEDTE = 1800;

// Uitlichten: kies zoveel kits als je wilt, dan legt een sluier zich over al het andere heen.
// De sluier is een tweede doek bovenop het render, dus omschakelen kost geen nieuw render.
const uitgelicht = new Set();

function tekenSluier(sectie) {
  const laag = sectie.querySelector('canvas.sluier');
  const vakken = sectie.vakken;
  if (!laag || !vakken) return;
  const ctx = laag.getContext('2d');
  ctx.clearRect(0, 0, laag.width, laag.height);
  if (!uitgelicht.size) return;
  const { papier } = kleuren();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = papier;
  ctx.globalAlpha = 0.78;
  ctx.fillRect(0, 0, laag.width, laag.height);
  // Gaten knippen waar de gekozen kits staan.
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-out';
  const marge = laag.width * 0.004;
  for (const v of vakken) {
    if (!uitgelicht.has(v.kit)) continue;
    ctx.fillRect(v.x - marge, v.y - marge, v.w + marge * 2, v.h + marge * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
}

function ververs() {
  for (const sectie of inhoud.querySelectorAll('.familie')) tekenSluier(sectie);
  for (const knop of kitBalk.querySelectorAll('button')) {
    const aan = uitgelicht.has(knop.dataset.kit);
    knop.classList.toggle('aan', aan);
    knop.setAttribute('aria-pressed', String(aan));
  }
  wisKnop.hidden = uitgelicht.size === 0;
  const gekozen = [...uitgelicht];
  telling.textContent = gekozen.length === 0
    ? 'Kies één of meer kits om ze eruit te lichten.'
    : gekozen.length <= 3
      ? `${gekozen.slice(0, -1).join(', ')}${gekozen.length > 1 ? ' en ' : ''}${gekozen.at(-1)} uitgelicht`
      : `${gekozen.length} kits uitgelicht`;
}

const kitBalk = document.getElementById('kits');
const telling = document.getElementById('kit-telling');
const wisKnop = document.getElementById('kit-wis');

const alleKits = [...new Set(groepen.flatMap((g) => g.items.map((i) => i.kit)))].sort();
for (const kit of alleKits) {
  const knop = document.createElement('button');
  knop.type = 'button';
  knop.dataset.kit = kit;
  knop.textContent = kit;
  knop.setAttribute('aria-pressed', 'false');
  knop.addEventListener('click', () => {
    if (uitgelicht.has(kit)) uitgelicht.delete(kit);
    else uitgelicht.add(kit);
    ververs();
  });
  kitBalk.appendChild(knop);
}
wisKnop.addEventListener('click', () => { uitgelicht.clear(); ververs(); });

for (const groep of groepen) {
  const sectie = document.createElement('section');
  sectie.className = 'familie';
  sectie.id = groep.slug;
  const hoogtes = groep.items.map((i) => i.hoogte);
  sectie.innerHTML = `
    <h2>${groep.naam}</h2>
    <p class="familie-meta">${groep.items.length} modellen · ${Math.min(...hoogtes).toFixed(2).replace('.', ',')} – ${Math.max(...hoogtes).toFixed(2).replace('.', ',')} hoog</p>
    <div class="familie-doek"><canvas width="${BREEDTE}" height="400"></canvas><canvas class="sluier" width="${BREEDTE}" height="400"></canvas></div>`;
  inhoud.appendChild(sectie);

  const link = document.createElement('a');
  link.href = `#${groep.slug}`;
  link.textContent = groep.naam;
  paneel.appendChild(link);
}

// Pas tekenen als een familie in beeld komt: honderden modellen tegelijk laden is zonde.
const wachtrij = new IntersectionObserver((ingangen) => {
  for (const ingang of ingangen) {
    if (!ingang.isIntersecting) continue;
    wachtrij.unobserve(ingang.target);
    const sectie = ingang.target;
    const groep = groepen.find((g) => g.slug === sectie.id);
    const canvas = sectie.querySelector('canvas:not(.sluier)');
    sectie.classList.add('bezig');
    tekenFamilie(groep, canvas, BREEDTE)
      .then((uit) => {
        sectie.classList.remove('bezig');
        if (!uit) { sectie.classList.add('mislukt'); return; }
        sectie.vakken = uit.vakken;
        const laag = sectie.querySelector('canvas.sluier');
        laag.width = uit.breedte;
        laag.height = uit.hoogte;
        tekenSluier(sectie);
      })
      .catch((fout) => {
        console.error('familie mislukt', sectie.id, fout);
        sectie.classList.remove('bezig');
        sectie.classList.add('mislukt');
      });
  }
}, { rootMargin: '600px 0px' });

for (const sectie of inhoud.querySelectorAll('.familie')) wachtrij.observe(sectie);
ververs();
