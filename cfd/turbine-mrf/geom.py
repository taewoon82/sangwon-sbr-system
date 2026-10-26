"""1250형 선회와류식 터빈 + 장흥 반응조 형상 생성 (STL, 단위 m)
사용: python3 geom.py OUTDIR [WRAP_DEG] [STATOR 0/1]
좌표: 반응조 바닥 z=0, 수면 z=3.5, 터빈 중심 (5.25,5.25). 회전 +z(반시계).
"""
import numpy as np, sys, os

OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
WRAP = np.radians(float(sys.argv[2]) if len(sys.argv) > 2 else 92.0)
STATOR = int(sys.argv[3]) if len(sys.argv) > 3 else 0

CX = CY = 5.25
ZS = 3.5                 # 수면(덮개 상면 = 채널 상단, 침수 +1)
F = 0.080                # 채널 높이
G = 0.295                # 흡입구~플랜지 높이
ZF = ZS - F              # 플랜지(벨 상단) 높이
ZB = ZF - G              # 흡입구 하단
R0, R1 = 0.416, 0.675    # 흡입구 반경, 최대 반경
NB = 12
TB = 0.018               # 날개/몸체 두께 (해석용)

def write_stl(name, tris):
    with open(f"{OUT}/{name}.stl", "w") as f:
        f.write(f"solid {name}\n")
        for a, b, c in tris:
            n = np.cross(b - a, c - a); l = np.linalg.norm(n)
            n = n / l if l > 0 else n
            f.write(f" facet normal {n[0]:.6e} {n[1]:.6e} {n[2]:.6e}\n  outer loop\n")
            for p in (a, b, c):
                f.write(f"   vertex {p[0]:.6f} {p[1]:.6f} {p[2]:.6f}\n")
            f.write("  endloop\n endfacet\n")
        f.write(f"endsolid {name}\n")

def grid_tris(P, flip=False):
    T = []
    for i in range(P.shape[0] - 1):
        for j in range(P.shape[1] - 1):
            a, b, c, d = P[i, j], P[i + 1, j], P[i + 1, j + 1], P[i, j + 1]
            T += [(a, b, c), (a, c, d)] if not flip else [(a, c, b), (a, d, c)]
    return T

def solid_from_two(A, B, periodic=False):
    """A,B: 같은 크기 격자(두 면). 가장자리를 이어 닫힌 솔리드."""
    T = grid_tris(A) + grid_tris(B, flip=True)
    edges = [lambda X: X[0, :], lambda X: X[-1, :]]
    if not periodic: edges += [lambda X: X[:, 0], lambda X: X[:, -1]]
    for edge in edges:
        ea, eb = edge(A), edge(B)
        for k in range(len(ea) - 1):
            T += [(ea[k], eb[k], eb[k + 1]), (ea[k], eb[k + 1], ea[k + 1])]
    return T

def box(x0, x1, y0, y1, z0, z1):
    v = np.array([[x, y, z] for z in (z0, z1) for y in (y0, y1) for x in (x0, x1)], float)
    f = [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)]
    T = []
    for a, b, c, d in f:
        T += [(v[a], v[b], v[c]), (v[a], v[c], v[d])]
    return T

def cyl(r, t, z):
    return np.array([CX + r * np.cos(t), CY + r * np.sin(t), z])

# ---- 몸체(벨): 사분 타원 r=R0+(R1-R0)(1-cos s), z=ZB+G sin s ----
s = np.linspace(0, np.pi / 2, 40); th = np.linspace(0, 2 * np.pi, 145)
def bell(s_, off):  # off: 법선(바깥쪽=+) 오프셋
    r = R0 + (R1 - R0) * (1 - np.cos(s_)); z = ZB + G * np.sin(s_)
    tr, tz = (R1 - R0) * np.sin(s_), G * np.cos(s_); L = np.hypot(tr, tz)
    nr, nz = tz / L, -tr / L      # 바깥/아래쪽 법선
    return r + off * nr, z + off * nz
ri, zi = bell(s, 0.0); ro, zo = bell(s, TB)
A = np.array([[cyl(ri[i], t, zi[i]) for t in th] for i in range(len(s))])
B = np.array([[cyl(ro[i], t, zo[i]) for t in th] for i in range(len(s))])
write_stl("body", solid_from_two(A, B, periodic=True))

# ---- 날개: 자오면 영역 = 벨 내면 / 수면선 / 앞전선 ----
# 앞전선: (0.405, ZB) -> (0.30, ZS). 영역을 (u: 앞전->벽, v: 아래->위)로 매핑
RL0, RL1 = 0.405, 0.30
def meridional(u, v):
    """v: 0(흡입구)~1(수면). 벽쪽 경계: v<=vb 구간은 벨, 이후 수면선(채널 상단)."""
    # 벽쪽 경계점: 벨 곡선 + 채널 상단(수면) 선을 이은 경로
    Lb = 1.0   # 경로 파라미터 0~1: 0~0.8 벨, 0.8~1 채널 바깥 끝(r=R1, ZF->ZS)
    if v <= 0.8:
        ss = (v / 0.8) * np.pi / 2
        rw, zw = R0 + (R1 - R0) * (1 - np.cos(ss)) - 0.004, ZB + G * np.sin(ss) + 0.004
    else:
        rw, zw = R1, ZF + (v - 0.8) / 0.2 * F
    rl, zl = RL0 + (RL1 - RL0) * v, ZB + (ZS - ZB) * v
    return rl + (rw - rl) * u, zl + (zw - zl) * u

def phi(r, z):
    xi = np.clip(0.6 * (z - ZB) / (ZS - ZB) + 0.4 * (r - RL1) / (R1 - RL1), 0, 1)
    return WRAP * (1 - (1 - xi) ** 3)

nu, nv = 14, 40
uu, vv = np.linspace(0, 1, nu), np.linspace(0, 1, nv)
for k in range(NB):
    t0 = 2 * np.pi * k / NB
    M = np.array([[meridional(u, v) for u in uu] for v in vv])  # (nv,nu,2)
    r, z = M[..., 0], M[..., 1]
    t = t0 - phi(r, z)
    dt = TB / 2 / r
    A = np.stack([CX + r * np.cos(t - dt), CY + r * np.sin(t - dt), z], -1)
    B = np.stack([CX + r * np.cos(t + dt), CY + r * np.sin(t + dt), z], -1)
    write_stl(f"blade{k:02d}", solid_from_two(A, B))
    # 덮개날개: 앞전선(u=0)을 따라 +θ(회전방향)로 폭 w(v)
    rl, zl = r[:, 0], z[:, 0]; tl = t[:, 0]
    w = 0.10 * vv ** 1.5 + 0.002
    ws = np.linspace(0, 1, 6)
    # 앞전선 위 평판, 앞전선에 수직(자오면 법선) 방향 두께
    dr, dz = np.gradient(rl), np.gradient(zl); L = np.hypot(dr, dz)
    nr, nz = -dz / L, dr / L      # 안쪽(축 방향) 법선
    tt = tl[:, None] + (w[:, None] * ws[None, :]) / rl[:, None]
    zt = np.minimum(zl[:, None] + 0 * tt, ZS - TB / 2 - 0.001)
    A = np.stack([CX + rl[:, None] * np.cos(tt), CY + rl[:, None] * np.sin(tt), zt], -1)
    off = np.stack([nr[:, None] * np.cos(tt), nr[:, None] * np.sin(tt), nz[:, None] + 0 * tt], -1) * TB / 2
    write_stl(f"cover{k:02d}", solid_from_two(A - off, A + off))

# ---- 반응조 구조물: 헌치(45°, 0.6 m), 십자구조물(2.5 x 0.2, 높이 1.2) ----
W, V = 10.5, 0.6
T = []
def prism(p0, p1, p2, ax, a0, a1):
    """삼각형 단면 p0..p2 (2D: 수평좌표 h, z)를 축방향 a0~a1로 압출"""
    out = []
    def P(p, a):
        h, z = p
        return np.array([a, h, z]) if ax == 'x' else np.array([h, a, z])
    q = [P(p, a0) for p in (p0, p1, p2)] + [P(p, a1) for p in (p0, p1, p2)]
    out += [(q[0], q[2], q[1]), (q[3], q[4], q[5])]
    for i in range(3):
        j = (i + 1) % 3
        out += [(q[i], q[j], q[j + 3]), (q[i], q[j + 3], q[i + 3])]
    return out
e = 0.05
T += prism((-e, -e), (V, -e), (-e, V), 'x', -e, W + e)
T += prism((W + e, -e), (W - V, -e), (W + e, V), 'x', -e, W + e)
T += prism((-e, -e), (V, -e), (-e, V), 'y', -e, W + e)
T += prism((W + e, -e), (W - V, -e), (W + e, V), 'y', -e, W + e)
write_stl("haunch", T)
write_stl("cross", box(CX - 1.25, CX + 1.25, CY - 0.1, CY + 0.1, -e, 1.2)
          + box(CX - 0.1, CX + 0.1, CY - 1.25, CY + 1.25, -e, 1.2))

# ---- 정지 고정날개(옵션): 흡입구 아래 반경방향 평판 8매, 부유장치 지지 가정 ----
if STATOR:
    T = []
    for k in range(8):
        a = 2 * np.pi * k / 8
        ca, sa = np.cos(a), np.sin(a)
        # 반경 0.06~0.40, 높이 ZB-0.25 ~ ZB-0.03 , 두께 0.012
        c = np.array([CX, CY])
        p = lambda rr, zz, ss: np.array([CX + rr * ca - ss * sa, CY + rr * sa + ss * ca, zz])
        v = [p(rr, zz, ss) for zz in (ZB - 0.25, ZB - 0.03) for ss in (-0.006, 0.006) for rr in (0.06, 0.40)]
        f = [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)]
        for q in f:
            T += [(v[q[0]], v[q[1]], v[q[2]]), (v[q[0]], v[q[2]], v[q[3]])]
    write_stl("stator", T)

print(f"ZB={ZB:.3f} ZF={ZF:.3f} ZS={ZS} wrap={np.degrees(WRAP):.0f}")
