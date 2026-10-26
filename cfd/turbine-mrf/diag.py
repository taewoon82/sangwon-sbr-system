import numpy as np, sys, re
exec(open('post.py').read().split("ts = sorted")[0])
t=sys.argv[3]; om=rpm*2*np.pi/60
U,sU=rfield(t,"U",1); p,sp=rfield(t,"p",0)
x,y,z=C[:,0]-CX,C[:,1]-CY,C[:,2]; r=np.hypot(x,y)
ut=(x*U[:,1]-y*U[:,0])/np.maximum(r,1e-6); ur=(x*U[:,0]+y*U[:,1])/np.maximum(r,1e-6)
# 1) 각운동량 수지: 원통 r=0.70~0.74, z 3.0~3.5 측면 + 바닥 원판 z=2.97~3.03
dr=0.04; ks=(r>0.70)&(r<0.74)&(z>3.0)&(z<3.5)
Ts=RHO*(V[ks]*r[ks]*ut[ks]*ur[ks]).sum()/dr
dz=0.06; kb=(z>2.97)&(z<3.03)&(r<0.72)
Tb=-RHO*(V[kb]*r[kb]*ut[kb]*U[kb,2]).sum()/dz
print(f"각운동량 수지 토크 {Ts+Tb:.0f} N·m (측면 {Ts:.0f}, 바닥 {Tb:.0f}) -> {(Ts+Tb)*om/1000:.1f} kW")
# 2) 덮개(수면) 압력: 반경별, 수두 환산
st,nF=patches['surface']; fs=np.arange(st,st+nF); cf=Cf[fs]
rf=np.hypot(cf[:,0]-CX,cf[:,1]-CY); pf=p[own[fs]]
far=pf[rf>3].mean()
for r0,r1 in [(0,.2),(.2,.4),(.4,.55),(.55,.68),(.68,.8),(.8,1.2),(1.2,2)]:
    k=(rf>=r0)&(rf<r1); print(f"  수면 r {r0}-{r1}: 압력 {RHO*(pf[k].mean()-far)/1000:+.2f} kPa = 수두 {(pf[k].mean()-far)/9.81:+.2f} m")
