import numpy as np, sys
out=sys.argv[1]; CX=CY=5.25; L=1.25; Wd=0.1; z0,z1=-0.05,1.2
P=[(Wd,Wd),(L,Wd),(L,-Wd),(Wd,-Wd),(Wd,-L),(-Wd,-L),(-Wd,-Wd),(-L,-Wd),(-L,Wd),(-Wd,Wd),(-Wd,L),(Wd,L)]
P=[(CX+x,CY+y) for x,y in P][::-1]   # 반시계
n=len(P); T=[]
c=(CX,CY)
for i in range(n):
    a,b=P[i],P[(i+1)%n]
    A0,B0,A1,B1=[np.array([*a,z0]),np.array([*b,z0]),np.array([*a,z1]),np.array([*b,z1])]
    T+=[(A0,B0,B1),(A0,B1,A1)]
    T+=[(np.array([*c,z1]),A1,B1),(np.array([*c,z0]),B0,A0)]
with open(out,'w') as f:
    f.write('solid cross\n')
    for a,b,cc in T:
        nn=np.cross(b-a,cc-a); nn=nn/np.linalg.norm(nn)
        f.write(f' facet normal {nn[0]} {nn[1]} {nn[2]}\n  outer loop\n'+''.join(f'   vertex {p[0]} {p[1]} {p[2]}\n' for p in (a,b,cc))+'  endloop\n endfacet\n')
    f.write('endsolid cross\n')
import trimesh; m=trimesh.load(out); print('watertight',m.is_watertight,'vol',round(m.volume,3),'expected',round((2*2.5*0.2-0.04)*1.25,3))
