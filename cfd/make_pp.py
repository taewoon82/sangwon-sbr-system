#!/usr/bin/env python3
"""제주 판포 SBR — 한 지에 Ø2500 터빈 2대 (반시계, 같은 방향)
형상: 포기장치 승인도서 JJ-MS-005·007 (반응조 43.0 × 23.0 m, 바닥 EL 3.25 · HWL 7.65 → 수심 4.4 m, 터빈 양 끝에서 11 m)
십자구조물: 배출장치 승인도서 JJ-MD-007 단면 3.4 × 1.5(h), 두께 0.25 (2026-10-26 사용자 확정)
터빈: 카탈로그 Ø2500 (29~41 rpm, 토출 13,200 m³/h) — 운전점은 웹앱 v12.5.0 고농도 40.5 rpm · 기본 소요동력 87.5 kW
유량계수는 장흥 케이스와 같은 비율(카탈로그 토출량의 0.928)"""
import json, math
W, L, H = 43.0, 23.0, 4.4
turbs = [[11.0, 11.5], [32.0, 11.5]]
D_max, D_suc = 2.6, 1.67
Qcat = 13200/3600*0.928            # m3/s @ 41 rpm
N, P = 40.5, 87.5e3
w = 2*math.pi*N/60; Tq = P/w; Q = Qcat*N/41; tip = w*D_max/2
Vt = min(0.689*tip, Tq/(1000*Q*D_max/2))
# ---- 잠긴 구조물 (승인도서 JJ-MS-004·005·007·010 판독, ±0.3 m) ----
E_ = 0.3
# 플로트: 몸통 Ø2.0 × 1.25 m(수면 아래) + 하부 기둥 300A(Ø0.32) 1.6 m, 터빈 중심에서 약 6 m, 터빈당 3개
fl_rel = [[(-5.9, 1.25), (3.84, 4.7), (1.85, -5.17)], [(-2.1, 5.8), (5.7, -0.8), (-4.1, -4.0)]]
floats, rails = [], []
for (tx, ty), rels in zip(turbs, fl_rel):
    for k, (dx, dy) in enumerate(rels):
        fx, fy = tx+dx, ty+dy
        floats.append({"t":"cyl","p0":[fx,fy,H-1.25],"p1":[fx,fy,H+E_],"r":1.0})
        floats.append({"t":"cyl","p0":[fx,fy,H-2.85],"p1":[fx,fy,H-1.2],"r":0.16})
    # 가이드레일 2개 (폭 방향 바깥쪽 두 플로트, 플로트 바깥 1.2 m), Ø0.22 바닥~수면
    for dx, dy in sorted(rels, key=lambda v: -abs(v[1]))[:2]:
        r_ = math.hypot(dx, dy); gx, gy = tx+dx*(r_+1.2)/r_, ty+dy*(r_+1.2)/r_
        rails.append({"t":"cyl","p0":[gx,gy,-E_],"p1":[gx,gy,H+E_],"r":0.11})
# 상부 유지관리층 기둥: 길이 방향 7.75·18.5·24.5·35.25 m × 폭 방향 6.05·16.95 m = 8개, 지름 0.6 m(가정)
cols = [{"t":"cyl","p0":[x,y,-E_],"p1":[x,y,H+E_],"r":0.3} for x in (7.75,18.5,24.5,35.25) for y in (6.05,16.95)]
obst = {"floats": floats, "rails": rails, "columns": cols}
p = {"site":"제주 판포 SBR (한 지 2대)","label":"웹앱 운전점 (고농도)","rpm":N,"P_shaft":P,"torque":Tq,
     "W":W,"L":L,"H":H,"turbs":turbs,"turb_x":turbs[0][0],"turb_y":turbs[0][1],"turb_R":D_max/2,"turb_depth":0.73,"band":0.30,
     "suction_R":D_suc/2,"haunch":0.66,"cross_w":3.4,"cross_h":1.5,"cross_t":0.25,
     "Q":Q,"Vt":Vt,"tip":tip,"ccw":True,"cell":0.25,"refine":1,"iters":2000,"obst":obst}
json.dump(p, open("pp_n40s.json","w"), ensure_ascii=False, indent=1)
print(f"{N}rpm P={P/1000:.1f}kW T={Tq:.0f}Nm Q={Q:.3f}m3/s/대 Vt={Vt:.2f} tip={tip:.2f}")
