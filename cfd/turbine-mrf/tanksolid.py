"""헌치(45°, 0.6 m) 4면 + 십자구조물을 하나의 솔리드로 병합. 사용: python3 tanksolid.py OUT.stl [W] [CROSS_L] [CROSS_T] [CROSS_H]"""
import sys, numpy as np, trimesh
out = sys.argv[1]; W = float(sys.argv[2]) if len(sys.argv) > 2 else 10.5
L = float(sys.argv[3]) if len(sys.argv) > 3 else 2.5; T = float(sys.argv[4]) if len(sys.argv) > 4 else 0.2
H = float(sys.argv[5]) if len(sys.argv) > 5 else 1.2
V, e = 0.6, 0.05; c = W / 2
def prism(poly2d, axis, a0, a1):
    p = np.array(poly2d)
    m = trimesh.creation.extrude_polygon(__import__('shapely.geometry', fromlist=['Polygon']).Polygon(p), a1 - a0)
    m.apply_translation([0, 0, a0])
    if axis == 'x':   # 단면 (y,z) → x 방향 압출
        R = np.array([[0, 0, 1, 0], [1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 0, 1]])
    else:             # 단면 (x,z) → y 방향 압출
        R = np.array([[1, 0, 0, 0], [0, 0, 1, 0], [0, 1, 0, 0], [0, 0, 0, 1]])
    m.apply_transform(R); m.fix_normals(); return m
parts = []
for ax in ('x', 'y'):
    parts.append(prism([(-e, -e), (V, -e), (-e, V)], ax, -e, W + e))
    parts.append(prism([(W + e, -e), (W - V, -e), (W + e, V)], ax, -e, W + e))
plus = [(T/2, T/2), (L/2, T/2), (L/2, -T/2), (T/2, -T/2), (T/2, -L/2), (-T/2, -L/2), (-T/2, -T/2), (-L/2, -T/2), (-L/2, T/2), (-T/2, T/2), (-T/2, L/2), (T/2, L/2)]
from shapely.geometry import Polygon
cr = trimesh.creation.extrude_polygon(Polygon([(c + x, c + y) for x, y in plus]), H + e); cr.apply_translation([0, 0, -e]); cr.fix_normals()
parts.append(cr)
u = trimesh.boolean.union(parts, engine='manifold')
txt = trimesh.exchange.stl.export_stl_ascii(u).split('\n'); txt[0] = 'solid tank'
i = max(k for k, l in enumerate(txt) if l.startswith('endsolid')); txt[i] = 'endsolid tank'
open(out, 'w').write('\n'.join(txt))
m = trimesh.load(out); print('watertight', m.is_watertight, 'bodies', len(m.split()), 'vol', round(m.volume, 3),
      'expected haunch', round(4 * 0.5 * V * V * W, 2), 'cross', round((2 * L * T - T * T) * H, 3))
