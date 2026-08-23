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
const RIJBREEDTE = 9;
const GAP = 0.35;
const REGEL = 2.3;   // hoogte van een labelblok in eenheden labelSchaal (twee regels plus lucht)
const FONT_KIT = '600 44px system-ui, sans-serif';    // even groot en zwaar als de modelnaam; alleen de kleur verschilt
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
  const labelSchaal = RIJBREEDTE / 52;
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

  // Breedte ligt vast (dus de schaal ook); alleen de hoogte volgt de inhoud.
  const rand = Math.max(GAP, labelSchaal);
  const viewW = latRechts - latLinks + rand * 2;
  const viewH = yMax - yMin + rand * 2;
  xMin = latLinks - rand;
  xMax = latRechts + rand;
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
