# Esqueleto de Bria: se ejecuta después de build.py (mismo espacio de nombres).
import numpy as np
from mathutils import Vector, Euler
body = bpy.data.objects['Cuerpo']
ARM_OBJS = {'Brazo.L': bpy.data.objects.get('BrazoIzq'), 'Brazo.R': bpy.data.objects.get('BrazoDer'),
            'Pierna.L': bpy.data.objects.get('PiernaIzq'), 'Pierna.R': bpy.data.objects.get('PiernaDer')}
face = [o for o in sc.objects if o.type in ('MESH', 'CURVE') and o is not body and o not in ARM_OBJS.values()]

# --- esqueleto ---
arm = bpy.data.armatures.new('BriaRig'); rig = bpy.data.objects.new('BriaRig', arm); sc.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='EDIT')
eb = arm.edit_bones
def bone(name, head, tail, parent=None):
    b = eb.new(name); b.head = head; b.tail = tail
    if parent: b.parent = eb[parent]
    return b
bone('Raiz', (0, 0, -1.45), (0, 0.3, -1.45))
bone('Cuerpo', (0, 0, -0.80), (0, 0, 0.10), 'Raiz')
bone('Cabeza', (0, 0, 0.10), (0, 0, 1.30), 'Cuerpo')
SH = {'L': Vector((-0.70, -0.24, -0.22)), 'R': Vector((0.72, -0.16, -0.22))}
HA = {'L': Vector((-0.98, -0.40, -0.74)), 'R': Vector((1.02, -0.22, -0.72))}
for k in 'LR':
    bone(f'Brazo.{k}', SH[k], HA[k], 'Cuerpo')
    sx = -1 if k == 'L' else 1
    bone(f'Pierna.{k}', (0.27 * sx, 0, -0.80), (0.29 * sx, -0.02, -1.42), 'Raiz')
bpy.ops.object.mode_set(mode='OBJECT')

# --- pesos: por regiones, suaves, calculados a mano (la malla es densa y el calor automático no es fiable) ---
me = body.data
V = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', V); V = V.reshape(-1, 3)
x, y, z = V[:, 0], V[:, 1], V[:, 2]
def smooth(a, b, t): t = np.clip((t - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
W = {}
# brazos: lo que está cerca del segmento del brazo y fuera del cuerpo
for k in 'LR':
    a, b = np.array(SH[k]), np.array(HA[k]); ab = b - a
    u = np.clip(((V - a) @ ab) / (ab @ ab), 0, 1)
    d = np.linalg.norm(V - (a + np.outer(u, ab)), axis=1)
    W[f'Brazo.{k}'] = (smooth(-0.05, 0.30, u + 0.0) * (d < 0.30)) if ARM_OBJS['Brazo.' + k] is None else np.zeros(len(V))
# piernas: debajo del cuerpo
W['Pierna.L'] = smooth(-0.78, -0.95, z) * (x < 0) if ARM_OBJS['Pierna.L'] is None else np.zeros(len(V))
W['Pierna.R'] = smooth(-0.78, -0.95, z) * (x >= 0) if ARM_OBJS['Pierna.R'] is None else np.zeros(len(V))
W['Cabeza'] = smooth(-0.15, 0.55, z)
rest = np.clip(1 - W['Brazo.L'] - W['Brazo.R'] - W['Pierna.L'] - W['Pierna.R'], 0, 1)
W['Cabeza'] = W['Cabeza'] * rest
W['Cuerpo'] = np.clip(rest - W['Cabeza'], 0, 1)
for name, w in W.items():
    g = body.vertex_groups.new(name=name)
    for i in np.nonzero(w > 0.001)[0]: g.add([int(i)], float(w[i]), 'REPLACE')
body.parent = rig; mod = body.modifiers.new('rig', 'ARMATURE'); mod.object = rig
# los brazos sueltos giran con su hueso
for bn, o in ARM_OBJS.items():
    if o is None: continue
    mw = o.matrix_world.copy(); o.parent = rig; o.parent_type = 'BONE'; o.parent_bone = bn; o.matrix_world = mw
# la cara viaja con la cabeza
for o in face:
    mw = o.matrix_world.copy(); o.parent = rig; o.parent_type = 'BONE'; o.parent_bone = 'Cabeza'; o.matrix_world = mw

