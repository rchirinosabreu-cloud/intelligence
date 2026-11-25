import os
BRIA_DIR = os.environ.get('BRIA_DIR') or os.path.dirname(os.path.abspath(__file__))
# Animaciones de expresión: Bria pasa de la cara de reposo a una emoción en un recorrido continuo y se queda viva.
# BRIA_LOOP = reposo | sentada | trabajando: ciclos que se repiten sin corte
import os, sys, math
os.environ['BRIA_RENDER'] = '0'; os.environ['BRIA_SEPARATE_ARMS'] = '1'
OUT = sys.argv[-1]; sys.argv = ['x', OUT]; LOOP = os.environ.get('BRIA_LOOP', 'reposo')
exec(open(os.path.join(BRIA_DIR, 'build.py')).read())
import numpy as np
from mathutils import Vector, Quaternion, Euler
from matplotlib.path import Path as _P
MOUTH = clay('boca', ['#0F1D2C'], rough=0.45, sss=0)
exec(open(os.path.join(BRIA_DIR, 'helpers.py')).read())

GREY = None
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


BROWT = {'reposo': (0.03, 0.0, 0.03), 'sentada': (0.02, 0.0, 0.01), 'trabajando': (-0.03, 0.01, -0.01)}[LOOP]
drop('Ceja'); KEYS = []
for sg in (-1, 1):
    o, k = morph(f'Ceja{sg}', brow_pts(sg, 0, 0, 0), brow_pts(sg, *BROWT), 0.05, BROW); KEYS.append(k)
drop('Cylinder')
LINE = [(-0.02 + 0.12 * i / 11, -0.17) for i in range(12)]
mouth, MKEY = morph('Boca', LINE, arc(-0.06, 0.14, -0.155, -0.05, 12), 0.022, BROW)   # de la línea a una sonrisa cerrada
EYES = [o for o in sc.objects if o.name.startswith('Ojo')]; SHINE = [o for o in sc.objects if o.name.startswith('Brillo')]
exec(open(os.path.join(BRIA_DIR, 'rig.py')).read())
BASE = {o.name: (o.location.copy(), o.scale.copy()) for o in EYES + SHINE}
pb = rig.pose.bones
for b in pb: b.rotation_mode = 'QUATERNION'
def q_for(name, d):
    b = rig.data.bones[name]; rest = b.matrix_local.to_quaternion()
    qw = (b.tail_local - b.head_local).normalized().rotation_difference(Vector(d).normalized())
    return rest.inverted() @ qw @ rest
from mathutils import Matrix
def place(name, head, d):
    b = rig.data.bones[name]
    qw = (b.tail_local - b.head_local).normalized().rotation_difference(Vector(d).normalized())
    pb[name].matrix = Matrix.Translation(Vector(head)) @ qw.to_matrix().to_4x4() @ b.matrix_local.to_3x3().to_4x4()
    bpy.context.view_layer.update()
I = Quaternion()
SEATED = LOOP in ('sentada', 'trabajando')
if SEATED:
    rig.location.z = -0.42
    place('Pierna.L', (-0.30, -0.35, -0.86), (-0.22, -1, -0.05)); place('Pierna.R', (0.30, -0.35, -0.86), (0.22, -1, -0.05))
    LEGQ = {k: pb[k].rotation_quaternion.copy() for k in ('Pierna.L', 'Pierna.R')}
    LEGL = {k: pb[k].location.copy() for k in ('Pierna.L', 'Pierna.R')}
if LOOP == 'trabajando':
    # el portátil sobre las piernas: tapa de aluminio vista por detrás, con el isotipo en menta
    ALU = clay('aluminio', ['#C9D6DE'], rough=0.3, sss=0); ALU.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value = 0.5
    LOGO = clay('logo', ['#4FCB9E'], rough=0.4, sss=0)
    def slab(name, loc, size, rot, mat, bevel=0.03):
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot); o = bpy.context.object; o.name = name
        o.scale = size; add(o, mat); bv = o.modifiers.new('b', 'BEVEL'); bv.width = bevel; bv.segments = 4
        for f_ in o.data.polygons: f_.use_smooth = True
        return o
    # base sobre las piernas; la bisagra en el borde de afuera y la pantalla mirando a Bria
    slab('Base', (0.22, -0.98, -0.96), (0.95, 0.60, 0.035), (0, 0, 0), ALU)
    th = math.radians(15); hinge = Vector((0.22, -1.28, -0.94)); up = Vector((0, -math.sin(th), math.cos(th)))
    slab('Tapa', hinge + up * 0.31, (0.95, 0.03, 0.62), (th, 0, 0), ALU)
    nrm = Vector((0, -math.cos(th), -math.sin(th)))
    bpy.ops.mesh.primitive_cylinder_add(radius=0.075, depth=0.008, location=hinge + up * 0.32 + nrm * 0.019, rotation=(math.radians(90) + th, 0, 0))
    add(bpy.context.object, LOGO)
    ARM0 = {'Brazo.L': q_for('Brazo.L', (0.30, -0.80, -0.22)), 'Brazo.R': q_for('Brazo.R', (-0.12, -0.86, -0.22))}
    ARM1 = {'Brazo.L': q_for('Brazo.L', (0.30, -0.80, -0.10)), 'Brazo.R': q_for('Brazo.R', (-0.12, -0.86, -0.10))}
elif LOOP == 'sentada':
    ARM0 = {'Brazo.L': q_for('Brazo.L', (-0.45, -0.35, -0.55)), 'Brazo.R': q_for('Brazo.R', (0.45, -0.30, -0.55))}
else:
    ARM0 = {'Brazo.L': I, 'Brazo.R': I}

def ease(t): t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)
def bump(f, a, b, c, d): return ease((f - a) / (b - a)) * (1 - ease((f - c) / (d - c)))   # sube de a a b, baja de c a d
FPS = 30; N = 120
sc.render.fps = FPS; sc.frame_start = 1; sc.frame_end = N
TAU = 2 * math.pi
for f in range(1, N + 1):
    ph = (f - 1) / N                                      # fase del ciclo: todo vuelve a empezar igual en el cuadro 121
    breath = 0.012 * math.sin(TAU * ph * 2)
    if LOOP == 'reposo':
        bv = bump(f, 40, 52, 70, 84); mv = bump(f, 44, 58, 74, 90)        # un gesto amable a mitad del ciclo
    elif LOOP == 'sentada':
        bv = 1.0; mv = 1.0
    else:
        bv = 1.0; mv = 0.6 + 0.4 * bump(f, 70, 78, 92, 100)               # sonríe un poco más al mirarte
    for k in KEYS: k.value = bv; k.keyframe_insert('value', frame=f)
    MKEY.value = mv; MKEY.keyframe_insert('value', frame=f)
    blink = 1.0
    for fb in (28, 96):
        d_ = f - fb
        if -3 <= d_ <= 0: blink = 1 - 0.9 * (d_ + 3) / 3
        elif 0 < d_ <= 4: blink = 0.1 + 0.9 * d_ / 4
    look = 0.0
    if LOOP == 'trabajando': look = -0.06 * (1 - bump(f, 68, 74, 92, 98)) + 0.0   # mira la pantalla y levanta la vista un momento
    for o in EYES + SHINE:
        loc, sca = BASE[o.name]
        o.scale = (sca.x, sca.y, sca.z * blink); o.location = (loc.x, loc.y, loc.z + (look if o in SHINE else 0))
        o.keyframe_insert('scale', frame=f); o.keyframe_insert('location', frame=f)
    for k in ('Brazo.L', 'Brazo.R'):
        if LOOP == 'trabajando':
            sgn = 0 if k == 'Brazo.L' else 0.5
            typing = (0.5 - 0.5 * math.cos(TAU * (ph * 15 + sgn))) * (1 - bump(f, 64, 70, 94, 100))   # teclea y para cuando te mira
            q = ARM0[k].slerp(ARM1[k], typing)
        elif LOOP == 'sentada':
            q = ARM0[k].slerp(I, 0.05 * (0.5 - 0.5 * math.cos(TAU * ph * 2)))
        else:
            sw = math.sin(TAU * (ph * 2 + (0 if k == 'Brazo.L' else 0.5)))
            q = Euler((math.radians(4) * sw, 0, 0)).to_quaternion()
        pb[k].rotation_quaternion = q; pb[k].keyframe_insert('rotation_quaternion', frame=f)
    if SEATED:
        for k in ('Pierna.L', 'Pierna.R'):
            sw = math.sin(TAU * (ph * 2 + (0 if k == 'Pierna.L' else 0.5))) if LOOP == 'sentada' else 0.0
            pb[k].rotation_quaternion = LEGQ[k] @ Euler((math.radians(6) * sw, 0, 0)).to_quaternion()   # balancea los pies
            pb[k].location = LEGL[k]
            pb[k].keyframe_insert('rotation_quaternion', frame=f); pb[k].keyframe_insert('location', frame=f)
    sway = Euler((0, math.radians(2.0) * math.sin(TAU * ph), 0)).to_quaternion() if LOOP == 'reposo' else I
    pb['Cuerpo'].rotation_quaternion = sway; pb['Cuerpo'].keyframe_insert('rotation_quaternion', frame=f)
    pb['Cuerpo'].scale = (1 - 0.4 * breath, 1 - 0.4 * breath, 1 + breath); pb['Cuerpo'].keyframe_insert('scale', frame=f)

cam = sc.camera; a_ = math.radians(30); dist = 11.0
cam.location = (dist * math.sin(a_), -dist * math.cos(a_), 0.7); cam.data.lens = 72
cam.rotation_euler = (Vector((0, 0, 0.30 if not SEATED else 0.0)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
sc.render.resolution_x = 720; sc.render.resolution_y = 900; sc.render.resolution_percentage = int(os.environ.get('PCT', '40'))
sc.cycles.samples = int(os.environ.get('SAMPLES', '12'))
sc.render.film_transparent = True
# Giro hacia la cámara (Rodny, 18 de noviembre de 2026: «no puede ponerse de frente cuando pongo el cursor sobre ella?»).
# El mismo ciclo de reposo renderizado en varios ángulos: el reproductor elige el cuadro por fase del ciclo y por ángulo,
# así el giro arranca desde donde está el ciclo y nunca salta. Gira el cuerpo entero (el armazón), nunca la cabeza.
# De frente sonríe un poco más y levanta las cejas: te está mirando.
ANGLES = [int(a) for a in os.environ.get('ANGLES', '0,6,12,18,24,30').split(',')]
STEP = int(os.environ.get('STEP', '2'))
only = os.environ.get('ONLY')
rig.rotation_mode = 'XYZ'
for ai, ang in enumerate(ANGLES):
    s_ = ang / max(ANGLES)
    for f in range(1, N + 1):
        bv0 = bump(f, 40, 52, 70, 84); mv0 = bump(f, 44, 58, 74, 90)
        for k in KEYS: k.value = bv0 + (1 - bv0) * 0.8 * ease(s_); k.keyframe_insert('value', frame=f)
        MKEY.value = mv0 + (1 - mv0) * ease(s_); MKEY.keyframe_insert('value', frame=f)
    rig.rotation_euler.z = math.radians(ang)
    os.makedirs(f'{OUT}/a{ang:02d}', exist_ok=True)
    frames = list(range(1, N + 1, STEP)) if not only else [int(x) for x in only.split(',')]
    for f in frames:
        sc.frame_set(f); sc.render.filepath = f'{OUT}/a{ang:02d}/f{f:04d}'; bpy.ops.render.render(write_still=True)
