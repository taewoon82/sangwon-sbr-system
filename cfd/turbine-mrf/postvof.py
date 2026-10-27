"""자유수면(VOF) 결과 토크·동력. 사용: python3 postvof.py CASE RPM [t1 t2 ...]
p는 절대압(Pa, interFoam). 벽전단은 셀 밀도(알파 가중)로 근사. 시간 미지정 시 전 시점."""
import numpy as np, re, sys, os
case, rpm = sys.argv[1], float(sys.argv[2])
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "post.py")).read().split("ts = sorted")[0]
exec(src.replace("case, rpm = sys.argv[1], float(sys.argv[2])", "pass"))
om = rpm * 2 * np.pi / 60
ts = sorted([d for d in os.listdir(case) if re.fullmatch(r"[\d.e+-]+", d) and d != "0"], key=float)
times = sys.argv[3:] or ts
for t in times:
    U, sU = rfield(t, "U", 1); p, sp = rfield(t, "p", 0); a, sa = rfield(t, "alpha.water", 0)
    nut, sn = rfield(t, "nut", 0)
    rho = 1000 * a + 1.2 * (1 - a); nu = 1e-6 * a + 1.48e-5 * (1 - a)
    Mz = 0.0; wet = 0.0; area = 0.0
    for name, (st, nF) in patches.items():
        if not name.startswith(("turbine", "blade", "cover", "body")): continue
        fs = np.arange(st, st + nF); cf, sf = Cf[fs], Sf[fs]; cc = own[fs]
        pb = patch_vals(sp, name, 0, nF)
        if pb is None: pb = p[cc]
        Fp = pb[:, None] * sf
        nrm = sf / np.linalg.norm(sf, axis=1)[:, None]
        Uw = patch_vals(sU, name, 1, nF); nw = patch_vals(sn, name, 0, nF)
        du = U[cc] - Uw; du -= (du * nrm).sum(1)[:, None] * nrm
        dd = np.abs(((C[cc] - cf) * nrm).sum(1)) + 1e-6
        A = np.linalg.norm(sf, axis=1)
        Ft = (rho[cc] * (nu[cc] + nw))[:, None] * du / dd[:, None] * A[:, None]
        F = Fp + Ft
        Mz += ((cf[:, 0] - CX) * F[:, 1] - (cf[:, 1] - CY) * F[:, 0]).sum()
        wet += (a[cc] * A).sum(); area += A.sum()
    # 수위(반응조 외곽 평균): 벽 근처 수직 기둥에서 알파 적분
    k = (np.hypot(C[:, 0] - CX, C[:, 1] - CY) > 3.5)
    lvl = (a[k] * V[k]).sum() / (np.pi * 0 + 1) / max(V[k].sum(), 1e-9) * 4.7
    print(f"t={float(t):6.2f}  Mz={Mz:8.1f} N·m  P={abs(Mz)*om/1000:6.2f} kW  날개 젖음={wet/area*100:5.1f}%  외곽 평균수위≈{lvl:.3f} m", flush=True)
