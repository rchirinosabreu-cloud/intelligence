import os
BRIA_DIR = os.environ.get('BRIA_DIR') or os.path.dirname(os.path.abspath(__file__))
# Poses y expresiones de Bria: una por ejecución (BRIA_POSE), con la cara armada antes del esqueleto.
import os, sys, math
os.environ['BRIA_RENDER'] = '0'; os.environ['BRIA_SEPARATE_ARMS'] = '1'
OUT = sys.argv[-1]; POSE = os.environ.get('BRIA_POSE', 'feliz')
sys.argv = ['x', OUT]
exec(open(os.path.join(BRIA_DIR, 'build.py')).read())
from mathutils import Vector, Quaternion

MOUTH = clay('boca', ['#0F1D2C'], rough=0.45, sss=0)
TONGUE = clay('lengua', ['#E46F7C'], rough=0.5, sss=0.1)
def drop(prefix):
    for o in [o for o in sc.objects if o.name.startswith(prefix)]: bpy.data.objects.remove(o, do_unlink=True)
def face_line(name, pts, r, mat, out=0.012):
    return tube(name, [(onsurf(x, z, out)[0], r * (0.6 + 0.4 * math.sin(math.pi * i / (len(pts) - 1)))) for i, (x, z) in enumerate(pts)], mat, 6)
def arc(x0, x1, z0, h, n=12):
    return [(x0 + (x1 - x0) * i / (n - 1), z0 + h * math.sin(math.pi * i / (n - 1))) for i in range(n)]

# --- la expresión de cada pose: cejas (interior, exterior), ojos y boca ---
FACES = {
    'feliz':       dict(brows=(0.02, 0.0, 0.0), eyes='felices', mouth='abierta'),
    'celebrando':  dict(brows=(0.03, 0.01, 0.02), eyes='felices', mouth='abierta'),
    'pensando':    dict(brows=(0.06, -0.02, 0.0), eyes='arriba', mouth='lado'),
    'triste':      dict(brows=(0.09, -0.05, -0.01), eyes='abajo', mouth='triste'),
    'cruzada':     dict(brows=(-0.06, 0.03, -0.01), eyes='entrecerrados', mouth='recta'),
    'molesta':     dict(brows=(-0.09, 0.05, -0.02), eyes='entrecerrados', mouth='puchero'),
    'sorprendida': dict(brows=(0.10, 0.08, 0.08), eyes='grandes', mouth='o'),
    'sentada':     dict(brows=(0.02, 0.0, 0.0), eyes='abiertos', mouth='sonrisa'),
    'trabajando':  dict(brows=(-0.02, 0.0, -0.01), eyes='abajo', mouth='sonrisa'),
}
F = FACES[POSE]
# cejas
drop('Ceja')
for sg in (-1, 1):
    ex = 0.34 * sg + 0.03
    inner, outer, lift = F['brows']
    pts = []
    for i in range(9):
        t = i / 8; x = ex - 0.13 + 0.26 * t
        tin = (1 - t) if sg > 0 else t          # 1 en el extremo de adentro
        z = 0.32 + lift + 0.05 * math.sin(math.pi * t) + inner * tin + outer * (1 - tin)
        pts.append((x, z))
    face_line(f'Ceja{sg}', pts, 0.042 if F['eyes'] == 'felices' else 0.05, BROW)
# ojos
eyes = F['eyes']
if eyes in ('felices',):
    drop('Ojo'); drop('Brillo')
    for sg in (-1, 1):
        ex = 0.34 * sg + 0.03
        face_line(f'OjoFeliz{sg}', arc(ex - 0.13, ex + 0.13, -0.03, 0.12, 16), 0.055, BROW)
else:
    for o in [o for o in sc.objects if o.name.startswith('Ojo') or o.name.startswith('Brillo')]:
        if eyes == 'grandes': o.scale *= 1.18
        if eyes == 'entrecerrados' and o.name.startswith('Ojo'): o.scale.z *= 0.62
        if eyes in ('arriba', 'abajo') and o.name.startswith('Brillo'):
            o.location.z += 0.05 if eyes == 'arriba' else -0.06
# boca
drop('Cylinder')
m = F['mouth']
def surf_patch(name, outline, mat, out=0.004, depth=0.012):
    """Una lámina con la forma dada, proyectada sobre la cara y con un poco de grosor."""
    bm = bmesh.new()
    cx = sum(x for x, _ in outline) / len(outline); cz = sum(z for _, z in outline) / len(outline)
    c = bm.verts.new(onsurf(cx, cz, out)[0]); ring = [bm.verts.new(onsurf(x, z, out)[0]) for x, z in outline]
    for i in range(len(ring)): bm.faces.new((c, ring[i], ring[(i + 1) % len(ring)]))
    me_ = bpy.data.meshes.new(name); bm.to_mesh(me_); bm.free()
    o = bpy.data.objects.new(name, me_); sc.collection.objects.link(o); add(o, mat)
    so = o.modifiers.new('s', 'SOLIDIFY'); so.thickness = depth; so.offset = 0
    for f_ in me_.polygons: f_.use_smooth = True
    return o
def smile_shape(cx, top, w, h, n=30):
    up = [(cx - w / 2 + w * i / n, top - 0.035 * math.sin(math.pi * i / n)) for i in range(n + 1)]
    lo = [(cx + w / 2 - w * i / n, top - h * math.sin(math.pi * i / n) ** 0.75) for i in range(1, n)]
    return up + lo
def tongue_shape(cx, top, w, h, n=24):
    pts = [(cx - w / 2 + w * i / 8, top) for i in range(8)]
    pts += [(cx + (w / 2) * math.cos(math.pi * i / n), top - h * math.sin(math.pi * i / n)) for i in range(n + 1)]
    return pts
if m == 'abierta':
    surf_patch('Boca', smile_shape(0.04, -0.12, 0.33, 0.22), MOUTH, out=0.014)
    surf_patch('Lengua', tongue_shape(0.045, -0.245, 0.19, 0.085), TONGUE, out=0.022, depth=0.006)
elif m == 'o':
    surf_patch('Boca', [(0.04 + 0.05 * math.cos(2 * math.pi * i / 24), -0.21 + 0.065 * math.sin(2 * math.pi * i / 24)) for i in range(24)], MOUTH)
elif m == 'sonrisa':
    face_line('Boca', arc(-0.07, 0.15, -0.15, -0.055), 0.022, BROW)
elif m == 'triste':
    face_line('Boca', arc(-0.05, 0.13, -0.22, 0.045), 0.022, BROW)
elif m == 'puchero':
    face_line('Boca', arc(-0.03, 0.11, -0.215, 0.035, 10), 0.024, BROW)
elif m == 'lado':
    face_line('Boca', [(0.0 + 0.13 * i / 7, -0.19 + 0.025 * i / 7) for i in range(8)], 0.02, BROW)
else:
    face_line('Boca', [(-0.03 + 0.14 * i / 7, -0.18) for i in range(8)], 0.02, BROW)

exec(open(os.path.join(BRIA_DIR, 'rig.py')).read())

# --- la pose del cuerpo ---
pb = rig.pose.bones
def aim(name, d):
    b = rig.data.bones[name]; rest = b.matrix_local.to_quaternion()
    qw = (b.tail_local - b.head_local).normalized().rotation_difference(Vector(d).normalized())
    p = pb[name]; p.rotation_mode = 'QUATERNION'; p.rotation_quaternion = rest.inverted() @ qw @ rest
from mathutils import Matrix
def place(name, head, d):
    b = rig.data.bones[name]
    qw = (b.tail_local - b.head_local).normalized().rotation_difference(Vector(d).normalized())
    pb[name].matrix = Matrix.Translation(Vector(head)) @ qw.to_matrix().to_4x4() @ b.matrix_local.to_3x3().to_4x4()
    bpy.context.view_layer.update()
STAR = False
if POSE == 'feliz':
    aim('Brazo.L', (-0.62, -0.25, -0.40)); aim('Brazo.R', (0.62, -0.15, -0.40))
elif POSE == 'celebrando':
    aim('Brazo.L', (-0.55, -0.15, 0.85)); aim('Brazo.R', (0.55, -0.15, 0.85))
    aim('Pierna.L', (-0.05, 0.35, -1)); aim('Pierna.R', (0.05, 0.35, -1))
    rig.location.z = 0.40; STAR = True
elif POSE == 'pensando':
    aim('Brazo.R', (0.25, -0.35, 0.75))
elif POSE == 'triste':
    aim('Brazo.L', (-0.12, 0.05, -1)); aim('Brazo.R', (0.12, 0.05, -1))
    pb['Cuerpo'].rotation_mode = 'XYZ'; pb['Cuerpo'].rotation_euler = (math.radians(7), 0, 0)
elif POSE == 'cruzada':
    # los brazos pasan por delante de la barriga, uno sobre el otro
    place('Brazo.L', (-0.50, -1.08, -0.60), (1.0, -0.20, 0.30))
    place('Brazo.R', (0.50, -1.16, -0.42), (-1.0, -0.22, 0.10))
elif POSE == 'molesta':
    # en jarra: brazos abiertos hacia atrás, el cuerpo un poco hacia adelante
    aim('Brazo.L', (-0.62, 0.38, -0.55)); aim('Brazo.R', (0.62, 0.42, -0.55))
    pb['Cuerpo'].rotation_mode = 'XYZ'; pb['Cuerpo'].rotation_euler = (math.radians(5), 0, 0)
elif POSE == 'sorprendida':
    aim('Brazo.L', (-0.85, -0.25, 0.30)); aim('Brazo.R', (0.85, -0.15, 0.30))
elif POSE in ('sentada', 'trabajando'):
    rig.location.z = -0.42
    place('Pierna.L', (-0.30, -0.35, -0.86), (-0.22, -1, -0.05)); place('Pierna.R', (0.30, -0.35, -0.86), (0.22, -1, -0.05))
    if POSE == 'sentada':
        aim('Brazo.L', (-0.45, -0.35, -0.55)); aim('Brazo.R', (0.45, -0.30, -0.55))
    else:
        aim('Brazo.L', (0.30, -0.80, -0.22)); aim('Brazo.R', (-0.12, -0.86, -0.22))
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
if STAR:
    bm = bmesh.new(); ring = []
    for i in range(8):
        a = math.radians(90 + i * 45); r = 0.30 if i % 2 == 0 else 0.085
        ring.append(bm.verts.new((r * math.cos(a), 0, r * math.sin(a))))
    fv = bm.verts.new((0, -0.07, 0)); bv = bm.verts.new((0, 0.07, 0))
    for i in range(8):
        bm.faces.new((ring[i], ring[(i + 1) % 8], fv)); bm.faces.new((ring[(i + 1) % 8], ring[i], bv))
    me_ = bpy.data.meshes.new('chispa'); bm.to_mesh(me_)
    st = bpy.data.objects.new('Chispa', me_); sc.collection.objects.link(st); add(st, GOLD)
    st.modifiers.new('b', 'BEVEL').width = 0.03
    for p in me_.polygons: p.use_smooth = True
    st.location = (0.75, -0.1, 2.25); st.scale = (1.3, 1.3, 1.3)

# --- cámara y foto ---
cam = sc.camera; a_ = math.radians(30); dist = 10.5
cam.location = (dist * math.sin(a_), -dist * math.cos(a_), 0.6); cam.data.lens = 62
cam.rotation_euler = (Vector((0, 0, 0.35)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
sc.render.resolution_x = 600; sc.render.resolution_y = 750; sc.cycles.samples = 24
sc.render.film_transparent = True
sc.render.filepath = f'{OUT}/{POSE}.png'; bpy.ops.render.render(write_still=True)
