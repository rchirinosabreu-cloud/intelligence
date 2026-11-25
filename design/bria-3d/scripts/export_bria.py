import os
BRIA_DIR = os.environ.get('BRIA_DIR') or os.path.dirname(os.path.abspath(__file__))
import os, sys, bpy
os.environ['BRIA_RENDER'] = '0'; os.environ['BRIA_SEPARATE_ARMS'] = '1'
OUT = os.environ.get('BRIA_OUT', '.'); sys.argv = ['x', OUT]
exec(open(os.path.join(BRIA_DIR, 'build.py')).read())
exec(open(os.path.join(BRIA_DIR, 'rig.py')).read())
import math
from mathutils import Vector
sc = bpy.context.scene; sc.frame_set(1)
# El mismo encuadre de las animaciones: tres cuartos, a 11 m, lente de 72 mm.
cam = sc.camera; a_ = math.radians(30); dist = 11.0
cam.location = (dist * math.sin(a_), -dist * math.cos(a_), 0.7); cam.data.lens = 72
cam.rotation_euler = (Vector((0, 0, 0.30)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
sc.render.resolution_x = 720; sc.render.resolution_y = 900; sc.render.resolution_percentage = 100
sc.render.film_transparent = True
bpy.ops.wm.save_as_mainfile(filepath=OUT + '/bria.blend', compress=True)
print('OBJ', sorted(o.name for o in bpy.data.objects))
print('BONES', [b.name for a in bpy.data.armatures for b in a.bones])
