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
p = {"site":"제주 판포 SBR (한 지 2대)","label":"웹앱 운전점 (고농도)","rpm":N,"P_shaft":P,"torque":Tq,
     "W":W,"L":L,"H":H,"turbs":turbs,"turb_x":turbs[0][0],"turb_y":turbs[0][1],"turb_R":D_max/2,"turb_depth":0.73,"band":0.30,
     "suction_R":D_suc/2,"haunch":0.66,"cross_w":3.4,"cross_h":1.5,"cross_t":0.25,
     "Q":Q,"Vt":Vt,"tip":tip,"ccw":True,"cell":0.25,"refine":1,"iters":2000,"obst":{}}
json.dump(p, open("pp_n40.json","w"), ensure_ascii=False, indent=1)
print(f"{N}rpm P={P/1000:.1f}kW T={Tq:.0f}Nm Q={Q:.3f}m3/s/대 Vt={Vt:.2f} tip={tip:.2f}")
