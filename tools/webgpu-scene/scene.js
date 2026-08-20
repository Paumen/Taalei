/**
 * Een scène uit de kits, getekend met WebGPU volgens licht.json.
 *
 * licht.json is de opdracht en wordt hier letterlijk gevolgd:
 *
 *   - albedo staat in sRGB in de colormap, gaat met gamma 2.2 naar lineair;
 *   - de zon is een richtingslicht op elevatie/azimut, kleur × intensiteit;
 *   - het omgevingslicht is de omgevingskleur naar de luchtkleur getrokken met
 *     skyTint, × intensiteit, en werkt gelijkmatig uit alle richtingen;
 *   - mist begint op startUnits en dooft met density — die staat op 0, dus de
 *     mist doet niets, maar de knop zit erin;
 *   - de uitvoer wordt met exposure geschaald, geklemd ("clamp", dus geen
 *     tonemapping-curve) en met 1/2.2 teruggezet naar sRGB.
 *
 * De textuur laadt daarom als rgba8unorm en niet als de -srgb-variant, en het
 * canvas krijgt een formaat zonder -srgb: het decoderen en coderen gebeurt in
 * de shader, precies één keer, met de gamma uit de opdracht.
 *
 * Wat er níét in de opdracht staat, zit er ook niet in: geen schaduwen, geen
 * spiegeling, geen tonemapping-curve.
 */

import { laadGlb } from './glb.js';
import { draaiY, eenheid, kijkNaar, maal, normaalMatrix, perspectief, uitTRS } from './wiskunde.js';

const KITS = '/kits/';
const graden = (d) => (d * Math.PI) / 180;

/* Welke atlas eroverheen gaat. Standaard die van de kits zelf; met ?atlas=<pad>
 * is een kandidaat te bekijken zonder iets in kits/ aan te raken, bijvoorbeeld
 * ?atlas=/tools/vergelijk-kleurmap/colormap-v2.png */
const ATLAS = new URLSearchParams(location.search).get('atlas') ?? `${KITS}colormap.png`;

/** sRGB-hex → lineair, met de gamma uit de opdracht (2.2, geen sRGB-knik). */
const naarLineair = (hex) =>
  [1, 3, 5].map((i) => Math.pow(parseInt(hex.slice(i, i + 2), 16) / 255, 2.2));

/** ... en de bytes zoals ze op het scherm horen, voor de achtergrond. */
const naarScherm = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

const melding = (tekst) => {
  document.getElementById('melding').textContent = tekst;
  document.getElementById('melding').hidden = false;
};

/* -- shader ---------------------------------------------------------------- */

const SHADER = /* wgsl */ `
struct Scene {
  kijk       : mat4x4f,
  zon        : vec4f,   // xyz: richting náár de zon
  zonKleur   : vec4f,   // lineair, intensiteit ingerekend
  omgeving   : vec4f,   // lineair, intensiteit ingerekend
  mist       : vec4f,   // rgb lineair, a: dichtheid
  camera     : vec4f,   // xyz: oogpunt, w: waar de mist begint
  uitvoer    : vec4f,   // x: belichting, y: gamma
};
struct Object {
  model   : mat4x4f,
  normaal : mat4x4f,
};

@group(0) @binding(0) var<uniform> scene : Scene;
@group(0) @binding(1) var atlasFilter : sampler;
@group(0) @binding(2) var atlas : texture_2d<f32>;
@group(1) @binding(0) var<uniform> object : Object;

struct NaarFragment {
  @builtin(position) plek : vec4f,
  @location(0) wereld : vec3f,
  @location(1) normaal : vec3f,
  @location(2) uv : vec2f,
};

@vertex
fn hoekpunt(
  @location(0) positie : vec3f,
  @location(1) normaal : vec3f,
  @location(2) uv : vec2f,
) -> NaarFragment {
  let wereld = object.model * vec4f(positie, 1.0);
  var uit : NaarFragment;
  uit.plek = scene.kijk * wereld;
  uit.wereld = wereld.xyz;
  uit.normaal = (object.normaal * vec4f(normaal, 0.0)).xyz;
  uit.uv = uv;
  return uit;
}

@fragment
fn vlak(in : NaarFragment, @builtin(front_facing) voorkant : bool) -> @location(0) vec4f {
  // Enkelzijdige vlakken (gras, bladeren) worden van twee kanten gezien; dan
  // wijst de normaal van de achterkant de verkeerde kant op.
  var n = normalize(in.normaal);
  if (!voorkant) { n = -n; }

  let albedo = pow(textureSample(atlas, atlasFilter, in.uv).rgb, vec3f(2.2));
  let inval = max(dot(n, scene.zon.xyz), 0.0);
  var kleur = albedo * (scene.zonKleur.rgb * inval + scene.omgeving.rgb);

  // Mist vanaf scene.camera.w, exponentieel met scene.mist.a. Met dichtheid 0
  // komt hier 0 uit en blijft de kleur zoals hij was.
  let dikte = max(distance(in.wereld, scene.camera.xyz) - scene.camera.w, 0.0);
  kleur = mix(kleur, scene.mist.rgb, 1.0 - exp(-scene.mist.a * dikte));

  // Belichting, klemmen, en terug naar sRGB.
  kleur = clamp(kleur * scene.uitvoer.x, vec3f(0.0), vec3f(1.0));
  return vec4f(pow(kleur, vec3f(1.0 / scene.uitvoer.y)), 1.0);
}
`;

/* -- opbouw ---------------------------------------------------------------- */

const canvas = document.getElementById('doek');

if (!navigator.gpu) {
  melding('Deze browser heeft geen WebGPU (navigator.gpu ontbreekt).');
  throw new Error('geen WebGPU');
}
const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
  melding('WebGPU is er wel, maar er kwam geen adapter terug.');
  throw new Error('geen adapter');
}
const apparaat = await adapter.requestDevice();
const context = canvas.getContext('webgpu');
const formaat = navigator.gpu.getPreferredCanvasFormat();
context.configure({ device: apparaat, format: formaat, alphaMode: 'opaque' });

const [licht, opstelling] = await Promise.all([
  fetch('./licht.json').then((r) => r.json()),
  fetch('./opstelling.json').then((r) => r.json()),
]);

/* De atlas als lineaire textuur: het decoderen doet de shader zelf, precies
 * zoals de opdracht het opschrijft. colorSpaceConversion 'none' houdt de bytes
 * heel op weg naar de GPU. */
const beeld = await createImageBitmap(await (await fetch(ATLAS)).blob(), {
  colorSpaceConversion: 'none',
});
const textuur = apparaat.createTexture({
  size: [beeld.width, beeld.height],
  format: 'rgba8unorm',
  usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
});
apparaat.queue.copyExternalImageToTexture({ source: beeld }, { texture: textuur }, [beeld.width, beeld.height]);

/* Geen mipmaps: de cellen van de atlas zijn 32 pixels breed, en op een kleine
 * mip lopen buurcellen in elkaar over. Liever scherp dan gemengd. */
const filter = apparaat.createSampler({ magFilter: 'linear', minFilter: 'linear' });

/* -- modellen -------------------------------------------------------------- */

const plaatsingen = [
  ...vloerTegels(opstelling.vloer),
  ...opstelling.props.map((p) => ({
    model: p.model,
    matrix: maal(uitTRS([p.op[0], 0, p.op[1]]), draaiY(graden(p.draai ?? 0))),
  })),
];

function vloerTegels({ tegel, tegels }) {
  const rand = ((tegels - 1) * tegel) / 2;
  const uit = [];
  for (let i = 0; i < tegels; i++) {
    for (let j = 0; j < tegels; j++) {
      uit.push({
        model: opstelling.vloer.model,
        matrix: uitTRS([i * tegel - rand, 0, j * tegel - rand]),
      });
    }
  }
  return uit;
}

/** Per model één set buffers; de plaatsingen delen die. */
const modellen = new Map();
for (const naam of new Set(plaatsingen.map((p) => p.model))) {
  const stukken = await laadGlb(`${KITS}${naam}.glb`);
  modellen.set(naam, stukken.map(({ vertices, indices }) => {
    const vb = apparaat.createBuffer({ size: vertices.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    apparaat.queue.writeBuffer(vb, 0, vertices);
    const ib = apparaat.createBuffer({ size: indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    apparaat.queue.writeBuffer(ib, 0, indices);
    return { vb, ib, aantal: indices.length };
  }));
}

/* -- uniforms -------------------------------------------------------------- */

const SCENE_BYTES = 64 + 6 * 16;
const OBJECT_STAP = 256; // uitlijning voor een dynamische offset
const sceneBuffer = apparaat.createBuffer({ size: SCENE_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
const objectBuffer = apparaat.createBuffer({
  size: OBJECT_STAP * plaatsingen.length,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

/* De modelmatrix van elke plaatsing staat vast; één keer wegschrijven volstaat. */
{
  const blok = new Float32Array((OBJECT_STAP / 4) * plaatsingen.length);
  plaatsingen.forEach((p, i) => {
    blok.set(p.matrix, (i * OBJECT_STAP) / 4);
    blok.set(normaalMatrix(p.matrix), (i * OBJECT_STAP) / 4 + 16);
  });
  apparaat.queue.writeBuffer(objectBuffer, 0, blok);
}

const sceneIndeling = apparaat.createBindGroupLayout({
  entries: [
    { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {} },
    { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
    { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
  ],
});
const objectIndeling = apparaat.createBindGroupLayout({
  entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { hasDynamicOffset: true, minBindingSize: 128 } }],
});
const sceneGroep = apparaat.createBindGroup({
  layout: sceneIndeling,
  entries: [
    { binding: 0, resource: { buffer: sceneBuffer } },
    { binding: 1, resource: filter },
    { binding: 2, resource: textuur.createView() },
  ],
});
const objectGroep = apparaat.createBindGroup({
  layout: objectIndeling,
  entries: [{ binding: 0, resource: { buffer: objectBuffer, size: 128 } }],
});

const module = apparaat.createShaderModule({ code: SHADER });
const pijplijn = apparaat.createRenderPipeline({
  layout: apparaat.createPipelineLayout({ bindGroupLayouts: [sceneIndeling, objectIndeling] }),
  vertex: {
    module,
    entryPoint: 'hoekpunt',
    buffers: [{
      arrayStride: 8 * 4,
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },
        { shaderLocation: 1, offset: 12, format: 'float32x3' },
        { shaderLocation: 2, offset: 24, format: 'float32x2' },
      ],
    }],
  },
  fragment: { module, entryPoint: 'vlak', targets: [{ format: formaat }] },
  /* niets wegsnijden: een deel van de props is enkelzijdig gemodelleerd */
  primitive: { topology: 'triangle-list', cullMode: 'none' },
  depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
});

/* -- licht uit licht.json -------------------------------------------------- */

const el = graden(licht.sun.elevationDeg);
const az = graden(licht.sun.azimuthDeg);
/* azimut 0° kijkt naar +z en loopt met de klok mee naar +x */
const zon = [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
const zonKleur = naarLineair(licht.sun.colorSRGB).map((c) => c * licht.sun.intensity);
const luchtLineair = naarLineair(licht.sky.colorSRGB);
const omgeving = naarLineair(licht.ambient.colorSRGB)
  .map((c, i) => (c + (luchtLineair[i] - c) * licht.ambient.skyTint) * licht.ambient.intensity);
const mist = naarLineair(licht.fog.colorSRGB);
const lucht = naarScherm(licht.sky.colorSRGB);
if (licht.output.tonemap !== 'clamp') {
  melding(`tonemap "${licht.output.tonemap}" kent deze scène niet; er wordt geklemd.`);
}

/* -- camera ---------------------------------------------------------------- */

const blik = {
  doel: opstelling.camera.doel,
  afstand: opstelling.camera.afstand,
  hoek: graden(opstelling.camera.hoek),
  hoogte: graden(opstelling.camera.hoogtehoek),
};
let sleept = null;
canvas.addEventListener('pointerdown', (e) => { sleept = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointerup', () => { sleept = null; });
canvas.addEventListener('pointermove', (e) => {
  if (!sleept) return;
  blik.hoek -= (e.clientX - sleept.x) * 0.005;
  blik.hoogte = Math.min(graden(85), Math.max(graden(2), blik.hoogte - (e.clientY - sleept.y) * 0.005));
  sleept = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  blik.afstand = Math.min(20, Math.max(2, blik.afstand * (1 + Math.sign(e.deltaY) * 0.1)));
}, { passive: false });

/* -- tekenen --------------------------------------------------------------- */

let diepte = null;
function meetCanvas() {
  const schaal = Math.min(window.devicePixelRatio || 1, 2);
  const breed = Math.max(1, Math.round(canvas.clientWidth * schaal));
  const hoog = Math.max(1, Math.round(canvas.clientHeight * schaal));
  if (canvas.width === breed && canvas.height === hoog && diepte) return;
  canvas.width = breed;
  canvas.height = hoog;
  diepte?.destroy();
  diepte = apparaat.createTexture({ size: [breed, hoog], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });
}

const sceneData = new Float32Array(SCENE_BYTES / 4);

function teken() {
  meetCanvas();

  const oog = [
    blik.doel[0] + blik.afstand * Math.cos(blik.hoogte) * Math.sin(blik.hoek),
    blik.doel[1] + blik.afstand * Math.sin(blik.hoogte),
    blik.doel[2] + blik.afstand * Math.cos(blik.hoogte) * Math.cos(blik.hoek),
  ];
  const kijk = maal(perspectief(graden(38), canvas.width / canvas.height, 0.1, 200), kijkNaar(oog, blik.doel));

  sceneData.set(kijk, 0);
  sceneData.set([...zon, 0], 16);
  sceneData.set([...zonKleur, 0], 20);
  sceneData.set([...omgeving, 0], 24);
  sceneData.set([...mist, licht.fog.density], 28);
  sceneData.set([...oog, licht.fog.startUnits], 32);
  sceneData.set([licht.output.exposure, 2.2, 0, 0], 36);
  apparaat.queue.writeBuffer(sceneBuffer, 0, sceneData);

  const opdracht = apparaat.createCommandEncoder();
  const pas = opdracht.beginRenderPass({
    colorAttachments: [{
      view: context.getCurrentTexture().createView(),
      clearValue: { r: lucht[0], g: lucht[1], b: lucht[2], a: 1 },
      loadOp: 'clear',
      storeOp: 'store',
    }],
    depthStencilAttachment: {
      view: diepte.createView(),
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    },
  });
  pas.setPipeline(pijplijn);
  pas.setBindGroup(0, sceneGroep);
  plaatsingen.forEach((plaatsing, i) => {
    pas.setBindGroup(1, objectGroep, [i * OBJECT_STAP]);
    for (const stuk of modellen.get(plaatsing.model)) {
      pas.setVertexBuffer(0, stuk.vb);
      pas.setIndexBuffer(stuk.ib, 'uint32');
      pas.drawIndexed(stuk.aantal);
    }
  });
  pas.end();
  apparaat.queue.submit([opdracht.finish()]);

  requestAnimationFrame(teken);
}

teken();
/* de renderer draait; render.mjs schiet pas als dit vlaggetje staat */
requestAnimationFrame(() => requestAnimationFrame(() => { window.KLAAR = true; }));
