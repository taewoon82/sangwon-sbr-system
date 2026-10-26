import numpy as np, sys
exec(open('post.py').read().split("ts = sorted")[0])
U,_=rfield(sys.argv[3],"U",1)
x,y,z=C[:,0]-CX,C[:,1]-CY,C[:,2]; r=np.hypot(x,y)
ut=(x*U[:,1]-y*U[:,0])/np.maximum(r,1e-6); ur=(x*U[:,0]+y*U[:,1])/np.maximum(r,1e-6)
print('z \\ r      0-0.4         0.4-1.5        1.5-3.0        3.0-5.2   (ut / w, m/s)')
for z0,z1 in [(3.2,3.5),(2.6,3.1),(1.8,2.6),(1.2,1.8),(0.2,1.2)]:
    row=f'{z0:.1f}-{z1:.1f} '
    for r0,r1 in [(0,.4),(.4,1.5),(1.5,3),(3,5.2)]:
        k=(z>z0)&(z<z1)&(r>=r0)&(r<r1)
        row+=f'  {np.average(ut[k],weights=V[k]):+.2f}/{np.average(U[k,2],weights=V[k]):+.2f}   '
    print(row)
