import os
BRIA_DIR = os.environ.get('BRIA_DIR') or os.path.dirname(os.path.abspath(__file__))
# Animaciones de expresión: Bria pasa de la cara de reposo a una emoción en un recorrido continuo y se queda viva.
# BRIA_EXPR = triste | molesta | sorprendida | pensando
import os, sys, math
os.environ['BRIA_RENDER'] = '0'; os.environ['BRIA_SEPARATE_ARMS'] = '1'
OUT = sys.argv[-1]; sys.argv = ['x', OUT]; EXPR = os.environ.get('BRIA_EXPR', 'triste')
exec(open(os.path.join(BRIA_DIR, 'build.py')).read())
import numpy as np
from mathutils import Vector, Quaternion, Euler
from matplotlib.path import Path as _P
MOUTH = clay('boca', ['#0F1D2C'], rough=0.45, sss=0)
exec(open(os.path.join(BRIA_DIR, 'helpers.py')).read())

CFG = {
    'triste':      dict(brows=(0.09, -0.05, -0.01), eyes='abajo', mouth='triste',
                        arms=((-0.12, 0.05, -1), (0.12, 0.05, -1)), lean=7),
    'molesta':     dict(brows=(-0.09, 0.05, -0.02), eyes='entrecerrados', mouth='puchero',
                        arms=((-0.62, 0.38, -0.55), (0.62, 0.42, -0.55)), lean=5),
    'sorprendida': dict(brows=(0.10, 0.08, 0.08), eyes='grandes', mouth='o',
                        arms=((-0.85, -0.25, 0.30), (0.85, -0.15, 0.30)), lean=-4),
    'pensando':    dict(brows=(0.06, -0.02, 0.0), eyes='arriba', mouth='lado',
                        arms=(None, (0.25, -0.35, 0.75)), lean=0),
}[EXPR]

def to_mesh(o):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.convert(target='MESH'); return bpy.context.object
def morph(name, pts0, pts1, r, mat):
    """Una pieza de la cara que pasa de una forma a otra con una forma clave (misma cantidad de puntos)."""
    a = to_mesh(face_line(name, pts0, r, mat)); b = to_mesh(face_line(name + '_t', pts1, r, mat))
    a.shape_key_add(name='Basis'); k = a.shape_key_add(name='meta')
    for i, v in enumerate(b.data.vertices): k.data[i].co = v.co
    bpy.data.objects.remove(b, do_unlink=True); return a, k
def brow_pts(sg, inner, outer, lift):
    ex = 0.34 * sg + 0.03; pts = []
    for i in range(9):
        t = i / 8; x = ex - 0.13 + 0.26 * t; tin = (1 - t) if sg > 0 else t
        pts.append((x, 0.32 + lift + 0.05 * math.sin(math.pi * t) + inner * tin + outer * (1 - tin)))
    return pts

# cejas: de la forma de reposo a la de la emoción
drop('Ceja'); KEYS = []
for sg in (-1, 1):
    o, k = morph(f'Ceja{sg}', brow_pts(sg, 0, 0, 0), brow_pts(sg, *CFG['brows']), 0.05, BROW); KEYS.append(k)
# boca
drop('Cylinder')
LINE = [(-0.02 + 0.12 * i / 11, -0.17) for i in range(12)]
MKEY = None; CAV = None
if CFG['mouth'] == 'o':
    # la boquita se vuelve un hueco redondo hundido en el cuerpo, que crece desde la línea
    DEPTH = 0.035; STEPS = [0.06, 0.25, 0.5, 0.75, 1.0]
    def outline(sv, n=40):
        w = 0.12 + 0.01 * sv; h = max(0.012, 0.17 * sv); cz = -0.17 - 0.05 * sv
        return [(0.04 + (w / 2) * math.cos(2 * math.pi * i / n), cz + (h / 2) * math.sin(2 * math.pi * i / n)) for i in range(n)]
    def verts(sv, out):
        ol = outline(sv); cx = 0.04; cz = sum(z for _, z in ol) / len(ol)
        return [onsurf(cx, cz, out)[0]] + [onsurf(x, z, out)[0] for x, z in ol]
    v0 = verts(STEPS[0], 0.004); bm = bmesh.new(); bv = [bm.verts.new(v) for v in v0]
    for i in range(1, len(bv)): bm.faces.new((bv[0], bv[i], bv[1 + i % (len(bv) - 1)]))
    me_ = bpy.data.meshes.new('Boca'); bm.to_mesh(me_); bm.free()
    mouth = bpy.data.objects.new('Boca', me_); sc.collection.objects.link(mouth); add(mouth, MOUTH)
    so = mouth.modifiers.new('s', 'SOLIDIFY'); so.thickness = 0.012; so.offset = 0
    mouth.shape_key_add(name='Basis'); MK = [None]
    for sv in STEPS[1:]:
        k = mouth.shape_key_add(name=f'p{sv}')
        for i, v in enumerate(verts(sv, 0.004 - (DEPTH - 0.004) * sv)): k.data[i].co = v
        MK.append(k)
    body_ = bpy.data.objects['Cuerpo']; me_b = body_.data; body_.shape_key_add(name='Basis')
    Vb = np.empty(len(me_b.vertices) * 3); me_b.vertices.foreach_get('co', Vb); Vb = Vb.reshape(-1, 3)
    Nb = np.empty(len(me_b.vertices) * 3); me_b.vertices.foreach_get('normal', Nb); Nb = Nb.reshape(-1, 3)
    xz = Vb[:, [0, 2]]; near = np.nonzero((Vb[:, 1] < -0.4) & (np.abs(xz[:, 0] - 0.04) < 0.25) & (np.abs(xz[:, 1] + 0.2) < 0.2))[0]
    BK = [None]
    for sv in STEPS[1:]:
        poly = np.array(outline(sv)); inside = np.zeros(len(Vb), bool); inside[near] = _P(poly).contains_points(xz[near])
        dmin = np.full(len(Vb), 9.0); P2 = xz[near]
        for a2, b2 in zip(poly, np.roll(poly, -1, axis=0)):
            ab = b2 - a2; u = np.clip(((P2 - a2) @ ab) / (ab @ ab + 1e-12), 0, 1)
            dmin[near] = np.minimum(dmin[near], np.linalg.norm(P2 - (a2 + np.outer(u, ab)), axis=1))
        t_ = np.clip(dmin / 0.02, 0, 1); prof = np.where(inside, DEPTH * sv * (t_ * t_ * (3 - 2 * t_)), 0.0)
        k = body_.shape_key_add(name=f'o{sv}'); k.data.foreach_set('co', (Vb - Nb * prof[:, None]).ravel()); BK.append(k)
    def set_steps(keys, v):
        vals = [0.0] * len(STEPS)
        if v <= STEPS[0]: vals[0] = 1.0
        else:
            for i in range(len(STEPS) - 1):
                if STEPS[i] <= v <= STEPS[i + 1]:
                    t = (v - STEPS[i]) / (STEPS[i + 1] - STEPS[i]); vals[i] = 1 - t; vals[i + 1] = t; break
        for i, k in enumerate(keys):
            if k is not None: k.value = vals[i]
    # mientras la boca no se abre, la línea de siempre
    line_o, _ = morph('BocaLinea', LINE, LINE, 0.02, BROW)
else:
    target = {'triste': arc(-0.05, 0.13, -0.22, 0.045, 12), 'puchero': arc(-0.03, 0.11, -0.215, 0.035, 12),
              'lado': [(0.0 + 0.13 * i / 11, -0.19 + 0.025 * i / 11) for i in range(12)]}[CFG['mouth']]
    line_o, MKEY = morph('Boca', LINE, target, 0.02, BROW)
EYES = [o for o in sc.objects if o.name.startswith('Ojo')]; SHINE = [o for o in sc.objects if o.name.startswith('Brillo')]
exec(open(os.path.join(BRIA_DIR, 'rig.py')).read())
BASE = {o.name: (o.location.copy(), o.scale.copy()) for o in EYES + SHINE}

pb = rig.pose.bones
for b in pb: b.rotation_mode = 'QUATERNION'
def q_for(name, d):
    b = rig.data.bones[name]; rest = b.matrix_local.to_quaternion()
    qw = (b.tail_local - b.head_local).normalized().rotation_difference(Vector(d).normalized())
    return rest.inverted() @ qw @ rest
I = Quaternion()
ARM_T = {k: (q_for(k, d) if d else I) for k, d in zip(('Brazo.L', 'Brazo.R'), CFG['arms'])}
LEAN = Euler((math.radians(CFG['lean']), 0, 0)).to_quaternion()
def ease(t): t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)
def seg(f, a, b): return ease((f - a) / (b - a))

FPS = 30; N = 100
sc.render.fps = FPS; sc.frame_start = 1; sc.frame_end = N
for f in range(1, N + 1):
    e = seg(f, 14, 32)                      # la emoción llega en poco más de medio segundo
    life = math.sin(2 * math.pi * f / 50)   # respiración
    for k in KEYS: k.value = e; k.keyframe_insert('value', frame=f)
    if MKEY is not None: MKEY.value = seg(f, 16, 32); MKEY.keyframe_insert('value', frame=f)
    if CFG['mouth'] == 'o':
        m1 = seg(f, 16, 30); v = 0.06 + 0.94 * m1
        set_steps(BK, v); set_steps(MK, v)
        for k in BK[1:] + MK[1:]: k.keyframe_insert('value', frame=f)
        line_o.hide_render = m1 > 0.001; mouth.hide_render = m1 <= 0.001
        line_o.keyframe_insert('hide_render', frame=f); mouth.keyframe_insert('hide_render', frame=f)
    # ojos: la forma de la emoción y parpadeos (a los 2.2 s y 3.0 s, el segundo solo en triste y pensando)
    blink = 1.0
    for fb in ((66,) + ((90,) if EXPR in ('triste', 'pensando') else ())):
        d_ = f - fb
        if -3 <= d_ <= 0: blink = 1 - 0.9 * (d_ + 3) / 3
        elif 0 < d_ <= 4: blink = 0.1 + 0.9 * d_ / 4
    for o in EYES + SHINE:
        loc, sca = BASE[o.name]; sx = sy = sz = 1.0; dz = 0.0
        if CFG['eyes'] == 'grandes': sx = sy = sz = 1 + 0.18 * e
        if CFG['eyes'] == 'entrecerrados' and o in EYES: sz = 1 - 0.38 * e
        if CFG['eyes'] in ('arriba', 'abajo') and o in SHINE: dz = (0.05 if CFG['eyes'] == 'arriba' else -0.06) * e
        o.scale = (sca.x * sx, sca.y * sy, sca.z * sz * blink); o.location = (loc.x, loc.y, loc.z + dz)
        o.keyframe_insert('scale', frame=f); o.keyframe_insert('location', frame=f)
    # cuerpo: brazos, inclinación y la vida de cada emoción
    for k in ('Brazo.L', 'Brazo.R'):
        q = I.slerp(ARM_T[k], seg(f, 12, 30))
        if EXPR == 'pensando' and k == 'Brazo.R' and f > 40:   # se da golpecitos en la mejilla
            q = ARM_T[k].slerp(I, 0.06 * (0.5 - 0.5 * math.cos(2 * math.pi * (f - 40) / 18)))
        if EXPR == 'molesta' and f > 40:                       # tensión: un leve temblor de enojo en los brazos
            q = ARM_T[k].slerp(I, 0.03 * (0.5 - 0.5 * math.cos(2 * math.pi * (f - 40) / 10)))
        if EXPR == 'sorprendida' and f > 30:
            q = ARM_T[k].slerp(I, 0.06 * math.sin(math.pi * min(1.0, (f - 30) / 24)))
        pb[k].rotation_quaternion = q; pb[k].keyframe_insert('rotation_quaternion', frame=f)
    lean = I.slerp(LEAN, seg(f, 12, 32))
    if EXPR == 'triste': breath = 0.010 * math.sin(2 * math.pi * f / 70)    # respira lento, como un suspiro
    elif EXPR == 'molesta': breath = 0.03 * math.exp(-((f - 52) / 4) ** 2) + 0.008 * life   # un resoplido
    else: breath = 0.012 * life
    pb['Cuerpo'].rotation_quaternion = lean; pb['Cuerpo'].keyframe_insert('rotation_quaternion', frame=f)
    pb['Cuerpo'].scale = (1 - 0.4 * breath, 1 - 0.4 * breath, 1 + breath); pb['Cuerpo'].keyframe_insert('scale', frame=f)
    hop = 0.10 * math.sin(math.pi * min(1, max(0, (f - 14) / 12))) if EXPR == 'sorprendida' else 0.0   # un respingo
    rig.location = (0, 0, hop); rig.keyframe_insert('location', frame=f)

cam = sc.camera; a_ = math.radians(30); dist = 11.0
cam.location = (dist * math.sin(a_), -dist * math.cos(a_), 0.7); cam.data.lens = 72
cam.rotation_euler = (Vector((0, 0, 0.30)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
sc.render.resolution_x = 720; sc.render.resolution_y = 900; sc.cycles.samples = int(os.environ.get('SAMPLES', '12'))
sc.render.film_transparent = True
os.makedirs(f'{OUT}/frames', exist_ok=True)
fr = os.environ.get('FRAMES')
if fr:
    for f in map(int, fr.split(',')):
        sc.frame_set(f); sc.render.filepath = f'{OUT}/frames/f{f:04d}'; bpy.ops.render.render(write_still=True)
else:
    sc.render.filepath = f'{OUT}/frames/f'; bpy.ops.render.render(animation=True)
