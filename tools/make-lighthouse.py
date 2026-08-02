#!/usr/bin/env python3
"""Generate kits/pirate-kit/lighthouse.glb in the Taalei house style.

Faceted, chunky lighthouse built from flat pieces:
- octagonal stone plinth
- tapered 8-sided tower with red/white stripe bands
- dark gallery slab with solid parapet
- glowing lantern prism
- red 8-sided cone roof
- wooden door, dark window

Colors are flat cells of the shared colormap (16 cols x 4 rows, v=0 at top).
"""
import json
import math
import struct

N = 8                      # flat pieces per full circle (max 16 allowed)
ANG0 = math.radians(22.5)  # rotate so a flat face looks along +Z

# shared-colormap cells (col, row) -> constant UV at the cell centre
STONE = (3, 2)   # 9da4c4
RED   = (7, 0)   # e76047
WHITE = (5, 2)   # dcdce9
DARK  = (6, 1)   # 474a58
GLOW  = (6, 0)   # ffb349
WOOD  = (12, 0)  # 995a41

def uv(cell):
    return ((cell[0] + 0.5) / 16.0, (cell[1] + 0.5) / 4.0)

positions, normals, uvs, indices = [], [], [], []

def sub(a, b): return (a[0]-b[0], a[1]-b[1], a[2]-b[2])
def cross(a, b): return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
def dot(a, b): return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]
def norm(v):
    l = math.sqrt(dot(v, v)) or 1.0
    return (v[0]/l, v[1]/l, v[2]/l)

def add_face(pts, cell, outward):
    """One flat convex polygon; `outward` fixes the winding/normal direction."""
    n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])))
    if dot(n, outward) < 0:
        pts = pts[::-1]
        n = (-n[0], -n[1], -n[2])
    base = len(positions)
    u = uv(cell)
    for p in pts:
        positions.append(p)
        normals.append(n)
        uvs.append(u)
    for i in range(1, len(pts) - 1):
        indices.extend([base, base + i, base + i + 1])

def ring(y, r):
    return [(r*math.cos(ANG0 + i*2*math.pi/N), y, r*math.sin(ANG0 + i*2*math.pi/N))
            for i in range(N)]

def radial_mid(a, b):
    m = ((a[0]+b[0])/2, 0.0, (a[2]+b[2])/2)
    return norm(m)

def shell_sides(bot, top, cell, inward=False):
    for i in range(N):
        j = (i + 1) % N
        out = radial_mid(bot[i], bot[j])
        if inward:
            out = (-out[0], 0.0, -out[2])
        add_face([bot[i], bot[j], top[j], top[i]], cell, out)

def disc(rng, cell, up=True):
    add_face(list(rng), cell, (0, 1 if up else -1, 0))

def annulus(outer, inner, cell, up=True):
    for i in range(N):
        j = (i + 1) % N
        add_face([outer[i], outer[j], inner[j], inner[i]], cell, (0, 1 if up else -1, 0))

def box(x0, x1, y0, y1, z0, z1, cell, skip=()):
    c = lambda x, y, z: (x, y, z)
    faces = {
        'front':  ([c(x0,y0,z1), c(x1,y0,z1), c(x1,y1,z1), c(x0,y1,z1)], (0,0,1)),
        'back':   ([c(x0,y0,z0), c(x1,y0,z0), c(x1,y1,z0), c(x0,y1,z0)], (0,0,-1)),
        'left':   ([c(x0,y0,z0), c(x0,y0,z1), c(x0,y1,z1), c(x0,y1,z0)], (-1,0,0)),
        'right':  ([c(x1,y0,z0), c(x1,y0,z1), c(x1,y1,z1), c(x1,y1,z0)], (1,0,0)),
        'top':    ([c(x0,y1,z0), c(x1,y1,z0), c(x1,y1,z1), c(x0,y1,z1)], (0,1,0)),
        'bottom': ([c(x0,y0,z0), c(x1,y0,z0), c(x1,y0,z1), c(x0,y0,z1)], (0,-1,0)),
    }
    for name, (pts, out) in faces.items():
        if name not in skip:
            add_face(pts, cell, out)

# -- plinth: stone octagon, footprint within 1x1 ---------------------------
plinth_b, plinth_t = ring(0.0, 0.50), ring(0.18, 0.50)
shell_sides(plinth_b, plinth_t, STONE)
disc(plinth_t, STONE, up=True)

# -- tower: tapered, four stripe bands -------------------------------------
Y0, Y1, R0, R1 = 0.18, 1.95, 0.40, 0.26
bounds = [0.18, 0.65, 1.10, 1.53, 1.95]
stripe_cells = [RED, WHITE, RED, WHITE]
def tower_r(y): return R0 + (R1 - R0) * (y - Y0) / (Y1 - Y0)
for k, cell in enumerate(stripe_cells):
    ya, yb = bounds[k], bounds[k + 1]
    shell_sides(ring(ya, tower_r(ya)), ring(yb, tower_r(yb)), cell)

# -- gallery slab + solid parapet ------------------------------------------
slab_b, slab_t = ring(1.95, 0.36), ring(2.05, 0.36)
shell_sides(slab_b, slab_t, DARK)
disc(slab_b, DARK, up=False)
disc(slab_t, DARK, up=True)

par_out_b, par_out_t = ring(2.05, 0.36), ring(2.22, 0.36)
par_in_b,  par_in_t  = ring(2.05, 0.30), ring(2.22, 0.30)
shell_sides(par_out_b, par_out_t, DARK)
shell_sides(par_in_b, par_in_t, DARK, inward=True)
annulus(par_out_t, par_in_t, DARK, up=True)

# -- lantern ---------------------------------------------------------------
shell_sides(ring(2.05, 0.19), ring(2.38, 0.19), GLOW)

# -- roof cone -------------------------------------------------------------
roof_base = ring(2.38, 0.28)
apex = (0.0, 2.80, 0.0)
for i in range(N):
    j = (i + 1) % N
    add_face([roof_base[i], roof_base[j], apex], RED, radial_mid(roof_base[i], roof_base[j]))
disc(roof_base, RED, up=False)

# -- door (front, +Z) and window -------------------------------------------
box(-0.13, 0.13, 0.0, 0.62, 0.30, 0.50, WOOD, skip=('back', 'bottom'))
box(-0.08, 0.08, 1.16, 1.36, 0.20, 0.33, DARK, skip=('back',))

# -- pack GLB --------------------------------------------------------------
pos_bin = b''.join(struct.pack('<fff', *p) for p in positions)
nrm_bin = b''.join(struct.pack('<fff', *n) for n in normals)
uv_bin  = b''.join(struct.pack('<ff', *t) for t in uvs)
idx_bin = b''.join(struct.pack('<H', i) for i in indices)
if len(idx_bin) % 4:
    idx_bin += b'\x00\x00'

views, blob, offset = [], b'', 0
for data, target in [(pos_bin, 34962), (nrm_bin, 34962), (uv_bin, 34962), (idx_bin, 34963)]:
    views.append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(data), 'target': target})
    blob += data
    offset += len(data)

mins = [min(p[i] for p in positions) for i in range(3)]
maxs = [max(p[i] for p in positions) for i in range(3)]

gltf = {
    'asset': {
        'generator': 'taalei-tools',
        'version': '2.0',
        'extras': {'taaleiland': {'versie': 1, 'schaal': 1, 'tangenten': 'gestript', 'palet': 1}},
    },
    'scene': 0,
    'scenes': [{'nodes': [0], 'name': 'lighthouse'}],
    'nodes': [{'mesh': 0, 'name': 'lighthouse'}],
    'meshes': [{'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1, 'TEXCOORD_0': 2},
                                'indices': 3, 'material': 0}],
                'name': 'lighthouse'}],
    'materials': [{'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0},
                   'doubleSided': True, 'name': 'colormap'}],
    'textures': [{'sampler': 0, 'source': 0, 'name': 'colormap'}],
    'images': [{'uri': 'Textures/colormap.png', 'name': 'colormap'}],
    'samplers': [{'minFilter': 9987}],
    'accessors': [
        {'bufferView': 0, 'componentType': 5126, 'count': len(positions), 'type': 'VEC3',
         'min': mins, 'max': maxs},
        {'bufferView': 1, 'componentType': 5126, 'count': len(normals), 'type': 'VEC3'},
        {'bufferView': 2, 'componentType': 5126, 'count': len(uvs), 'type': 'VEC2'},
        {'bufferView': 3, 'componentType': 5123, 'count': len(indices), 'type': 'SCALAR'},
    ],
    'bufferViews': views,
    'buffers': [{'byteLength': len(blob)}],
}

json_bin = json.dumps(gltf, separators=(',', ':')).encode()
json_bin += b' ' * ((4 - len(json_bin) % 4) % 4)
total = 12 + 8 + len(json_bin) + 8 + len(blob)
out = struct.pack('<III', 0x46546C67, 2, total)
out += struct.pack('<II', len(json_bin), 0x4E4F534A) + json_bin
out += struct.pack('<II', len(blob), 0x004E4942) + blob

path = 'kits/pirate-kit/lighthouse.glb'
with open(path, 'wb') as f:
    f.write(out)
print(f'{path}: {len(out)} bytes, {len(positions)} verts, {len(indices)//3} tris')
print('bounds x %.3f..%.3f y %.3f..%.3f z %.3f..%.3f' % (mins[0], maxs[0], mins[1], maxs[1], mins[2], maxs[2]))
