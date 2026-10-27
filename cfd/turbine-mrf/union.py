import trimesh, glob, sys, numpy as np
src, out = sys.argv[1], sys.argv[2]
parts=[trimesh.load(f) for f in sorted(glob.glob(f'{src}/body.stl'))+sorted(glob.glob(f'{src}/blade*.stl'))+sorted(glob.glob(f'{src}/cover*.stl'))]
for p in parts:
    if not p.is_watertight: print('not watertight', p)
    p.fix_normals()
u=trimesh.boolean.union(parts, engine='manifold')
print('union watertight', u.is_watertight, 'faces', len(u.faces), 'vol', round(u.volume,4), 'bodies', len(u.split(only_watertight=False)))
import os; os.makedirs(out, exist_ok=True)
u.export(f'{out}/turbine.stl')
