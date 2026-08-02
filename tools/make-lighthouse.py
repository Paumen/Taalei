#!/usr/bin/env python3
"""Generate kits/pirate-kit/lighthouse.glb in the Taalei house style.

Faceted, chunky lighthouse built from flat pieces (8 per full circle):
stepped rock base, concave tapered tower with red/white stripe bands,
flared cornice carrying a dark gallery with solid parapet, glowing
lantern, two-segment cone roof with a finial knob, arched wooden door
and a lit, framed window.

Shading follows the other kits: every colormap cell is a vertical
gradient (light at the top of the cell, dark at the bottom) and each
vertex picks its spot in that gradient via the UV v-coordinate, so the
model gets the same soft baked shading as e.g. ship-large.
"""
import json
import math
import struct

# -- proportions (units: 1 = one wall segment) -----------------------------
N = 8                      # flat pieces per full circle (max 16 allowed)
ANG0 = math.radians(22.5)  # rotate so a flat face looks along +Z

BASE_STEPS = [             # stacked octagonal rock steps: (radius, y_top)
    (0.50, 0.12),
    (0.42, 0.26),
]
TOWER_RINGS = [            # concave taper: (y, radius)
    (0.26, 0.38),
    (0.70, 0.335),
    (1.15, 0.30),
    (1.60, 0.28),
    (1.90, 0.272),
]
CORNICE_TOP = (2.02, 0.38)  # flare from the tower top out to the gallery
GALLERY_R, GALLERY_TOP = 0.40, 2.10
PARAPET_R_IN, PARAPET_TOP = 0.34, 2.26
LANTERN_R, LANTERN_TOP = 0.20, 2.46
ROOF = [(0.30, 2.46), (0.16, 2.64), (0.0, 2.86)]  # (radius, y) rings to apex
KNOB_R, KNOB_Y0, KNOB_Y1 = 0.06, 2.82, 2.96

DOOR_W, DOOR_H, DOOR_CHAMFER = 0.26, 0.62, 0.09
DOOR_Z0, DOOR_Z1 = 0.28, 0.50
WIN_Y = 1.30               # window centre, on the middle red band
WIN_FRAME_W, WIN_FRAME_H = 0.22, 0.26
WIN_GLASS_W, WIN_GLASS_H = 0.13, 0.17

# -- shared-colormap cells (16 cols x 4 rows, v=0 at top) ------------------
RED   = (7, 0)   # e76047  stripe bands, roof
WHITE = (5, 2)   # dcdce9  stripe bands
DARK  = (6, 1)   # 474a58  gallery, parapet, cornice, knob, window frame
GLOW  = (6, 0)   # ffb349  lantern, window glass
WOOD  = (12, 0)  # 995a41  door
ROCK  = (15, 3)  # 6d738a  base steps (same cell as the pirate-kit rocks)

positions, normals, uvs, indices = [], [], [], []

def sub(a, b): return (a[0]-b[0], a[1]-b[1], a[2]-b[2])
def cross(a, b): return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
def dot(a, b): return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]
def norm(v):
    l = math.sqrt(dot(v, v)) or 1.0
    return (v[0]/l, v[1]/l, v[2]/l)

def cell_uv(cell, shade):
    """UV inside a gradient cell; shade 0 = lightest, 1 = darkest."""
    u = (cell[0] + 0.5) / 16.0
    v = (cell[1] + 0.1 + 0.8 * min(1.0, max(0.0, shade))) / 4.0
    return (u, v)

def add_face(pts, cell, outward, shades=None):
    """One flat convex polygon; `outward` fixes the winding/normal direction.

    `shades` gives the per-vertex gradient position (defaults to flat mid).
    """
    if shades is None:
        shades = [0.5] * len(pts)
    n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])))
    if dot(n, outward) < 0:
        pts = pts[::-1]
        shades = shades[::-1]
        n = (-n[0], -n[1], -n[2])
    base = len(positions)
    for p, s in zip(pts, shades):
        positions.append(p)
        normals.append(n)
        uvs.append(cell_uv(cell, s))
    for i in range(1, len(pts) - 1):
        indices.extend([base, base + i, base + i + 1])

def ring(y, r):
    return [(r*math.cos(ANG0 + i*2*math.pi/N), y, r*math.sin(ANG0 + i*2*math.pi/N))
            for i in range(N)]

def radial_mid(a, b):
    return norm(((a[0]+b[0])/2, 0.0, (a[2]+b[2])/2))

def shell_sides(bot, top, cell, s_bot=0.8, s_top=0.15, inward=False):
    """Ring of quads with a vertical gradient (light top, dark bottom)."""
    for i in range(N):
        j = (i + 1) % N
        out = radial_mid(bot[i], bot[j])
        if inward:
            out = (-out[0], 0.0, -out[2])
        add_face([bot[i], bot[j], top[j], top[i]], cell, out,
                 shades=[s_bot, s_bot, s_top, s_top])

def disc(rng, cell, up=True, shade=None):
    if shade is None:
        shade = 0.1 if up else 0.85
    add_face(list(rng), cell, (0, 1 if up else -1, 0), shades=[shade]*len(rng))

def annulus(outer, inner, cell, up=True, shade=None):
    if shade is None:
        shade = 0.1 if up else 0.85
    for i in range(N):
        j = (i + 1) % N
        add_face([outer[i], outer[j], inner[j], inner[i]], cell,
                 (0, 1 if up else -1, 0), shades=[shade]*4)

def box(x0, x1, y0, y1, z0, z1, cell, skip=(), s_bot=0.75, s_top=0.2):
    grad = [s_bot, s_bot, s_top, s_top]
    faces = {
        'front':  ([(x0,y0,z1), (x1,y0,z1), (x1,y1,z1), (x0,y1,z1)], (0,0,1), grad),
        'back':   ([(x0,y0,z0), (x1,y0,z0), (x1,y1,z0), (x0,y1,z0)], (0,0,-1), grad),
        'left':   ([(x0,y0,z0), (x0,y0,z1), (x0,y1,z1), (x0,y1,z0)], (-1,0,0), grad),
        'right':  ([(x1,y0,z0), (x1,y0,z1), (x1,y1,z1), (x1,y1,z0)], (1,0,0), grad),
        'top':    ([(x0,y1,z0), (x1,y1,z0), (x1,y1,z1), (x0,y1,z1)], (0,1,0), [0.1]*4),
        'bottom': ([(x0,y0,z0), (x1,y0,z0), (x1,y0,z1), (x0,y0,z1)], (0,-1,0), [0.85]*4),
    }
    for name, (pts, out, shades) in faces.items():
        if name not in skip:
            add_face(pts, cell, out, shades=shades)

def build():
    # rock base: stacked octagon steps
    y_prev = 0.0
    for r, y_top in BASE_STEPS:
        shell_sides(ring(y_prev, r), ring(y_top, r), ROCK, s_bot=0.85, s_top=0.25)
        disc(ring(y_top, r), ROCK, up=True, shade=0.15)
        y_prev = y_top

    # tower: concave taper, alternating stripe bands
    stripe_cells = [RED, WHITE, RED, WHITE]
    for k in range(len(TOWER_RINGS) - 1):
        (ya, ra), (yb, rb) = TOWER_RINGS[k], TOWER_RINGS[k + 1]
        shell_sides(ring(ya, ra), ring(yb, rb), stripe_cells[k], s_bot=0.75, s_top=0.1)

    # cornice flaring out to the gallery, then slab and solid parapet
    y_top_tower, r_top_tower = TOWER_RINGS[-1]
    shell_sides(ring(y_top_tower, r_top_tower), ring(CORNICE_TOP[0], CORNICE_TOP[1]),
                DARK, s_bot=0.9, s_top=0.35)
    shell_sides(ring(CORNICE_TOP[0], GALLERY_R), ring(GALLERY_TOP, GALLERY_R),
                DARK, s_bot=0.6, s_top=0.2)
    disc(ring(GALLERY_TOP, GALLERY_R), DARK, up=True, shade=0.25)
    shell_sides(ring(GALLERY_TOP, GALLERY_R), ring(PARAPET_TOP, GALLERY_R),
                DARK, s_bot=0.7, s_top=0.15)
    shell_sides(ring(GALLERY_TOP, PARAPET_R_IN), ring(PARAPET_TOP, PARAPET_R_IN),
                DARK, s_bot=0.5, s_top=0.8, inward=True)
    annulus(ring(PARAPET_TOP, GALLERY_R), ring(PARAPET_TOP, PARAPET_R_IN),
            DARK, up=True, shade=0.1)

    # lantern: glowing prism, brightest at the top
    shell_sides(ring(GALLERY_TOP, LANTERN_R), ring(LANTERN_TOP, LANTERN_R),
                GLOW, s_bot=0.6, s_top=0.0)

    # roof: two-segment witch-hat cone with an overhang and a finial knob
    (r0, y0), (r1, y1), (_, y_apex) = ROOF
    shell_sides(ring(y0, r0), ring(y1, r1), RED, s_bot=0.7, s_top=0.35)
    apex = (0.0, y_apex, 0.0)
    top_ring = ring(y1, r1)
    for i in range(N):
        j = (i + 1) % N
        add_face([top_ring[i], top_ring[j], apex], RED,
                 radial_mid(top_ring[i], top_ring[j]), shades=[0.35, 0.35, 0.0])
    disc(ring(y0, r0), RED, up=False)
    shell_sides(ring(KNOB_Y0, KNOB_R), ring(KNOB_Y1, KNOB_R), DARK, s_bot=0.7, s_top=0.2)
    disc(ring(KNOB_Y1, KNOB_R), DARK, up=True, shade=0.1)

    # door: extruded outline with chamfered top corners (arched look)
    hw, ch = DOOR_W / 2, DOOR_CHAMFER
    outline = [(-hw, 0.0), (hw, 0.0), (hw, DOOR_H - ch),
               (hw - ch, DOOR_H), (-hw + ch, DOOR_H), (-hw, DOOR_H - ch)]
    front = [(x, y, DOOR_Z1) for x, y in outline]
    back = [(x, y, DOOR_Z0) for x, y in outline]
    add_face(front, WOOD, (0, 0, 1), shades=[0.75, 0.75, 0.25, 0.15, 0.15, 0.25])
    for i in range(len(outline)):
        j = (i + 1) % len(outline)
        if outline[i][1] == 0.0 and outline[j][1] == 0.0:
            continue  # bottom edge sits on the ground
        mid_x = (outline[i][0] + outline[j][0]) / 2
        mid_y = (outline[i][1] + outline[j][1]) / 2
        out = (0.0, 1.0, 0.0) if abs(mid_x) < 1e-6 else norm(
            (mid_x, 0.5 if mid_y > DOOR_H - ch else 0.0, 0.0))
        add_face([back[i], back[j], front[j], front[i]], WOOD, out, shades=[0.35]*4)

    # window: dark protruding frame with a glowing pane
    fw, fh = WIN_FRAME_W / 2, WIN_FRAME_H / 2
    gw, gh = WIN_GLASS_W / 2, WIN_GLASS_H / 2
    box(-fw, fw, WIN_Y - fh, WIN_Y + fh, 0.16, 0.315, DARK, skip=('back',),
        s_bot=0.7, s_top=0.25)
    box(-gw, gw, WIN_Y - gh, WIN_Y + gh, 0.16, 0.33, GLOW,
        skip=('back', 'top', 'bottom', 'left', 'right'), s_bot=0.55, s_top=0.1)

def write_glb(path):
    pos_bin = b''.join(struct.pack('<fff', *p) for p in positions)
    nrm_bin = b''.join(struct.pack('<fff', *n) for n in normals)
    uv_bin = b''.join(struct.pack('<ff', *t) for t in uvs)
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
    with open(path, 'wb') as f:
        f.write(out)

    print(f'{path}: {len(out)} bytes, {len(positions)} verts, {len(indices)//3} tris')
    print('bounds x %.3f..%.3f y %.3f..%.3f z %.3f..%.3f'
          % (mins[0], maxs[0], mins[1], maxs[1], mins[2], maxs[2]))

if __name__ == '__main__':
    build()
    write_glb('kits/pirate-kit/lighthouse.glb')
