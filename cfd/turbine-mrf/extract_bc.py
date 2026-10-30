"""VOF 결과에서 터빈 흡입·토출 분포 추출. 사용: python3 extract_bc.py CASE RPM OUT.json t1 t2 ..."""
import numpy as np, re, sys, json
case, rpm, out, times = sys.argv[1], float(sys.argv[2]), sys.argv[3], sys.argv[4:]
src = open('/home/claude/turb/post.py').read().split("ts = sorted")[0]
exec(src.replace("case, rpm = sys.argv[1], float(sys.argv[2])", "pass"))
RS0, RS1 = 0.73, 0.79                     # 토출 측정 원통 셸
zb = np.arange(ZB - 0.10, ZS + 0.30, 0.02) # 높이 구간
rb = np.linspace(0, R0, 8)
acc = None
for t in times:
    U, _ = rfield(t, 'U', 1); a, _ = rfield(t, 'alpha.water', 0)
    k, _ = rfield(t, 'k', 0); om_, _ = rfield(t, 'omega', 0)
    x, y, z = C[:, 0] - CX, C[:, 1] - CY, C[:, 2]; r = np.hypot(x, y)
    ur = (x * U[:, 0] + y * U[:, 1]) / np.maximum(r, 1e-6); ut = (x * U[:, 1] - y * U[:, 0]) / np.maximum(r, 1e-6)
    sh = (r > RS0) & (r < RS1)
    prof = []
    for z0, z1 in zip(zb[:-1], zb[1:]):
        m = sh & (z >= z0) & (z < z1)
        if m.sum() == 0: prof.append([0.5 * (z0 + z1), 0, 0, 0, 0, 0, 0]); continue
        w = V[m]
        af = np.average(a[m], weights=w)               # 물 비율
        wa = w * a[m] + 1e-12                          # 물 가중
        prof.append([0.5 * (z0 + z1), af, np.average(ur[m], weights=wa), np.average(ut[m], weights=wa),
                     np.average(U[m, 2], weights=wa), np.average(k[m], weights=wa), np.average(om_[m], weights=wa)])
    # 흡입면: 벨 하단 아래 0.03~0.09 m
    mi = (z > ZB - 0.09) & (z < ZB - 0.03)
    inl = []
    for r0, r1 in zip(rb[:-1], rb[1:]):
        m = mi & (r >= r0) & (r < r1)
        if m.sum() == 0: inl.append([0.5 * (r0 + r1), np.nan, np.nan]); continue
        inl.append([0.5 * (r0 + r1), np.average(U[m, 2], weights=V[m]), np.average(ut[m], weights=V[m])])
    P = np.array(prof); I = np.array(inl)
    acc = (P, I) if acc is None else (acc[0] + P, acc[1] + I)
P, I = acc[0] / len(times), acc[1] / len(times)
for j in (1, 2):
    bad = np.isnan(I[:, j]); I[bad, j] = np.interp(I[bad, 0], I[~bad, 0], I[~bad, j])
rm = 0.5 * (RS0 + RS1)
Qout = (2 * np.pi * rm * 0.02 * P[:, 1] * P[:, 2]).sum() * 3600
dr = rb[1] - rb[0]; Qin = (2 * np.pi * I[:, 0] * dr * I[:, 1]).sum() * 3600
print(f"토출 원통(r={rm:.2f}) 물 순유출 {Qout:.0f} m3/h, 흡입면 유입 {Qin:.0f} m3/h")
print(" z     물비율  ur     ut     uz     k")
for row in P:
    if row[1] > 0.02: print(f"{row[0]:.2f}  {row[1]:.2f}  {row[2]:+.3f} {row[3]:+.3f} {row[4]:+.3f} {row[5]:.4f}")
print(" r    uz(흡입)  ut")
for row in I: print(f"{row[0]:.2f}  {row[1]:+.3f}  {row[2]:+.3f}")
json.dump({"rm": rm, "dz": 0.02, "dr": float(rb[1] - rb[0]), "prof": P.tolist(), "inlet": I.tolist(), "Qout": Qout, "Qin": Qin,
           "rpm": rpm, "times": times}, open(out, 'w'))
