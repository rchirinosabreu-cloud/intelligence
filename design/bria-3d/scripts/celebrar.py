import os
BRIA_DIR = os.environ.get('BRIA_DIR') or os.path.dirname(os.path.abspath(__file__))
# Animación «celebrar un logro»: se agacha, salta con los brazos arriba, cambia a cara feliz, aparece la chispa y aterriza.
import os, sys, math
os.environ['BRIA_RENDER'] = '0'; os.environ['BRIA_SEPARATE_ARMS'] = '1'
OUT = sys.argv[-1]; sys.argv = ['x', OUT]
exec(open(os.path.join(BRIA_DIR, 'build.py')).read())
from mathutils import Vector, Quaternion, Matrix
MOUTH = clay('boca', ['#0F1D2C'], rough=0.45, sss=0)
TONGUE = clay('lengua', ['#E46F7C'], rough=0.5, sss=0.1)
exec(open(os.path.join(BRIA_DIR, 'helpers.py')).read())
EYES = [o for o in sc.objects if o.name.startswith('Ojo')]; SHINE = [o for o in sc.objects if o.name.startswith('Brillo')]
BROWS = [o for o in sc.objects if o.name.startswith('Ceja')]; LINE = [o for o in sc.objects if o.name.startswith('Cylinder')]
before = set(sc.objects)
for sg in (-1, 1):
    ex = 0.34 * sg + 0.03
    pts = []
    for i in range(9):
        t = i / 8; x = ex - 0.13 + 0.26 * t; tin = (1 - t) if sg > 0 else t
        pts.append((x, 0.32 + 0.02 + 0.05 * math.sin(math.pi * t) + 0.03 * tin))
    face_line(f'FOjo{sg}', arc(ex - 0.13, ex + 0.13, -0.03, 0.12, 16), 0.055, BROW)
DEPTH = 0.04
STEPS = [0.06, 0.25, 0.5, 0.75, 1.0]            # la boca crece desde una línea hasta la sonrisa completa
def outline(sv, n=30):                           # misma cantidad de puntos en todos los pasos
    w = 0.105 + 0.225 * sv; h = 0.22 * sv; top = -0.17 + 0.05 * sv; cx = 0.04
    up = [(cx - w / 2 + w * i / n, top - 0.035 * sv * math.sin(math.pi * i / n)) for i in range(n + 1)]
    lo = [(cx + w / 2 - w * i / n, top - max(h, 0.012) * math.sin(math.pi * i / n) ** 0.75) for i in range(1, n)]
    return up + lo
import numpy as np
from matplotlib.path import Path as _P
def keyed_patch(name, outline_fn, out_fn, mat, depth=0.012):
    """Una lámina con una forma por paso; cambia de forma suave entre pasos con formas clave."""
    def verts(sv):
        ol = outline_fn(sv); cx = sum(x for x, _ in ol) / len(ol); cz = sum(z for _, z in ol) / len(ol)
        o_ = out_fn(sv)
        return [onsurf(cx, cz, o_)[0]] + [onsurf(x, z, o_)[0] for x, z in ol]
    v0 = verts(STEPS[0]); bm = bmesh.new(); bv = [bm.verts.new(v) for v in v0]
    for i in range(1, len(bv)): bm.faces.new((bv[0], bv[i], bv[1 + i % (len(bv) - 1)]))
    me_ = bpy.data.meshes.new(name); bm.to_mesh(me_); bm.free()
    o = bpy.data.objects.new(name, me_); sc.collection.objects.link(o); add(o, mat)
    so = o.modifiers.new('s', 'SOLIDIFY'); so.thickness = depth; so.offset = 0
    for f_ in me_.polygons: f_.use_smooth = True
    o.shape_key_add(name='Basis'); keys = []
    for sv in STEPS[1:]:
        k = o.shape_key_add(name=f'p{sv}'); vv = verts(sv)
        for i, v in enumerate(vv): k.data[i].co = v
        keys.append(k)
    return o, keys
mouth_obj, MKEYS = keyed_patch('FBoca', lambda sv: [(0.04 + (x - 0.04) * 0.97, z) for x, z in outline(sv)],
                               lambda sv: 0.004 - (DEPTH - 0.004) * sv, MOUTH)
tongue_obj, TKEYS = keyed_patch('FLengua', lambda sv: tongue_shape(0.045, -0.17 + 0.05 * sv - 0.125 * sv, 0.19 * sv + 0.01, 0.085 * sv + 0.002),
                                lambda sv: 0.0 - (DEPTH - 0.016) * sv, TONGUE, depth=0.006)
# la cavidad del cuerpo, con una forma clave por paso
body_ = bpy.data.objects['Cuerpo']; me_b = body_.data
body_.shape_key_add(name='Basis')
Vb = np.empty(len(me_b.vertices) * 3); me_b.vertices.foreach_get('co', Vb); Vb = Vb.reshape(-1, 3)
Nb = np.empty(len(me_b.vertices) * 3); me_b.vertices.foreach_get('normal', Nb); Nb = Nb.reshape(-1, 3)
front = Vb[:, 1] < -0.4; xz = Vb[:, [0, 2]]
near = np.nonzero(front & (np.abs(xz[:, 0] - 0.04) < 0.3) & (np.abs(xz[:, 1] + 0.2) < 0.2))[0]
BKEYS = [None]
for sv in STEPS[1:]:
    poly = np.array(outline(sv)); inside = np.zeros(len(Vb), bool); inside[near] = _P(poly).contains_points(xz[near])
    dmin = np.full(len(Vb), 9.0); P2 = xz[near]
    for a2, b2 in zip(poly, np.roll(poly, -1, axis=0)):
        ab = b2 - a2; u = np.clip(((P2 - a2) @ ab) / (ab @ ab + 1e-12), 0, 1)
        dmin[near] = np.minimum(dmin[near], np.linalg.norm(P2 - (a2 + np.outer(u, ab)), axis=1))
    t_ = np.clip(dmin / 0.022, 0, 1); prof = np.where(inside, DEPTH * sv * (t_ * t_ * (3 - 2 * t_)), 0.0)
    k = body_.shape_key_add(name=f'boca{sv}'); k.data.foreach_set('co', (Vb - Nb * prof[:, None]).ravel()); BKEYS.append(k)
def set_steps(keys, v):
    """Mezcla entre pasos vecinos: la forma pasa por cada paso sin saltar."""
    vals = [0.0] * len(STEPS)
    if v <= STEPS[0]: vals[0] = 1.0
    else:
        for i in range(len(STEPS) - 1):
            if STEPS[i] <= v <= STEPS[i + 1]:
                t = (v - STEPS[i]) / (STEPS[i + 1] - STEPS[i]); vals[i] = 1 - t; vals[i + 1] = t; break
    for i, k in enumerate(keys):
        if k is None: continue
        k.value = vals[i]
    return vals

happy = [o for o in sc.objects if o not in before]
# el origen de cada pieza en su centro, para que crezca y se encoja sobre sí misma
for o in happy + BROWS:
    if o.type == 'CURVE':
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
        bpy.ops.object.convert(target='MESH')
for o in happy + BROWS:
    if o.name.startswith(('FBoca', 'FLengua')): continue
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY')
happy = [bpy.data.objects[n] for n in [o.name for o in happy]]
HEYES = [o for o in happy if o.name.startswith('FOjo')]
exec(open(os.path.join(BRIA_DIR, 'rig.py')).read())
BASE = {o.name: (o.location.copy(), o.scale.copy()) for o in EYES + SHINE + BROWS + LINE + happy}  # después de colgarlas del hueso: posiciones locales

pb = rig.pose.bones
def q_for(name, d):
    b = rig.data.bones[name]; rest = b.matrix_local.to_quaternion()
    qw = (b.tail_local - b.head_local).normalized().rotation_difference(Vector(d).normalized())
    return rest.inverted() @ qw @ rest
for b in pb: b.rotation_mode = 'QUATERNION'
UP = {'Brazo.L': q_for('Brazo.L', (-0.55, -0.15, 0.85)), 'Brazo.R': q_for('Brazo.R', (0.55, -0.15, 0.85))}
HAPPY = {'Brazo.L': q_for('Brazo.L', (-0.62, -0.25, -0.40)), 'Brazo.R': q_for('Brazo.R', (0.62, -0.15, -0.40))}
BACK = {'Brazo.L': q_for('Brazo.L', (-0.45, 0.45, -0.75)), 'Brazo.R': q_for('Brazo.R', (0.45, 0.45, -0.75))}
TUCK = {'Pierna.L': q_for('Pierna.L', (-0.05, 0.35, -1)), 'Pierna.R': q_for('Pierna.R', (0.05, 0.35, -1))}
I = Quaternion()

# chispa
bm = bmesh.new(); ring = []
for i in range(8):
    a = math.radians(90 + i * 45); r = 0.30 if i % 2 == 0 else 0.085
    ring.append(bm.verts.new((r * math.cos(a), 0, r * math.sin(a))))
fv = bm.verts.new((0, -0.07, 0)); bv = bm.verts.new((0, 0.07, 0))
for i in range(8):
    bm.faces.new((ring[i], ring[(i + 1) % 8], fv)); bm.faces.new((ring[(i + 1) % 8], ring[i], bv))
me_ = bpy.data.meshes.new('chispa'); bm.to_mesh(me_)
star = bpy.data.objects.new('Chispa', me_); sc.collection.objects.link(star); add(star, GOLD)
bvl = star.modifiers.new('b', 'BEVEL'); bvl.width = 0.012; bvl.limit_method = 'ANGLE'; bvl.angle_limit = math.radians(60)
for p_ in me_.polygons: p_.use_smooth = True

def ease(t): t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)
def seg(f, a, b): return ease((f - a) / (b - a))
JUMP = os.environ.get('BRIA_JUMP', '1') != '0'
FPS = 30; N = 96
sc.render.fps = FPS; sc.frame_start = 1; sc.frame_end = N
for f in range(1, N + 1):
    # altura del salto (parábola entre 26 y 60)
    if JUMP and 26 <= f <= 60:
        t = (f - 26) / 34; h = 4 * t * (1 - t) * 0.55
    else: h = 0.0
    rig.location = (0, 0, h); rig.keyframe_insert('location', frame=f)
    # aplastar y estirar
    if not JUMP: sq = 0.015 * math.sin(math.pi * min(1, max(0, (f - 24) / 16))) + (0.010 * math.sin(2 * math.pi * (f - 40) / 40) if f > 40 else 0)
    elif f < 14: sq = 0.0
    elif f < 24: sq = -0.05 * seg(f, 14, 24)                       # se agacha
    elif f < 32: sq = -0.05 + 0.09 * seg(f, 24, 32)                 # se estira al despegar
    elif f < 54: sq = 0.04 - 0.04 * seg(f, 32, 54)
    elif f < 63: sq = 0.03 * seg(f, 54, 60) - 0.08 * seg(f, 60, 63) # cae estirada y aplasta al tocar el piso
    elif f < 74: sq = -0.05 + 0.05 * seg(f, 63, 74)
    else: sq = 0.012 * math.sin(2 * math.pi * (f - 78) / 40)
    pb['Cuerpo'].scale = (1 - 0.4 * sq, 1 - 0.4 * sq, 1 + sq); pb['Cuerpo'].keyframe_insert('scale', frame=f)
    # brazos: atrás al agacharse, arriba en el salto, a medio camino al aterrizar
    for k in ('Brazo.L', 'Brazo.R'):
        if not JUMP: q = I.slerp(HAPPY[k], seg(f, 16, 34)); q = q.slerp(I, 0.05 * (0.5 - 0.5 * math.cos(2 * math.pi * max(0, f - 34) / 30)))
        elif f < 14: q = I
        elif f < 24: q = I.slerp(BACK[k], seg(f, 14, 24))
        elif f < 34: q = BACK[k].slerp(UP[k], seg(f, 24, 34))
        elif f < 58: q = UP[k]
        elif f < 74: q = UP[k].slerp(HAPPY[k], seg(f, 58, 74))
        else: q = HAPPY[k]
        pb[k].rotation_quaternion = q; pb[k].keyframe_insert('rotation_quaternion', frame=f)
    for k in ('Pierna.L', 'Pierna.R'):
        q = I.slerp(TUCK[k], seg(f, 28, 38) * (1 - seg(f, 50, 60))) if JUMP else I
        pb[k].rotation_quaternion = q; pb[k].keyframe_insert('rotation_quaternion', frame=f)
    # la cara pasa de seria a feliz en un recorrido: la boca se estira y se abre, los ojos se entrecierran hasta volverse medias lunas
    m1 = seg(f, 14, 20)                    # la línea de la boca se estira
    m2 = seg(f, 20, 29)                    # la boca se abre
    e1 = seg(f, 16, 23)                    # los ojos se entrecierran
    e2 = seg(f, 22, 29)                    # las medias lunas se curvan
    b1 = seg(f, 16, 28)                    # las cejas suben un poco
    v = STEPS[0] + (1 - STEPS[0]) * m2
    for o in LINE:   # la línea se estira hasta el ancho de la boca y cede el lugar a la boca, que nace con su misma forma
        loc, sca = BASE[o.name]; o.scale = (sca.x, sca.y, sca.z); o.hide_render = m1 >= 0.999
        o.keyframe_insert('scale', frame=f); o.keyframe_insert('hide_render', frame=f)
    set_steps(BKEYS, v); set_steps([None] + MKEYS, v); set_steps([None] + TKEYS, v)
    for k in BKEYS[1:] + MKEYS + TKEYS: k.keyframe_insert('value', frame=f)
    mouth_obj.hide_render = m1 < 0.999; tongue_obj.hide_render = m2 < 0.2
    mouth_obj.keyframe_insert('hide_render', frame=f); tongue_obj.keyframe_insert('hide_render', frame=f)
    for o in EYES + SHINE:
        loc, sca = BASE[o.name]; k = 1 - 0.88 * e1; o.scale = (sca.x, sca.y, sca.z * k)
        o.location = (loc.x, loc.y, loc.z + 0.03 * e1); o.hide_render = e1 >= 0.97 or (o in SHINE and e1 > 0.5)
        for p_ in ('scale', 'location', 'hide_render'): o.keyframe_insert(p_, frame=f)
    for o in HEYES:
        loc, sca = BASE[o.name]; k = max(0.12, e2); o.scale = (sca.x, sca.y, sca.z * k); o.hide_render = e1 < 0.97
        o.keyframe_insert('scale', frame=f); o.keyframe_insert('hide_render', frame=f)
    for o in BROWS:
        loc, sca = BASE[o.name]; o.location = (loc.x, loc.y, loc.z + 0.025 * b1); o.keyframe_insert('location', frame=f)
    # la chispa crece con un giro en lo alto y se queda flotando
    s = 1.05 * (ease((f - 36) / 10) if f >= 36 else 0.0) if JUMP else 0.0
    star.scale = (s, s, s); star.location = (0.62, -0.15, 1.62 + h * 0.85 + 0.03 * math.sin(f / 6))
    star.rotation_euler = (0, math.radians(360) * (1 - ease((f - 36) / 14)) if f >= 36 else 0, 0)
    for prop in ('scale', 'location', 'rotation_euler'): star.keyframe_insert(prop, frame=f)
cam = sc.camera; a_ = math.radians(30); dist = 11.0
cam.location = (dist * math.sin(a_), -dist * math.cos(a_), 0.7); cam.data.lens = 72
cam.rotation_euler = (Vector((0, 0, 0.45)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
sc.render.resolution_x = 720; sc.render.resolution_y = 900; sc.cycles.samples = int(os.environ.get('SAMPLES', '14'))
sc.render.film_transparent = True
os.makedirs(f'{OUT}/frames', exist_ok=True)
fr = os.environ.get('FRAMES')
if fr:
    for f in map(int, fr.split(',')):
        sc.frame_set(f); sc.render.filepath = f'{OUT}/frames/f{f:04d}'; bpy.ops.render.render(write_still=True)
else:
    sc.render.filepath = f'{OUT}/frames/f'; bpy.ops.render.render(animation=True)
