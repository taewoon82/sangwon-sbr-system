#!/usr/bin/env python3
"""OpenFOAM 결과 → 바닥 유속도·지표·정체지점·유선 (JSON)
usage: post.py casedir out.json"""
import sys, os, re, json, math, glob
import numpy as np
from scipy.spatial import cKDTree
from scipy.interpolate import RegularGridInterpolator
from scipy import ndimage

CASE, OUT = sys.argv[1], sys.argv[2]
P = json.load(open(os.path.join(CASE, "case_info.json")))
W, L, H, hn = P["W"], P["L"], P["H"], P["haunch"]
xc, yc, cw, ch, ct = P["turb_x"], P["turb_y"], P["cross_w"], P["cross_h"], P["cross_t"]
Rb, depth = P["turb_R"], P["turb_depth"]

times = sorted([d for d in os.listdir(CASE) if re.fullmatch(r"\d+(\.\d+)?", d) and d != "0"], key=float)
T = os.environ.get("TIME", times[-1])
def read_internal(name, vec, t=None):
    fn = os.path.join(CASE, t or T, name)
    if not os.path.exists(fn): fn = next(os.path.join(CASE, t, name) for t in times if os.path.exists(os.path.join(CASE, t, name)))
    s = open(fn).read()
    m = re.search(r"(?:internalField|value)\s+nonuniform\s+List<\w+>\s*\n?(\d+)\s*\n?\(", s)
    n = int(m.group(1)); body = s[m.end():]
    if vec:
        arr = np.array(re.findall(r"\(([-\d.eE+]+) ([-\d.eE+]+) ([-\d.eE+]+)\)", body[:n*80+100])[:n], dtype=float)
    else:
        end = body.index(")"); arr = np.array(body[:end].split(), dtype=float)
    assert len(arr) == n, (name, len(arr), n)
    return arr
C = read_internal("C", True); U = read_internal("U", True); V = read_internal("V", False)
print("time", T, "cells", len(C))
band = None
if os.environ.get("AVG"):
    a0, a1 = map(float, os.environ["AVG"].split(":"))
    ts = [t for t in times if a0 <= float(t) <= a1 and os.path.exists(os.path.join(CASE, t, "U"))]
    tree0 = cKDTree(C)
    fx0 = np.arange(0.025, W, 0.05); fy0 = np.arange(0.025, L, 0.05); FX0, FY0 = np.meshgrid(fx0, fy0, indexing="ij")
    dd = np.minimum.reduce([FX0, W-FX0, FY0, L-FY0]); FZ0 = np.clip(hn-dd, 0, None) + 0.2
    m0 = ~(((np.abs(FX0-xc) <= cw/2) & (np.abs(FY0-yc) <= ct/2)) | ((np.abs(FX0-xc) <= ct/2) & (np.abs(FY0-yc) <= cw/2)))
    q = np.c_[FX0[m0], FY0[m0], FZ0[m0]]; d0, i0 = tree0.query(q, k=8, workers=-1); w0 = 1/np.maximum(d0, 1e-4)**2; w0 /= w0.sum(1, keepdims=True)
    Us = []; snaps = []
    for t in ts:
        Ut = read_internal("U", True, t); Us.append(Ut)
        uv = np.einsum("nk,nkj->nj", w0, Ut[i0]); hs0 = np.hypot(uv[:, 0], uv[:, 1])
        snaps.append({"t": float(t), "lt15": float((hs0 < 0.15).mean()), "lt30": float((hs0 < 0.3).mean()), "mean": float(hs0.mean())})
    U = np.mean(Us, axis=0)
    band = {"n": len(ts), "from": ts[0], "to": ts[-1], **{k: [min(s_[k] for s_ in snaps), max(s_[k] for s_ in snaps)] for k in ("lt15", "lt30", "mean")}, "snaps": snaps}
    T = ts[-1]
    print("averaged", len(ts), "snapshots", ts[0], "-", ts[-1])

# ---- 장애물 판정 ----
def bed(x, y):
    d = np.minimum.reduce([x, W - x, y, L - y]); return np.clip(hn - d, 0, None)
def solid(x, y, z):
    s = z < bed(x, y)
    s |= ((np.abs(x - xc) <= cw/2) & (np.abs(y - yc) <= ct/2) & (z <= ch)) | ((np.abs(x - xc) <= ct/2) & (np.abs(y - yc) <= cw/2) & (z <= ch))
    s |= (np.hypot(x - xc, y - yc) <= Rb) & (z >= H - depth)
    return s

# ---- 정규 격자로 재표본 (역거리 가중, 이웃 8) ----
dx = 0.05
xs = np.arange(dx/2, W, dx); ys = np.arange(dx/2, L, dx); zs = np.arange(dx/2, H, dx)
tree = cKDTree(C)
GX, GY, GZ = np.meshgrid(xs, ys, zs, indexing="ij")
pts = np.c_[GX.ravel(), GY.ravel(), GZ.ravel()]
d, idx = tree.query(pts, k=8, workers=-1)
wgt = 1.0 / np.maximum(d, 1e-4)**2; wgt /= wgt.sum(1, keepdims=True)
Ug = np.einsum("nk,nkj->nj", wgt, U[idx]).reshape(len(xs), len(ys), len(zs), 3)
Sg = solid(GX, GY, GZ)
Ug[Sg] = 0.0
interp = RegularGridInterpolator((xs, ys, zs), Ug, bounds_error=False, fill_value=None)

# ---- 바닥 위 h 유속도 (수평유속, 바닥·헌치 경사면을 따라감) ----
res = {"tag": P.get("hz"), "time": float(T), "cells": int(len(C)), "vol": float(V.sum()), "Q": P["Q"], "Vr": P["Vr"], "Vt": P["Vt"],
       "rpm": P["rpm"], "P_shaft": P["P_shaft"]}
spd = np.linalg.norm(U, axis=1)
res["Umean"] = float((spd*V).sum()/V.sum())
if band: res["band"] = band; res["avg"] = f"{band['from']}~{band['to']}회 평균 ({band['n']}개)"
for th in (0.05, 0.1, 0.15, 0.3):
    res[f"volfrac_lt_{th}"] = float(V[spd < th].sum()/V.sum())
fx = np.arange(dx/2, W, dx); fy = np.arange(dx/2, L, dx); FX, FY = np.meshgrid(fx, fy, indexing="ij")
mags = {}
for h in (0.2, 0.5):
    FZ = bed(FX, FY) + h
    uv = interp(np.c_[FX.ravel(), FY.ravel(), FZ.ravel()])
    hs = np.hypot(uv[:, 0], uv[:, 1]).reshape(FX.shape); uvz = uv[:, 2]
    mask = solid(FX, FY, FZ)
    v = hs[~mask]
    for th in (0.1, 0.15, 0.3): res[f"floor{h}_lt_{th}"] = float((v < th).mean())
    res[f"floor{h}_mean"] = float(v.mean()); res[f"floor{h}_p10"] = float(np.percentile(v, 10))
    grid = np.where(mask, 65535, np.clip(np.round(hs*1000), 0, 65534)).astype(np.uint16)
    mags[str(h)] = grid.T[::-1].copy()   # 행 = y (위가 L), 열 = x
    if h == 0.2:
        low = (hs < 0.15) & ~mask
        lab, n = ndimage.label(low)
        spots = []
        for k in range(1, n+1):
            m = lab == k; a = m.sum()*dx*dx
            if a < 0.05: continue
            spots.append({"x": float(FX[m].mean()), "y": float(FY[m].mean()), "area": float(a), "vmin": float(hs[m].min()), "vz": float(uvz.reshape(FX.shape)[m].mean())})
        res["spots"] = sorted(spots, key=lambda s: -s["area"])[:15]

# ---- 유선 (RK2, 양방향) ----
rng = np.random.default_rng(7)
seeds = []
for z in (0.3, 0.8, 1.6, 2.4, 3.1):
    for _ in range(36):
        x, y = rng.uniform(0.4, W-0.4), rng.uniform(0.4, L-0.4)
        if not solid(np.array([x]), np.array([y]), np.array([z]))[0]: seeds.append((x, y, z))
lines = []
def trace(p0, sgn):
    p = np.array(p0, float); out = [p.copy()]; sp = []
    for _ in range(900):
        u = interp(p[None])[0]; s = np.linalg.norm(u)
        if s < 0.004: break
        hstep = 0.06 / s
        pm = p + sgn*0.5*hstep*u; um = interp(pm[None])[0]
        p = p + sgn*hstep*um
        if not (0 < p[0] < W and 0 < p[1] < L and 0 < p[2] < H) or solid(p[0:1], p[1:2], p[2:3])[0]: break
        out.append(p.copy())
    return out
for s0 in ([] if os.environ.get("NOLINES") else seeds):
    f = trace(s0, 1); b = trace(s0, -1)
    pts_ = b[::-1] + f[1:]
    if len(pts_) < 15: continue
    pts_ = np.array(pts_[::2])
    sp = np.linalg.norm(interp(pts_), axis=1)
    lines.append({"p": np.round(pts_, 3).ravel().tolist(), "s": np.round(sp, 3).tolist()})
print("lines", len(lines))

# ---- 질량·각운동량 점검 (토출 띠 반경 Rb 원통면을 지나는 유량) ----
ang = np.linspace(0, 2*np.pi, 181)[:-1]; zz = np.linspace(H-P["band"]+0.01, H-0.01, 12)
r = Rb + 0.03
A, Z = np.meshgrid(ang, zz); X = xc + r*np.cos(A); Y = yc + r*np.sin(A)
uu = interp(np.c_[X.ravel(), Y.ravel(), Z.ravel()])
ur = uu[:, 0]*np.cos(A.ravel()) + uu[:, 1]*np.sin(A.ravel()); ut = -uu[:, 0]*np.sin(A.ravel()) + uu[:, 1]*np.cos(A.ravel())
res["check_ur_mean"] = float(ur.mean()); res["check_ut_mean"] = float(ut.mean())

import base64
enc = lambda a: base64.b64encode(a.astype(a.dtype).tobytes()).decode()
json.dump({"res": res, "mag": {k: enc(v) for k, v in mags.items()}, "magShape": list(mags["0.2"].shape), "lines": lines}, open(OUT, "w"))
print(json.dumps({k: (round(v, 4) if isinstance(v, float) else v) for k, v in res.items() if k != "spots"}, ensure_ascii=False))
print("spots", [(round(s["x"],1), round(s["y"],1), round(s["area"],2)) for s in res["spots"][:8]])
