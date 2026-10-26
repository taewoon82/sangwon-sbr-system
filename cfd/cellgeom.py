#!/usr/bin/env python3
"""polyMesh(ascii) → 셀 중심 C, 셀 부피 V 를 계산해 time 폴더에 OpenFOAM 형식으로 기록"""
import sys, os, re
import numpy as np
case, T = sys.argv[1], sys.argv[2]
pm = os.path.join(case, "constant/polyMesh")
def body(fn):
    s = open(os.path.join(pm, fn)).read()
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.S); s = s[s.index("}", s.index("FoamFile")) + 1:]
    m = re.search(r"\n\s*(\d+)\s*\n\s*\(", s); return int(m.group(1)), s[m.end():]
n, b = body("points")
pts = np.array(re.findall(r"\(([-\d.eE+]+) ([-\d.eE+]+) ([-\d.eE+]+)\)", b)[:n], float)
n, b = body("faces")
faces = [list(map(int, f.split())) for f in re.findall(r"\d+\(([\d ]+)\)", b)[:n]]
assert len(faces) == n
n, b = body("owner"); owner = np.array(b[:b.index(")")].split(), int)
n2, b = body("neighbour"); nei = np.array(b[:b.index(")")].split(), int)
nc = max(owner.max(), nei.max()) + 1
# 면 중심·면적 벡터 (삼각 분할)
fc = np.zeros((len(faces), 3)); fa = np.zeros((len(faces), 3))
for i, f in enumerate(faces):
    p = pts[f]; c0 = p.mean(0)
    a = np.cross(p - c0, np.roll(p, -1, 0) - c0) * 0.5
    ar = np.linalg.norm(a, axis=1); tc = (p + np.roll(p, -1, 0) + c0) / 3
    A = a.sum(0); fa[i] = A; fc[i] = (tc * ar[:, None]).sum(0) / max(ar.sum(), 1e-30)
# 근사 셀 중심 = 면 중심 평균 → 피라미드 분해로 부피·중심
cnt = np.bincount(owner, minlength=nc) + np.bincount(nei, minlength=nc)
cg = (np.add.reduceat if False else None)
sumc = np.zeros((nc, 3))
np.add.at(sumc, owner, fc); np.add.at(sumc, nei, fc[:len(nei)])
cg = sumc / cnt[:, None]
V = np.zeros(nc); C = np.zeros((nc, 3))
def acc(cells, sign, idx):
    pv = sign * np.einsum("ij,ij->i", fa[idx], fc[idx] - cg[cells]) / 3.0
    pc = 0.75 * fc[idx] + 0.25 * cg[cells]
    np.add.at(V, cells, pv); np.add.at(C, cells, pc * pv[:, None])
acc(owner, 1.0, np.arange(len(owner)))
acc(nei, -1.0, np.arange(len(nei)))
C = C / V[:, None]
print("cells", nc, "V total", V.sum(), "min V", V.min())
hdr = lambda cls, obj: f'FoamFile\n{{ version 2.0; format ascii; class {cls}; location "{T}"; object {obj}; }}\ndimensions [0 {"1" if obj=="C" else "3"} 0 0 0 0 0];\n'
with open(os.path.join(case, T, "C"), "w") as f:
    f.write(hdr("volVectorField", "C") + f"internalField nonuniform List<vector>\n{nc}\n(\n")
    f.write("\n".join(f"({x:.6f} {y:.6f} {z:.6f})" for x, y, z in C)); f.write("\n);\nboundaryField {}\n")
with open(os.path.join(case, T, "V"), "w") as f:
    f.write(hdr("volScalarField::Internal", "V") + f"value nonuniform List<scalar>\n{nc}\n(\n")
    f.write("\n".join(f"{v:.6e}" for v in V)); f.write("\n);\n")
