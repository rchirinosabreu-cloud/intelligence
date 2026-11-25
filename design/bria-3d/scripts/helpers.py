def drop(prefix):
    for o in [o for o in sc.objects if o.name.startswith(prefix)]: bpy.data.objects.remove(o, do_unlink=True)
def face_line(name, pts, r, mat, out=0.012):
    return tube(name, [(onsurf(x, z, out)[0], r * (0.6 + 0.4 * math.sin(math.pi * i / (len(pts) - 1)))) for i, (x, z) in enumerate(pts)], mat, 6)
def arc(x0, x1, z0, h, n=12):
    return [(x0 + (x1 - x0) * i / (n - 1), z0 + h * math.sin(math.pi * i / (n - 1))) for i in range(n)]


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
