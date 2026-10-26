import numpy as np, re, sys
exec(open('post.py').read().split("ts = sorted")[0].replace("case, rpm = sys.argv[1], float(sys.argv[2])","case, rpm = sys.argv[1], float(sys.argv[2])"))
t=sys.argv[3]
U,_=rfield(t,"U",1)
x,y,z=C[:,0]-CX,C[:,1]-CY,C[:,2]; r=np.hypot(x,y)
ut=(x*U[:,1]-y*U[:,0])/np.maximum(r,1e-6)
for zc,lab in [(ZB-0.06,'흡입 아래'),(ZB+0.10,'벨 내부 0.10'),(ZB+0.20,'벨 내부 0.20')]:
    rb = R0+(R1-R0)*(1-np.cos(np.arcsin(min((zc-ZB)/G,1)))) if zc>ZB else R0
    k=(abs(z-zc)<0.03)&(r<rb-0.02)
    print(lab,'Q net',round((U[k,2]*V[k]).sum()/0.06*3600),'Q up',round((np.maximum(U[k,2],0)*V[k]).sum()/0.06*3600),'Q down',round((np.minimum(U[k,2],0)*V[k]).sum()/0.06*3600))
    for r0,r1 in [(0,.1),(.1,.2),(.2,.3),(.3,.42)]:
        kk=k&(r>=r0)&(r<r1)
        if kk.sum(): print(f'   r {r0}-{r1}: w={np.average(U[kk,2],weights=V[kk]):+.3f} ut={np.average(ut[kk],weights=V[kk]):+.3f}')
