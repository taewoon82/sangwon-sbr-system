"""정상상태 반응조 케이스의 0/ 경계값 작성. 사용: python3 setbc.py CASE
계단형 면이라 면적분 유량을 목표값에 맞게 재보정함."""
import sys, json, numpy as np
case = sys.argv[1]
src = open('/home/claude/turb/post.py').read().split("ts = sorted")[0]
exec(src.replace("case, rpm = sys.argv[1], float(sys.argv[2])", "rpm = 60.0"))
bc = json.load(open(f"{case}/bc.json"))
prof = np.array(bc["inlet_uz_profile"])          # r, uz, ut
vals = {}
def fset(name):
    st, nF = patches[name]; fs = np.arange(st, st + nF); return Cf[fs], Sf[fs]
def erth(cf):
    x, y = cf[:, 0] - CX, cf[:, 1] - CY; r = np.hypot(x, y) + 1e-9
    return np.c_[x / r, y / r, 0 * r], np.c_[-y / r, x / r, 0 * r], r
# 바닥 원판: 상향 흡입 (실제 경계는 zeroGradient — 유량은 질량보존으로 자동 결정, 아래 값은 확인용)(영역 밖으로 유출 → U·Sf > 0)
cf, sf = fset("plug_bottom"); er, et, r = erth(cf)
uz = np.interp(np.minimum(r, prof[-1, 0]), prof[:, 0], prof[:, 1])
U = np.c_[0 * r, 0 * r, uz]; q = (U * sf).sum(); U *= bc["Qb"] / q; vals["plug_bottom"] = U
# 옆면 하부: 안쪽으로 흡입
cf, sf = fset("plug_low"); er, et, r = erth(cf)
U = -er.copy(); q = (U * sf).sum(); U *= (bc["Qd"] - bc["Qb"]) / q; vals["plug_low"] = U
# 옆면 상부 띠: 토출 (반경 + 접선)
cf, sf = fset("plug_high"); er, et, r = erth(cf)
U = er * bc["ur"] + et * bc["ut"]; q = (U * sf).sum(); U *= -bc["Qd"] / q; vals["plug_high"] = U
for n, U in vals.items():
    st, nF = patches[n]; fs = np.arange(st, st + nF)
    print(f"{n:12s} 면 {nF:5d}  유량 {(U*Sf[fs]).sum()*3600:+8.0f} m3/h  평균|U| {np.linalg.norm(U,axis=1).mean():.2f} m/s")
H = "FoamFile { version 2.0; format ascii; class %s; object %s; }\n"
def vlist(U): return "nonuniform List<vector> %d (\n%s\n)" % (len(U), "\n".join(f"({a:.10g} {b:.10g} {c:.10g})" for a, b, c in U))
walls = ["walls", "tank"]
def write(name, cls, dim, internal, wallbc, inbc_fn, outbc, surf):
    s = H % (cls, name) + f"dimensions {dim}; internalField uniform {internal};\nboundaryField {{\n"
    for wn in walls: s += f" {wn} {{ {wallbc} }}\n"
    s += f" plug_high {{ {inbc_fn('plug_high')} }}\n"
    for o in ("plug_bottom", "plug_low"): s += f" {o} {{ {outbc(o)} }}\n"
    s += f" surface {{ {surf} }}\n}}\n"
    open(f"{case}/0/{name}", "w").write(s)
write("U", "volVectorField", "[0 1 -1 0 0 0 0]", "(0 0 0.01)", "type noSlip;",
      lambda n: f"type fixedValue; value {vlist(vals[n])};",
      lambda n: f"type fixedValue; value {vlist(vals[n])};" if n == "plug_low" else "type zeroGradient;", "type slip;")
write("p", "volScalarField", "[0 2 -2 0 0 0 0]", "0", "type zeroGradient;",
      lambda n: "type zeroGradient;", lambda n: "type zeroGradient;", "type zeroGradient;")
k, om = bc["k"], bc["omega"]
write("k", "volScalarField", "[0 2 -2 0 0 0 0]", "1e-3", "type kqRWallFunction; value uniform 1e-3;",
      lambda n: f"type fixedValue; value uniform {k};", lambda n: "type zeroGradient;", "type zeroGradient;")
write("omega", "volScalarField", "[0 0 -1 0 0 0 0]", "1", "type omegaWallFunction; value uniform 1;",
      lambda n: f"type fixedValue; value uniform {om};", lambda n: "type zeroGradient;", "type zeroGradient;")
write("nut", "volScalarField", "[0 2 -1 0 0 0 0]", "0", "type nutkWallFunction; value uniform 0;",
      lambda n: "type calculated; value uniform 0;", lambda n: "type calculated; value uniform 0;", "type calculated; value uniform 0;")
