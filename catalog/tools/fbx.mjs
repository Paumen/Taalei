import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { inflateSync } from 'node:zlib';

const MAGIC = 'Kaydara FBX Binary  ';
const AFBEELDING = /\.(png|jpe?g)$/i;

function readProperty(buf, pos) {
  const type = String.fromCharCode(buf[pos]);
  pos += 1;

  // a single value
  if (type === 'Y') return [buf.readInt16LE(pos), pos + 2];
  if (type === 'C') return [buf.readUInt8(pos) !== 0, pos + 1];
  if (type === 'I') return [buf.readInt32LE(pos), pos + 4];
  if (type === 'F') return [buf.readFloatLE(pos), pos + 4];
  if (type === 'D') return [buf.readDoubleLE(pos), pos + 8];
  if (type === 'L') return [Number(buf.readBigInt64LE(pos)), pos + 8];

  // a string or a lump of raw bytes
  if (type === 'S' || type === 'R') {
    const length = buf.readUInt32LE(pos);
    const start = pos + 4;
    const slice = buf.subarray(start, start + length);
    return [type === 'S' ? slice.toString('utf8') : slice, start + length];
  }

  // an array, zlib-packed when the encoding says so
  const count = buf.readUInt32LE(pos);
  const encoding = buf.readUInt32LE(pos + 4);
  const packedLength = buf.readUInt32LE(pos + 8);
  const start = pos + 12;
  const raw = buf.subarray(start, start + packedLength);
  const data = encoding === 1 ? inflateSync(raw) : raw;
  const next = start + packedLength;

  const out =
    type === 'f' ? new Float32Array(count)
    : type === 'd' ? new Float64Array(count)
    : type === 'l' ? new Float64Array(count)
    : new Int32Array(count);

  for (let i = 0; i < count; i++) {
    out[i] =
      type === 'f' ? data.readFloatLE(i * 4)
      : type === 'd' ? data.readDoubleLE(i * 8)
      : type === 'l' ? Number(data.readBigInt64LE(i * 8))
      : type === 'i' ? data.readInt32LE(i * 4)
      : data.readUInt8(i);
  }
  return [out, next];
}

function readRecord(buf, pos, wide) {
  const end = wide ? Number(buf.readBigUInt64LE(pos)) : buf.readUInt32LE(pos);
  const properties = wide ? Number(buf.readBigUInt64LE(pos + 8)) : buf.readUInt32LE(pos + 4);
  const step = wide ? 24 : 12;
  const nameLength = buf.readUInt8(pos + step + (wide ? 0 : 0));
  if (end === 0) return null;

  const nameStart = pos + step + 1;
  const name = buf.toString('utf8', nameStart, nameStart + nameLength);

  let cursor = nameStart + nameLength;
  const props = [];
  for (let i = 0; i < properties; i++) {
    const [value, next] = readProperty(buf, cursor);
    props.push(value);
    cursor = next;
  }

  const children = [];
  // whatever is left before `end` is a child list, closed by an all-zero record
  const sentinel = wide ? 25 : 13;
  while (cursor + sentinel <= end) {
    const child = readRecord(buf, cursor, wide);
    if (!child) break;
    children.push(child);
    cursor = child.end;
  }

  return { name, props, children, end };
}

function readTree(path) {
  const buf = readFileSync(path);
  if (buf.toString('binary', 0, MAGIC.length) !== MAGIC) {
    throw new Error(`not a binary FBX: ${path}`);
  }
  const version = buf.readUInt32LE(23);
  const wide = version >= 7500;

  const roots = [];
  let pos = 27;
  while (pos < buf.length) {
    const record = readRecord(buf, pos, wide);
    if (!record) break;
    roots.push(record);
    pos = record.end;
  }
  return { roots, version };
}

const child = (record, name) => record?.children.find((c) => c.name === name);
const childrenNamed = (record, name) => record?.children.filter((c) => c.name === name) ?? [];

function property70(record, name) {
  for (const p of childrenNamed(child(record, 'Properties70'), 'P')) {
    if (p.props[0] === name) return p.props.slice(4);
  }
  return null;
}

const RAD = Math.PI / 180;

function eulerMatrix([rx, ry, rz]) {
  const [cx, cy, cz] = [rx, ry, rz].map((v) => Math.cos(v * RAD));
  const [sx, sy, sz] = [rx, ry, rz].map((v) => Math.sin(v * RAD));
  return [
    cy * cz, cy * sz, -sy,
    sx * sy * cz - cx * sz, sx * sy * sz + cx * cz, sx * cy,
    cx * sy * cz + sx * sz, cx * sy * sz - sx * cz, cx * cy,
  ];
}

const applyMatrix = (m, x, y, z) => [
  m[0] * x + m[3] * y + m[6] * z,
  m[1] * x + m[4] * y + m[7] * z,
  m[2] * x + m[5] * y + m[8] * z,
];

function upAxisMatrix(roots) {
  const settings = child(roots.find((r) => r.name === 'GlobalSettings'), 'Properties70')
    ? roots.find((r) => r.name === 'GlobalSettings')
    : null;
  const up = property70(settings, 'UpAxis')?.[0] ?? 1;
  const sign = property70(settings, 'UpAxisSign')?.[0] ?? 1;
  if (up === 1) return null;
  // Z-up → Y-up
  return sign >= 0
    ? [1, 0, 0, 0, 0, 1, 0, -1, 0]
    : [1, 0, 0, 0, 0, -1, 0, 1, 0];
}

function layerLookup(layer, valuesName, indexName, width) {
  if (!layer) return null;
  const values = child(layer, valuesName)?.props[0];
  if (!values) return null;
  const mapping = child(layer, 'MappingInformationType')?.props[0] ?? 'ByPolygonVertex';
  const reference = child(layer, 'ReferenceInformationType')?.props[0] ?? 'Direct';
  const indices = child(layer, indexName)?.props[0] ?? null;

  return (polygonVertex, vertex, polygon) => {
    let index =
      mapping === 'ByVertice' || mapping === 'ByVertex' ? vertex
      : mapping === 'ByPolygon' ? polygon
      : mapping === 'AllSame' ? 0
      : polygonVertex;
    if (reference !== 'Direct' && indices) index = indices[index];
    const out = new Array(width);
    for (let k = 0; k < width; k++) out[k] = values[index * width + k];
    return out;
  };
}

// An fbx may carry its texture inside itself, as the bytes of a Video record, and then
// ship no image file at all — Charming Kitchen Set and Architecture Pack both do, and
// preview colourless without this. Write those bytes out beside the model, so the name
// the material asks for resolves against a file like any other texture: every reader of
// this shape looks a texture up among the pack's images, never inside the fbx.
function pakMediaUit(video, dir) {
  const inhoud = child(video, 'Content')?.props[0];
  if (!inhoud?.length) return null;

  const gevraagd = child(video, 'RelativeFilename')?.props[0]
    ?? child(video, 'FileName')?.props[0]
    ?? String(video.props[1] ?? '').split('\0')[0];
  const naam = String(gevraagd).replace(/\\+/g, '/').split('/').pop();
  if (!naam || !AFBEELDING.test(naam)) return null;

  const pad = join(dir, naam);
  if (!existsSync(pad)) writeFileSync(pad, Buffer.from(inhoud));
  return naam;
}

const naarSrgb = (lineair) => {
  const v = lineair <= 0.0031308 ? lineair * 12.92 : 1.055 * lineair ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(Math.max(v, 0), 1) * 255);
};

/**
 * Reads a binary .fbx and returns one entry per mesh and material, in the same shape as
 * leesGltf and leesObj in tools/importeer/bron.mjs: triangulated, with world positions,
 * and with a name taken from the Model the geometry hangs under. A mesh split over
 * several materials returns one entry per material, all under that same name.
 */
export function leesFbx(pad) {
  const { roots } = readTree(pad);
  const objects = roots.find((r) => r.name === 'Objects');
  if (!objects) return [];

  const perId = new Map();
  for (const record of objects.children) perId.set(record.props[0], record);

  const parents = new Map();
  for (const c of childrenNamed(roots.find((r) => r.name === 'Connections'), 'C')) {
    if (c.props[0] !== 'OO' && c.props[0] !== 'OP') continue;
    const [, from, to] = c.props;
    if (!parents.has(from)) parents.set(from, []);
    parents.get(from).push(to);
  }

  // an FBX object name is "Name\0\x01Class" — only the part before the NUL is the name
  const naamVan = (record) => String(record?.props[1] ?? '').split('\0')[0] || 'mesh';

  // the other direction: everything that hangs under a given id
  const kinderen = new Map();
  for (const [from, doelen] of parents) {
    for (const to of doelen) {
      if (!kinderen.has(to)) kinderen.set(to, []);
      kinderen.get(to).push(from);
    }
  }
  const hangtOnder = (id, soort) =>
    (kinderen.get(id) ?? []).map((k) => perId.get(k)).filter((r) => r?.name === soort);

  const naast = dirname(pad);

  const beschrijf = (materiaal) => {
    for (const textuur of hangtOnder(materiaal.props[0], 'Texture')) {
      const geschreven = hangtOnder(textuur.props[0], 'Video')
        .map((video) => pakMediaUit(video, naast))
        .find(Boolean);
      const bestand = child(textuur, 'RelativeFilename')?.props[0]
        ?? child(textuur, 'FileName')?.props[0];
      const naam = bestand ? String(bestand).replace(/\\+/g, '/').split('/').pop() : null;
      if (naam || geschreven) return naam ?? geschreven;
    }
    const kleur = property70(materiaal, 'DiffuseColor') ?? property70(materiaal, 'Diffuse');
    return kleur ? { kleur: kleur.slice(0, 3).map(naarSrgb) } : null;
  };

  // In connection order: that is the order LayerElementMaterial indexes into.
  const materialenVan = (modelId) => hangtOnder(modelId, 'Material').map(beschrijf);

  const naarYOp = upAxisMatrix(roots);
  const primitieven = [];

  for (const geometry of objects.children) {
    if (geometry.name !== 'Geometry') continue;
    const vertices = child(geometry, 'Vertices')?.props[0];
    const polygons = child(geometry, 'PolygonVertexIndex')?.props[0];
    if (!vertices || !polygons) continue;

    const model = (parents.get(geometry.props[0]) ?? [])
      .map((id) => perId.get(id))
      .find((r) => r?.name === 'Model');

    // placement of the model the geometry hangs under, plus the geometric offset that
    // FBX keeps separate from it
    const schaal = property70(model, 'Lcl Scaling') ?? [1, 1, 1];
    const draai = property70(model, 'Lcl Rotation') ?? [0, 0, 0];
    const geoSchaal = property70(model, 'GeometricScaling') ?? [1, 1, 1];
    const geoDraai = property70(model, 'GeometricRotation') ?? [0, 0, 0];
    const draaiing = eulerMatrix(draai);
    const geoDraaiing = eulerMatrix(geoDraai);

    const plaats = (x, y, z) => {
      let p = [x * geoSchaal[0], y * geoSchaal[1], z * geoSchaal[2]];
      p = applyMatrix(geoDraaiing, ...p);
      p = [p[0] * schaal[0], p[1] * schaal[1], p[2] * schaal[2]];
      p = applyMatrix(draaiing, ...p);
      return naarYOp ? applyMatrix(naarYOp, ...p) : p;
    };
    const richt = (x, y, z) => {
      const p = applyMatrix(draaiing, ...applyMatrix(geoDraaiing, x, y, z));
      const q = naarYOp ? applyMatrix(naarYOp, ...p) : p;
      const lengte = Math.hypot(...q) || 1;
      return q.map((v) => v / lengte);
    };

    const normaalLaag = layerLookup(child(geometry, 'LayerElementNormal'), 'Normals', 'NormalsIndex', 3);
    const uvLaag = layerLookup(child(geometry, 'LayerElementUV'), 'UV', 'UVIndex', 2);

    // A mesh may carry several materials, one per polygon — the doors and beams of a
    // building sit in the same mesh as its walls. Each material becomes its own
    // primitive; reading only the first paints the whole mesh in the wall's colour.
    const materiaalLaag = child(geometry, 'LayerElementMaterial');
    const materiaalIndices = child(materiaalLaag, 'Materials')?.props[0];
    const perPolygoon = child(materiaalLaag, 'MappingInformationType')?.props[0] === 'ByPolygon';
    const materiaalVan = (polygoon) => {
      if (!materiaalIndices?.length) return 0;
      return (perPolygoon ? materiaalIndices[polygoon] : materiaalIndices[0]) ?? 0;
    };

    const delen = new Map();
    const deelVan = (index) => {
      let deel = delen.get(index);
      if (!deel) delen.set(index, (deel = { posities: [], normalen: [], uvs: [] }));
      return deel;
    };
    let hoeken = [];
    let heeftNormalen = Boolean(normaalLaag);
    let heeftUvs = Boolean(uvLaag);
    let polygoon = 0;

    const zetHoek = (i) => {
      const v = polygons[i] < 0 ? ~polygons[i] : polygons[i];
      const p = plaats(vertices[v * 3], vertices[v * 3 + 1], vertices[v * 3 + 2]);
      const n = normaalLaag ? richt(...normaalLaag(i, v, polygoon)) : null;
      const t = uvLaag ? uvLaag(i, v, polygoon) : null;
      return { p, n, t };
    };

    for (let i = 0; i < polygons.length; i++) {
      hoeken.push(zetHoek(i));
      if (polygons[i] >= 0) continue;

      const deel = deelVan(materiaalVan(polygoon));
      for (let k = 1; k + 1 < hoeken.length; k++) {
        for (const hoek of [hoeken[0], hoeken[k], hoeken[k + 1]]) {
          deel.posities.push(...hoek.p);
          if (hoek.n) deel.normalen.push(...hoek.n);
          else heeftNormalen = false;
          if (hoek.t) deel.uvs.push(hoek.t[0], 1 - hoek.t[1]);
          else heeftUvs = false;
        }
      }
      hoeken = [];
      polygoon++;
    }

    const materialen = materialenVan(model?.props[0]);
    // A material that names neither a texture nor a colour says nothing about the faces
    // carrying it: fall back to the first one that does, the way the single-material
    // read did before the split.
    const eerste = materialen.find((m) => m !== null) ?? null;

    for (const [index, deel] of [...delen].sort((a, b) => a[0] - b[0])) {
      if (deel.posities.length === 0) continue;
      const gevonden = materialen[index] ?? eerste;
      primitieven.push({
        naam: naamVan(model ?? geometry),
        posities: Float64Array.from(deel.posities),
        normalen: heeftNormalen ? Float64Array.from(deel.normalen) : null,
        uvs: heeftUvs ? Float64Array.from(deel.uvs) : null,
        hoekkleuren: null,
        indices: Uint32Array.from({ length: deel.posities.length / 3 }, (_, i) => i),
        materiaal:
          typeof gevonden === 'string' ? { textuur: gevonden, kleur: null }
          : gevonden ? { textuur: null, kleur: gevonden.kleur }
          : { textuur: null, kleur: [255, 255, 255] },
      });
    }
  }

  return primitieven;
}
