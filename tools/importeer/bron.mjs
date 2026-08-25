import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { readGlb, readAccessor } from '../../catalog/tools/glb.mjs';

const EENHEID = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function maal(a, b) {
  const r = new Array(16).fill(0);
  for (let kolom = 0; kolom < 4; kolom++) {
    for (let rij = 0; rij < 4; rij++) {
      let som = 0;
      for (let k = 0; k < 4; k++) som += a[k * 4 + rij] * b[kolom * 4 + k];
      r[kolom * 4 + rij] = som;
    }
  }
  return r;
}

function nodeMatrix(node) {
  if (node.matrix) return node.matrix;
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
  const xx = qx * x2, xy = qx * y2, xz = qx * z2;
  const yy = qy * y2, yz = qy * z2, zz = qz * z2;
  const wx = qw * x2, wy = qw * y2, wz = qw * z2;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

const punt = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];

const richting = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z,
  m[1] * x + m[5] * y + m[9] * z,
  m[2] * x + m[6] * y + m[10] * z,
];

const naarSrgb = (lineair) => {
  const v = lineair <= 0.0031308 ? lineair * 12.92 : 1.055 * lineair ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(Math.max(v, 0), 1) * 255);
};

function leesGltfBestand(pad) {
  if (pad.endsWith('.glb')) return readGlb(pad);

  const json = JSON.parse(readFileSync(pad, 'utf8'));
  const buffers = (json.buffers ?? []).map((buffer) => {
    if (!buffer.uri) throw new Error(`${pad}: buffer zonder uri`);
    if (buffer.uri.startsWith('data:')) {
      return Buffer.from(buffer.uri.slice(buffer.uri.indexOf(',') + 1), 'base64');
    }
    return readFileSync(join(dirname(pad), decodeURIComponent(buffer.uri)));
  });
  if (buffers.length > 1) throw new Error(`${pad}: meer dan één buffer wordt niet gelezen`);
  return { json, bin: buffers[0] };
}

function materiaalUitGltf(json, index, dir) {
  const materiaal = json.materials?.[index];
  if (!materiaal) return { textuur: null, kleur: [255, 255, 255] };

  const pbr = materiaal.pbrMetallicRoughness ?? {};
  const texIndex = pbr.baseColorTexture?.index;
  if (texIndex !== undefined) {
    const uri = json.images?.[json.textures?.[texIndex]?.source]?.uri;
    if (!uri) throw new Error('baseColorTexture zonder image-uri (ingebedde textuur)');
    return { textuur: resolve(dir, decodeURIComponent(uri)), kleur: null };
  }

  const factor = pbr.baseColorFactor ?? [1, 1, 1, 1];
  return { textuur: null, kleur: factor.slice(0, 3).map(naarSrgb) };
}

export function leesGltf(pad) {
  const glb = leesGltfBestand(pad);
  const { json } = glb;
  const dir = dirname(pad);
  const nodes = json.nodes ?? [];

  const wereld = new Array(nodes.length).fill(null);
  const zet = (index, ouder) => {
    const node = nodes[index];
    if (!node) return;
    wereld[index] = maal(ouder, nodeMatrix(node));
    for (const kind of node.children ?? []) zet(kind, wereld[index]);
  };
  const scene = json.scenes?.[json.scene ?? 0];
  for (const wortel of scene?.nodes ?? nodes.map((_, i) => i)) zet(wortel, EENHEID);

  const primitieven = [];
  nodes.forEach((node, index) => {
    if (node.mesh === undefined || !wereld[index]) return;
    const m = wereld[index];

    for (const prim of json.meshes[node.mesh].primitives ?? []) {
      if (prim.mode !== undefined && prim.mode !== 4) continue;

      const pos = readAccessor(glb, prim.attributes.POSITION);
      const posities = new Float64Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const [x, y, z] = punt(m, pos.data[i * 3], pos.data[i * 3 + 1], pos.data[i * 3 + 2]);
        posities[i * 3] = x;
        posities[i * 3 + 1] = y;
        posities[i * 3 + 2] = z;
      }

      let normalen = null;
      if (prim.attributes.NORMAL !== undefined) {
        const bron = readAccessor(glb, prim.attributes.NORMAL);
        normalen = new Float64Array(bron.count * 3);
        for (let i = 0; i < bron.count; i++) {
          const [x, y, z] = richting(m, bron.data[i * 3], bron.data[i * 3 + 1], bron.data[i * 3 + 2]);
          const lengte = Math.hypot(x, y, z) || 1;
          normalen[i * 3] = x / lengte;
          normalen[i * 3 + 1] = y / lengte;
          normalen[i * 3 + 2] = z / lengte;
        }
      }

      let uvs = null;
      if (prim.attributes.TEXCOORD_0 !== undefined) {
        uvs = readAccessor(glb, prim.attributes.TEXCOORD_0).data;
      }

      let hoekkleuren = null;
      if (prim.attributes.COLOR_0 !== undefined) {
        const accessor = json.accessors[prim.attributes.COLOR_0];
        const bron = readAccessor(glb, prim.attributes.COLOR_0);
        const deler =
          accessor.componentType === 5121 ? 255
          : accessor.componentType === 5123 ? 65535
          : 1;
        hoekkleuren = new Float64Array(bron.count * 3);
        for (let i = 0; i < bron.count; i++) {
          for (let k = 0; k < 3; k++) hoekkleuren[i * 3 + k] = bron.data[i * bron.breedte + k] / deler;
        }
      }

      let indices;
      if (prim.indices !== undefined) {
        const bron = readAccessor(glb, prim.indices);
        indices = Uint32Array.from(bron.data);
      } else {
        indices = Uint32Array.from({ length: pos.count }, (_, i) => i);
      }

      primitieven.push({
        naam: node.name ?? json.meshes[node.mesh].name ?? 'mesh',
        posities,
        normalen,
        uvs,
        hoekkleuren,
        indices,
        materiaal: materiaalUitGltf(json, prim.material, dir),
      });
    }
  });

  return primitieven;
}

function leesMtl(pad) {
  const materialen = new Map();
  if (!existsSync(pad)) return materialen;
  let huidig = null;

  for (const regel of readFileSync(pad, 'utf8').split(/\r?\n/)) {
    const [sleutel, ...rest] = regel.trim().split(/\s+/);
    if (sleutel === 'newmtl') {
      huidig = { textuur: null, kleur: [255, 255, 255] };
      materialen.set(rest.join(' '), huidig);
    } else if (!huidig) continue;
    else if (sleutel === 'Kd') huidig.kleur = rest.slice(0, 3).map((v) => naarSrgb(Number(v)));
    else if (sleutel === 'map_Kd') {
      const bestand = rest.join(' ').replace(/\\+/g, '/');
      huidig.textuur = resolve(dirname(pad), bestand);
    }
  }
  return materialen;
}

export function leesObj(pad) {
  const regels = readFileSync(pad, 'utf8').split(/\r?\n/);
  const v = [];
  const vn = [];
  const vt = [];
  const groepen = new Map();
  let materialen = new Map();
  let materiaal = null;

  const zoekGroep = () => {
    const sleutel = materiaal ?? '';
    if (!groepen.has(sleutel)) groepen.set(sleutel, []);
    return groepen.get(sleutel);
  };

  for (const regel of regels) {
    const stukken = regel.trim().split(/\s+/);
    const sleutel = stukken[0];

    if (sleutel === 'v') v.push(stukken.slice(1, 4).map(Number));
    else if (sleutel === 'vn') vn.push(stukken.slice(1, 4).map(Number));
    else if (sleutel === 'vt') vt.push(stukken.slice(1, 3).map(Number));
    else if (sleutel === 'mtllib') {
      materialen = leesMtl(join(dirname(pad), stukken.slice(1).join(' ')));
    } else if (sleutel === 'usemtl') materiaal = stukken.slice(1).join(' ');
    else if (sleutel === 'f') {
      const hoek = stukken.slice(1).map((deel) => {
        const [pi, ti, ni] = deel.split('/');
        const wijs = (waarde, lengte) => {
          if (!waarde) return -1;
          const n = Number(waarde);
          return n > 0 ? n - 1 : lengte + n;
        };
        return [wijs(pi, v.length), wijs(ti, vt.length), wijs(ni, vn.length)];
      });
      const doel = zoekGroep();
      for (let i = 1; i + 1 < hoek.length; i++) doel.push([hoek[0], hoek[i], hoek[i + 1]]);
    }
  }

  const primitieven = [];
  for (const [naam, driehoeken] of groepen) {
    if (driehoeken.length === 0) continue;
    const aantal = driehoeken.length * 3;
    const posities = new Float64Array(aantal * 3);
    const normalen = new Float64Array(aantal * 3);
    const uvs = new Float64Array(aantal * 2);
    let heeftNormalen = true;
    let heeftUvs = true;

    driehoeken.forEach((driehoek, d) => {
      driehoek.forEach(([pi, ti, ni], k) => {
        const i = d * 3 + k;
        posities.set(v[pi], i * 3);
        if (ni >= 0 && vn[ni]) normalen.set(vn[ni], i * 3);
        else heeftNormalen = false;
        if (ti >= 0 && vt[ti]) uvs.set(vt[ti], i * 2);
        else heeftUvs = false;
      });
    });

    primitieven.push({
      naam,
      posities,
      normalen: heeftNormalen ? normalen : null,
      uvs: heeftUvs ? uvs : null,
      hoekkleuren: null,
      indices: Uint32Array.from({ length: aantal }, (_, i) => i),
      materiaal: materialen.get(naam) ?? { textuur: null, kleur: [255, 255, 255] },
    });
  }

  return primitieven;
}
