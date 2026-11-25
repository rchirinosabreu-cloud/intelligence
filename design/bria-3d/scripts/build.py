import bpy, bmesh, math, sys
from mathutils import Vector
OUT = sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

def hexc(h, a=1):
    h = h.lstrip('#'); c = [int(h[i:i+2], 16)/255 for i in (0, 2, 4)]
    return [((x/12.92) if x <= 0.04045 else ((x+0.055)/1.055)**2.4) for x in c] + [a]

def clay(name, colors, rough=0.72, sss=0.2, axis='Z', lo=-1.0, hi=1.6):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = rough
    b.inputs['Subsurface Weight'].default_value = sss
    b.inputs['Subsurface Radius'].default_value = (0.4, 0.6, 0.5)
    b.inputs['Coat Weight'].default_value = 0.0
    if len(colors) == 1:
        b.inputs['Base Color'].default_value = hexc(colors[0]); return m
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = lo; mr.inputs['From Max'].default_value = hi
    ramp = nt.nodes.new('ShaderNodeValToRGB'); el = ramp.color_ramp.elements
    el[0].color = hexc(colors[0]); el[1].color = hexc(colors[-1])
    for i, c in enumerate(colors[1:-1], 1):
        e = el.new(i/(len(colors)-1)); e.color = hexc(c)
    nt.links.new(tc.outputs['Object'], sep.inputs[0]); nt.links.new(sep.outputs[axis], mr.inputs['Value'])
    nt.links.new(mr.outputs['Result'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    return m

BODY = clay('body', ['#139EB2', '#22B5AE', '#3CC3A0'], lo=-1.0, hi=1.6)
CURL = clay('curl', ['#22B9AC', '#5FD48C', '#8BE07C'], lo=-0.2, hi=1.3)
LIMB = clay('limb', ['#0E9FB0', '#18AFB8'], lo=-2.2, hi=-0.6)
INK = clay('ink', ['#0C1A2A'], rough=0.15, sss=0)
import os
def recolor(mat, stops, direction, lo, hi):
    """Degradado del cuerpo a lo largo de una dirección (x, y, z), con sus paradas de color."""
    nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord'); dot = nt.nodes.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'
    dot.inputs[1].default_value = Vector(direction).normalized()
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = lo; mr.inputs['From Max'].default_value = hi
    ramp = nt.nodes.new('ShaderNodeValToRGB'); el = ramp.color_ramp.elements
    el[0].position, el[0].color = stops[0][0], hexc(stops[0][1]); el[1].position, el[1].color = stops[-1][0], hexc(stops[-1][1])
    for p, c in stops[1:-1]:
        e = el.new(p); e.color = hexc(c)
    nt.links.new(tc.outputs['Object'], dot.inputs[0]); nt.links.new(dot.outputs['Value'], mr.inputs['Value']); nt.links.new(mr.outputs['Result'], ramp.inputs['Fac'])
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 3.0
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'OVERLAY'; mix.inputs['Factor'].default_value = 0.10
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector']); nt.links.new(ramp.outputs['Color'], mix.inputs['A']); nt.links.new(nz.outputs['Fac'], mix.inputs['B'])
    nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
PALETTE = os.environ.get('BRIA_COLOR', 'A')   # Rodny eligió la A el 18 de noviembre de 2026
if PALETTE == 'A':   # como el manual: menta arriba a la izquierda, turquesa al centro, cian abajo a la derecha
    recolor(BODY, [(0.0, '#0F9DB4'), (0.45, '#26B8AE'), (0.80, '#4FCB9E'), (1.0, '#6ED49A')], (-0.55, 0, 1), -1.3, 1.3)
elif PALETTE == 'B': # vertical con más profundidad: menta arriba, turquesa, azul petróleo en los pies
    recolor(BODY, [(0.0, '#0B7E99'), (0.30, '#139FB3'), (0.62, '#25B9AD'), (1.0, '#5ED19B')], (0, 0, 1), -1.4, 1.4)
BROW = clay('brow', ['#102638'], rough=0.75, sss=0)
WHITE = clay('white', ['#FFFFFF'], rough=0.2, sss=0)
GOLD = clay('gold', ['#F2A900'], rough=0.35, sss=0.05)

def smooth(o, lvl=2):
    for p in o.data.polygons: p.use_smooth = True
    mod = o.modifiers.new('sub', 'SUBSURF'); mod.levels = lvl; mod.render_levels = lvl

def add(o, mat):
    o.data.materials.append(mat); return o

import numpy as np
from mathutils.bvhtree import BVHTree
# Cuerpo: una sola curva de gota, sin quiebres (rho = sin θ · sin(θ/2)^m), la punta inclinada a la derecha
bpy.ops.mesh.primitive_uv_sphere_add(segments=256, ring_count=192, radius=1)
body = bpy.context.object; body.name = 'Cuerpo'
# gota convexa de una sola curva; la punta se redondea suavizando el perfil
M = 0.9
NT = 3000
ts = np.linspace(0, math.pi, NT)
rho = np.sin(ts) * np.sin(ts / 2) ** M
rho = rho / rho.max()
zz = 1.12 * np.cos(ts) + 0.12
# perfil espejado alrededor del eje para que el suavizado redondee la punta
prof = np.stack([np.concatenate([-rho[:0:-1], rho]), np.concatenate([zz[:0:-1], zz])], 1)
seg = np.linalg.norm(np.diff(prof, axis=0), axis=1); s_ = np.concatenate([[0], np.cumsum(seg)])
SIG = 0.27
sm_ = np.empty_like(prof)
for i in range(len(prof)):
    wts = np.exp(-0.5 * ((s_ - s_[i]) / SIG) ** 2); wts /= wts.sum()
    sm_[i] = (prof * wts[:, None]).sum(0)
sm_ = sm_[NT - 1:]
sm_[:, 0] = np.abs(sm_[:, 0])
# la base no se suaviza (ya es redonda); mezcla según altura
mix = np.clip((ts - 0.9) / 0.6, 0, 1)[:, None]
fin = sm_ * (1 - mix) + np.stack([rho, zz], 1) * mix
for v in body.data.vertices:
    x, y, z = v.co
    t = math.acos(max(-1.0, min(1.0, z)))
    k = min(NT - 1, int(round(t / math.pi * (NT - 1))))
    r_, nz = fin[k]
    hx = math.hypot(x, y)
    ux, uy = (x / hx, y / hx) if hx > 1e-9 else (0.0, 0.0)
    lean = 0.24 * max(0.0, (nz - 0.25) / 0.99) ** 2.5
    v.co = (ux * r_ + lean, uy * r_ * 0.96, nz)
add(body, BODY)
body.data.update()

def make_tree(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    return BVHTree.FromObject(obj, dg)
TREE = make_tree(body)
def onsurf(x, z, out=0.0):
    hit, n, _, _ = TREE.ray_cast(Vector((x, -5, z)), Vector((0, 1, 0)))
    if hit is None: return Vector((x, 0, z)), Vector((0, -1, 0))
    return hit + n * out, n
def tube(name, pts, mat, res=8):
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'
    sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for p, (co, r) in zip(sp.points, pts): p.co = (*co, 1); p.radius = r
    cu.bevel_depth = 1.0; cu.bevel_resolution = res; cu.use_fill_caps = True
    o = bpy.data.objects.new(name, cu); sc.collection.objects.link(o); return add(o, mat)

# Rizo esculpido en el cuerpo: la superficie misma se levanta a lo largo de la ola, sin pieza pegada
path = []
for i in range(16):
    t = i / 15
    path.append((-0.62 + 0.38*t, 0.50 + 0.53*t**0.8))   # la ola nace arriba de la mejilla: sin protuberancia en la cara
cx, cz = -0.22, 0.76
r0 = math.hypot(path[-1][0]-cx, path[-1][1]-cz); a0 = math.atan2(path[-1][1]-cz, path[-1][0]-cx)
for i in range(1, 40):
    t = i / 39; ang = a0 - t * math.radians(320); r = r0 * (1 - 0.60*t)
    path.append((cx + r*math.cos(ang), cz + r*math.sin(ang)))
P, H, W = [], [], []
L = len(path)
for i, (x, z) in enumerate(path):
    t = i / (L - 1)
    co, _ = onsurf(x, z, 0.0)
    P.append(tuple(co))
    H.append(0.03 + 0.10 * min(1.0, t / 0.45) ** 0.8 * (1 - 0.55 * max(0.0, (t - 0.55) / 0.45)))
    W.append(0.085 + 0.08 * min(1.0, t / 0.45) * (1 - 0.45 * max(0.0, (t - 0.55) / 0.45)))
# Brazos, piernas y pies: nacen dentro del cuerpo y se funden con él
def limb(name, a, b, r1, r2, mat, n=16, grow=1.0):
    """Una sola forma: esferas encadenadas que el remallado vuelve un tubo liso con la punta redonda."""
    a, b = Vector(a), Vector(b); parts = []
    for i in range(n):
        t = i / (n - 1)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=r1 + (r2 - r1) * t ** grow, location=a.lerp(b, t))
        parts.append(add(bpy.context.object, mat))
    return parts
def capsule(name, a, b, r, mat, r2=None):
    """Cápsula de verdad (cilindro con dos semiesferas), no un elipsoide que se adelgaza en las puntas."""
    r2 = r if r2 is None else r2
    a, b = Vector(a), Vector(b); d = b - a
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=40, radius1=r, radius2=r2, depth=d.length)
    me_ = bpy.data.meshes.new(name); bm.to_mesh(me_); bm.free()
    o = bpy.data.objects.new(name, me_); sc.collection.objects.link(o)
    o.location = (a + b) / 2
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = Vector((0, 0, -1)).rotation_difference(d.normalized())
    add(o, mat)
    parts = [o]
    for p, rr in ((a, r), (b, r2)):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=20, radius=rr, location=p)
        parts.append(add(bpy.context.object, mat))
    return parts
def ball(name, loc, scale, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1, location=loc, rotation=rot)
    o = bpy.context.object; o.name = name; o.scale = scale; return add(o, mat)
ARM_PARTS = {'BrazoIzq': limb('BrazoIzq', (-0.70, -0.24, -0.22), (-0.98, -0.40, -0.74), 0.085, 0.175, BODY, grow=0.75),
             'BrazoDer': limb('BrazoDer', (0.72, -0.16, -0.22), (1.02, -0.22, -0.72), 0.085, 0.175, BODY, grow=0.75)}
# Con esqueleto (BRIA_SEPARATE_ARMS=1) los brazos son piezas propias que giran desde el hombro, metidas en el cuerpo;
# en la foto quieta se funden con el cuerpo.
SEPARATE_ARMS = os.environ.get('BRIA_SEPARATE_ARMS') == '1'
limbs = [] if SEPARATE_ARMS else ARM_PARTS['BrazoIzq'] + ARM_PARTS['BrazoDer']
LEG_PARTS = {}
for sg in (-1, 1):
    parts = capsule(f'Pierna{sg}', (0.27*sg, 0.0, -0.66), (0.28*sg, -0.02, -1.25), 0.19, BODY, 0.18)
    foot = ball(f'Pie{sg}', (0.31*sg, -0.13, -1.34), (0.26, 0.33, 0.16), BODY)
    # base plana: aplastar lo que queda por debajo del suelo
    for vv in foot.data.vertices:
        if vv.co.z < -0.35: vv.co.z = -0.35 + (vv.co.z + 0.35) * 0.25
    parts.append(foot)
    # con esqueleto las piernas también son piezas propias: así la barriga no se estira al saltar o sentarse
    if SEPARATE_ARMS: LEG_PARTS['PiernaIzq' if sg < 0 else 'PiernaDer'] = parts
    else: limbs += parts

bpy.ops.object.select_all(action='DESELECT')
for o in [body] + limbs: o.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
rm = body.modifiers.new('rm', 'REMESH'); rm.mode = 'VOXEL'; rm.voxel_size = 0.011
bpy.ops.object.modifier_apply(modifier='rm')
# un filete suave en las uniones (brazos, piernas, pies) sin borrar el rizo
sm = body.modifiers.new('sm', 'SMOOTH'); sm.factor = 0.8; sm.iterations = 14
bpy.ops.object.modifier_apply(modifier='sm')
bpy.ops.object.shade_smooth()
body.data.materials.clear(); body.data.materials.append(BODY)
ARMS = {}
if SEPARATE_ARMS:
    for nm, parts in list(ARM_PARTS.items()) + list(LEG_PARTS.items()):
        bpy.ops.object.select_all(action='DESELECT')
        for o in parts: o.select_set(True)
        bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join()
        armo = bpy.context.object; armo.name = nm
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        r_ = armo.modifiers.new('rm', 'REMESH'); r_.mode = 'VOXEL'; r_.voxel_size = 0.011
        bpy.ops.object.modifier_apply(modifier='rm')
        s_ = armo.modifiers.new('sm', 'SMOOTH'); s_.factor = 0.8; s_.iterations = 10
        bpy.ops.object.modifier_apply(modifier='sm')
        bpy.ops.object.shade_smooth(); armo.data.materials.clear(); armo.data.materials.append(BODY)
        ARMS[nm] = armo
    bpy.context.view_layer.objects.active = body
P, H, W = np.array(P), np.array(H), np.array(W)
me = body.data
V = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', V); V = V.reshape(-1, 3)
Nn = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('normal', Nn); Nn = Nn.reshape(-1, 3)
A, B = P[:-1], P[1:]; AB = B - A; ab2 = (AB ** 2).sum(1) + 1e-12
best = np.zeros(len(V)); paint = np.zeros(len(V))
for k in range(len(A)):
    ap = V - A[k]; u = np.clip((ap @ AB[k]) / ab2[k], 0, 1)
    d = np.linalg.norm(ap - np.outer(u, AB[k]), axis=1)
    h = H[k] + (H[k+1] - H[k]) * u; w = W[k] + (W[k+1] - W[k]) * u
    q = np.clip(d / w, 0, 1)
    prof = h * (1 - q * q) ** 1.0
    best = np.maximum(best, prof)
    paint = np.maximum(paint, 0.7 * (1 - np.clip(d / (w * 1.7), 0, 1)) ** 1.4 * min(1.0, (k / len(A)) / 0.25))
V = V + Nn * best[:, None]
me.vertices.foreach_set('co', V.ravel()); me.update()
attr = me.color_attributes.new('rizo', 'FLOAT_COLOR', 'POINT')
cols = np.repeat(paint[:, None], 4, axis=1); cols[:, 3] = 1
attr.data.foreach_set('color', cols.ravel())
nt = BODY.node_tree; bsdf = nt.nodes['Principled BSDF']
src = bsdf.inputs['Base Color'].links[0].from_socket
at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = 'rizo'
mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.inputs['B'].default_value = hexc('#6BC981')
nt.links.new(at.outputs['Fac'], mx.inputs['Factor']); nt.links.new(src, mx.inputs['A']); nt.links.new(mx.outputs['Result'], bsdf.inputs['Base Color'])

TREE = make_tree(body)

# Ojos, brillos y cejas pegados a la cara
for sg in (-1, 1):
    ex = 0.34 * sg + 0.03
    co, n = onsurf(ex, 0.0, -0.02)
    ball(f'Ojo{sg}', co, (0.16, 0.09, 0.21), INK)
    hc, _ = onsurf(ex + 0.05, 0.08, 0.06)
    ball(f'Brillo{sg}', hc, (0.05, 0.025, 0.055), WHITE)
    br = []
    for i in range(9):
        t = i / 8; x = ex - 0.13 + 0.26*t; z = 0.32 + 0.05*math.sin(math.pi*t) + (0.02*sg*(t-0.5))
        co, _ = onsurf(x, z, 0.015); br.append((co, 0.05 * (0.55 + 0.45*math.sin(math.pi*t))))
    tube(f'Ceja{sg}', br, BROW, 6)
bpy.ops.mesh.primitive_cylinder_add(radius=0.018, depth=0.12, location=tuple(onsurf(0.04, -0.17, 0.0)[0]), rotation=(0, math.radians(90), 0))
add(bpy.context.object, INK)

WITH_STAR = False
if WITH_STAR:
    # Chispa: estrella de cuatro puntas
    bm = bmesh.new(); outer, inner = 0.30, 0.085; ring = []
    for i in range(8):
        a = math.radians(90 + i * 45); r = outer if i % 2 == 0 else inner
        ring.append(bm.verts.new((r * math.cos(a), 0, r * math.sin(a))))
    front = bm.verts.new((0, -0.07, 0)); back = bm.verts.new((0, 0.07, 0))
    for i in range(8):
        bm.faces.new((ring[i], ring[(i+1) % 8], front)); bm.faces.new((ring[(i+1) % 8], ring[i], back))
    me = bpy.data.meshes.new('chispa'); bm.to_mesh(me)
    star = bpy.data.objects.new('Chispa', me); sc.collection.objects.link(star); add(star, GOLD)
    bev = star.modifiers.new('bev', 'BEVEL'); bev.width = 0.03; bev.segments = 4
    for p in me.polygons: p.use_smooth = True
    star.scale = (1.35, 1.35, 1.35); star.location = (0.62, -0.1, 1.95); star.rotation_euler = (0, math.radians(-12), 0)

# Luces, cámara y render
world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (0.9, 0.95, 1, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = 0.35
def light(loc, energy, size, color=(1, 1, 1)):
    l = bpy.data.lights.new('l', 'AREA'); l.energy = energy; l.size = size; l.color = color
    o = bpy.data.objects.new('l', l); sc.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector((0, 0, 0.3)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
light((-3, -4, 3.5), 900, 3); light((4, -3, 1), 300, 4, (0.9, 1, 1)); light((0, 4, 3), 600, 2, (0.9, 1, 0.9))
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 70
sc.render.engine = 'CYCLES'; sc.cycles.samples = 48; sc.cycles.device = 'CPU'; sc.cycles.use_denoising = True
sc.render.film_transparent = True; sc.render.resolution_x = 640; sc.render.resolution_y = 800
sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'Medium Low Contrast'; sc.view_settings.exposure = -0.15
for name, ang in ((('frente', 0), ('tres-cuartos', 35), ('lado', 90)) if os.environ.get('BRIA_RENDER', '1') != '0' else ()):
    a = math.radians(ang); d = 9
    cam.location = (d * math.sin(a), -d * math.cos(a), 0.7)
    cam.rotation_euler = (Vector((0, 0, 0.35)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f'{OUT}/{name}.png'; bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=f'{OUT}/bria.blend')
