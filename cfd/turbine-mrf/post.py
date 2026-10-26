"""사용: python3 post.py CASE RPM [TIME]
polyMesh를 직접 읽어 셀 중심·부피, 날개면 토크를 계산 (함수객체 미사용)."""
import numpy as np, re, sys, os
case, rpm = sys.argv[1], float(sys.argv[2]); om = rpm * 2 * np.pi / 60
CX = CY = 5.25; ZB, ZF, ZS, R0, R1 = 3.125, 3.42, 3.5, 0.416, 0.675
NU = 1e-6; RHO = 1000.0

def body(f):
    s = open(f).read(); s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)
    s = s[s.index("}", s.index("FoamFile")) + 1:]
    return s
def read_list(f, kind):
    s = body(f); m = re.search(r"(\d+)\s*\(", s); n = int(m.group(1)); b = s[m.end():]
    if kind == "vec":
        return np.array(re.findall(r"\(([-\d.eE+]+) ([-\d.eE+]+) ([-\d.eE+]+)\)", b)[:n], float)
    if kind == "faces":
        L = re.findall(r"(\d+)\(([\d ]+)\)", b)[:n]
        return [np.array(x[1].split(), int) for x in L]
    return np.array(b[:b.index(")")].split(), int)
mesh = f"{case}/constant/polyMesh"
cache = f"{case}/meshcache.npz"
bnd = body(f"{mesh}/boundary")
patches = {m.group(1): (int(m.group(3)), int(m.group(2))) for m in
           re.finditer(r"(\w+)\s*\{[^}]*?nFaces\s+(\d+);\s*startFace\s+(\d+);", bnd)}
if os.path.exists(cache):
    d = np.load(cache); C, V, Cf, Sf, own = d["C"], d["V"], d["Cf"], d["Sf"], d["own"]
else:
    P = read_list(f"{mesh}/points", "vec"); F = read_list(f"{mesh}/faces", "faces")
    own = read_list(f"{mesh}/owner", "int"); nei = read_list(f"{mesh}/neighbour", "int")
    nf = len(F); Cf = np.zeros((nf, 3)); Sf = np.zeros((nf, 3))
    for i, f in enumerate(F):
        p = P[f]; c0 = p.mean(0); q = np.roll(p, -1, 0)
        cr = np.cross(p - c0, q - c0); a = np.linalg.norm(cr, axis=1)
        tc = (p + q + c0) / 3; Sf[i] = cr.sum(0) / 2
        Cf[i] = (tc * a[:, None]).sum(0) / max(a.sum(), 1e-30)
    nc = max(own.max(), nei.max()) + 1
    # 부피·중심: 각 면에 대한 피라미드 (근사 중심 = 면중심 평균)
    cnt = np.bincount(own, minlength=nc) + np.bincount(nei, minlength=nc)
    cg = (np.add.reduceat if False else None)
    cg = np.zeros((nc, 3))
    for k in range(3):
        cg[:, k] = (np.bincount(own, Cf[:, k], nc) + np.bincount(nei, Cf[:nei.size, k], nc)) / cnt
    def pyr(cells, sgn, fs):
        h = ((Cf[fs] - cg[cells]) * Sf[fs]).sum(1) * sgn / 3
        return h
    fo = np.arange(nf); fn = np.arange(nei.size)
    vo = pyr(own, 1, fo); vn = pyr(nei, -1, fn)
    V = np.bincount(own, vo, nc) + np.bincount(nei, vn, nc)
    C = np.zeros((nc, 3))
    for k in range(3):
        po = cg[own, k] + 0.75 * (Cf[fo, k] - cg[own, k]); pn = cg[nei, k] + 0.75 * (Cf[fn, k] - cg[nei, k])
        C[:, k] = (np.bincount(own, vo * po, nc) + np.bincount(nei, vn * pn, nc)) / V
    np.savez(cache, C=C, V=V, Cf=Cf, Sf=Sf, own=own)

def rfield(t, name, vec):
    s = open(f"{case}/{t}/{name}").read()
    m = re.search(r"internalField\s+nonuniform\s+List<\w+>\s*\n?(\d+)\s*\n?\(", s); n = int(m.group(1)); b = s[m.end():]
    if vec:
        I = np.array(re.findall(r"\(([-\d.eE+]+) ([-\d.eE+]+) ([-\d.eE+]+)\)", b[:n * 90 + 100])[:n], float)
    else:
        I = np.array(b[:b.index(")")].split(), float)
    return I, s
def patch_vals(s, name, vec, nF):
    m = re.search(rf"\n\s*{name}\s*\{{(.*?)\n\s*\}}", s[s.index("boundaryField"):], re.S)
    blk = m.group(1)
    mm = re.search(r"value\s+nonuniform\s+List<\w+>\s*\n?(\d+)\s*\n?\(", blk)
    if mm:
        b = blk[mm.end():]
        if vec: return np.array(re.findall(r"\(([-\d.eE+]+) ([-\d.eE+]+) ([-\d.eE+]+)\)", b), float)[:nF]
        return np.array(b[:b.index(")")].split(), float)[:nF]
    mm = re.search(r"value\s+uniform\s+(\(.*?\)|[-\d.eE+]+)", blk)
    if mm:
        v = mm.group(1).strip("()").split()
        return np.tile(np.array(v, float), (nF, 1)) if vec else np.full(nF, float(v[0]))
    return None

ts = sorted([d for d in os.listdir(case) if re.fullmatch(r"[\d.]+", d) and d != "0"], key=float)
times = [sys.argv[3]] if len(sys.argv) > 3 else ts
res = []
for t in times:
    U, sU = rfield(t, "U", 1); p, sp = rfield(t, "p", 0); nut, sn = rfield(t, "nut", 0)
    x, y, z = C[:, 0] - CX, C[:, 1] - CY, C[:, 2]; r = np.hypot(x, y)
    ur = (x * U[:, 0] + y * U[:, 1]) / np.maximum(r, 1e-6); ut = (x * U[:, 1] - y * U[:, 0]) / np.maximum(r, 1e-6)
    o = {"time": float(t)}
    k = (z > ZB - 0.09) & (z < ZB - 0.03) & (r < R0)
    o["Q_in"] = np.average(U[k, 2], weights=V[k]) * np.pi * R0**2 * 3600
    w = V[k] * np.maximum(U[k, 2], 0)
    o["swirl_in"] = (ut[k] / (om * r[k]) * w).sum() / w.sum()      # 흡입부 선회속도/날개속도 (유량가중)
    k2 = (r > 0.70) & (r < 0.76) & (z > ZF) & (z < ZS)
    o["Q_out"] = np.average(ur[k2], weights=V[k2]) * 2 * np.pi * 0.73 * (ZS - ZF) * 3600
    w2 = V[k2] * np.maximum(ur[k2], 0)
    o["ut_out/tip"] = (ut[k2] * w2).sum() / w2.sum() / (om * R1)
    Mz = 0.0
    for name, (st, nF) in patches.items():
        if not name.startswith(("blade", "cover", "body")): continue
        fs = np.arange(st, st + nF); cf, sf = Cf[fs], Sf[fs]
        pb = patch_vals(sp, name, 0, nF)
        if pb is None: pb = p[own[fs]]
        Fp = RHO * pb[:, None] * sf
        # 벽 전단 근사: (nu+nut_w) * (U_cell - U_wall)_t / d
        Uw = patch_vals(sU, name, 1, nF); nw = patch_vals(sn, name, 0, nF)
        cc = own[fs]; nrm = sf / np.linalg.norm(sf, axis=1)[:, None]
        du = U[cc] - Uw; du = du - (du * nrm).sum(1)[:, None] * nrm
        dd = np.abs(((C[cc] - cf) * nrm).sum(1)) + 1e-6
        Ft = RHO * (NU + nw)[:, None] * du / dd[:, None] * np.linalg.norm(sf, axis=1)[:, None]
        Ftot = Fp + Ft
        rx, ry = cf[:, 0] - CX, cf[:, 1] - CY
        Mz += (rx * Ftot[:, 1] - ry * Ftot[:, 0]).sum()
    o["Mz"] = Mz; o["P_kW"] = abs(Mz) * om / 1000
    res.append(o)
    print("  ".join(f"{a}={b:.4g}" for a, b in o.items()), flush=True)
