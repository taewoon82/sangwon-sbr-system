"""정상상태 반응조 결과 정리. 사용: python3 poststeady.py CASE OUT.png [t0 t1 step]
마지막 구간 유속장을 평균해서 바닥 0.2 m 수평유속, 0.15 m/s 미만 면적, 깊이별 선회 분포를 출력."""
import numpy as np, sys, os, re
case, png = sys.argv[1], sys.argv[2]
t0, t1, dt = (int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])) if len(sys.argv) > 5 else (2000, 3000, 100)
src = open('/home/claude/turb/post.py').read().split("ts = sorted")[0]
exec(src.replace("case, rpm = sys.argv[1], float(sys.argv[2])", "rpm = 60.0"))
ts = [str(t) for t in range(t0, t1 + 1, dt) if os.path.isdir(f"{case}/{t}")]
Us = [rfield(t, "U", 1)[0] for t in ts]; U = np.mean(Us, axis=0)
x, y, z = C[:, 0] - CX, C[:, 1] - CY, C[:, 2]; r = np.hypot(x, y)
ut = (x * U[:, 1] - y * U[:, 0]) / np.maximum(r, 1e-6)
kb = (z > 0.15) & (z < 0.26)
uh = np.hypot(U[kb, 0], U[kb, 1]); w = V[kb]
inst = []
for Ui in Us:
    h = np.hypot(Ui[kb, 0], Ui[kb, 1]); inst.append((w[h < 0.15].sum() / w.sum(), np.average(h, weights=w)))
inst = np.array(inst)
print(f"평균 시점 {ts[0]}~{ts[-1]} ({len(ts)}개)")
print(f"바닥 0.2 m: 평균 수평유속 {np.average(uh, weights=w):.3f} m/s, 0.15 m/s 미만 면적 {w[uh<0.15].sum()/w.sum()*100:.1f}%"
      f"  (순간값 범위 {inst[:,0].min()*100:.0f}~{inst[:,0].max()*100:.0f}%), 0.30 m/s 미만 {w[uh<0.30].sum()/w.sum()*100:.1f}%")
print("깊이별 선회 ut / 수직 w (m/s), 반경 구간 0-0.85 | 0.85-1.5 | 1.5-3 | 3-5.2")
for z0, z1 in [(3.1, 3.42), (2.5, 3.1), (1.7, 2.5), (0.9, 1.7), (0.15, 0.9)]:
    row = f"  z {z0:.1f}-{z1:.2f}"
    for r0, r1 in [(0, .85), (.85, 1.5), (1.5, 3), (3, 5.2)]:
        m = (z > z0) & (z < z1) & (r >= r0) & (r < r1)
        row += f" | {np.average(ut[m], weights=V[m]):+.2f}/{np.average(U[m,2], weights=V[m]):+.2f}" if m.any() else " |   -  "
    print(row)
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
fig, ax = plt.subplots(figsize=(6.4, 5.6))
sc = ax.scatter(C[kb, 0], C[kb, 1], c=uh, s=4, cmap="viridis", vmin=0, vmax=0.4, marker="s")
ax.tricontour(C[kb, 0], C[kb, 1], uh, levels=[0.15], colors="r", linewidths=1)
q = slice(None, None, 7)
ax.quiver(C[kb, 0][q], C[kb, 1][q], U[kb, 0][q], U[kb, 1][q], scale=6, width=0.002, color="w")
ax.set_aspect("equal"); ax.set_xlim(0, 10.5); ax.set_ylim(0, 10.5)
ax.set_title(f"{os.path.basename(case)}: floor +0.2 m horizontal speed (red = 0.15 m/s)")
plt.colorbar(sc, label="m/s"); plt.tight_layout(); plt.savefig(png, dpi=110)
