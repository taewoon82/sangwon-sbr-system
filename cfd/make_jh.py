#!/usr/bin/env python3
"""장흥 SBR 유동해석 케이스 파라미터 — 잠긴 구조물 반영판
터빈: 카탈로그 Ø1250 (rmin 46 / rmax 78 rpm, Pmin 4.3 / Pmax 10.5 kW, P = Pmin·(N/46)^n) + 승인도서 데이터시트(60Hz 95rpm, 15.0kW, 감속비 18.70)
형상: modeling-3d/jh_geometry.json (제작도 JH-MS·JH-MD 실측)"""
import json, math, sys
G = json.load(open('/home/claude/fab/jh_geometry.json'))
H = G["H"]; L = G["L"]; E = 0.3
T = G["turbine"]; xc, yc = T["x"], T["y"]
K_Q = 0.5414487338573317/(78/60)          # 토출유량 / 회전수(rps) — 기존 케이스와 같은 유량계수
nexp = math.log(10.5/4.3)/math.log(78/46)
def Pcat(N): return 4.3*(N/46)**nexp*1000
cases = {"n46": (46.0, Pcat(46), "카탈로그 최소"), "n70": (69.6, Pcat(69.6), "웹앱 운전점"),
         "n78": (78.0, Pcat(78), "카탈로그 최대"), "n95": (95.0, 15000.0, "60Hz 정격(데이터시트)")}
obst = {}
obst["columns"] = [{"t":"cyl","p0":[c["x"],c["y"],-E],"p1":[c["x"],c["y"],H+E],"r":c["d"]/2} for c in G["columns"]]
obst["rails"] = [{"t":"cyl","p0":[r["x"],r["y"],-E],"p1":[r["x"],r["y"],H+E],"r":r["d"]/2} for r in G["rails"]]
fl = []
for f in G["floats"]:   # 플로트 탱크 Ø1200: 수면 +0.3 ~ -0.7 + 접시헤드 0.225 (평저 근사 -0.85), 하부 노즐관 150A 수면 -1.85 까지
    a = math.radians(f["ang"]); fx, fy = xc+f["r"]*math.cos(a), yc+f["r"]*math.sin(a)
    fl.append({"t":"cyl","p0":[fx,fy,H-0.85],"p1":[fx,fy,H+E],"r":0.6})
    fl.append({"t":"cyl","p0":[fx,fy,H-1.85],"p1":[fx,fy,H-0.80],"r":0.084})
obst["floats"] = fl
D = G["decanter"]; DX = D["x"]; PZ = D["pivot_z"]; PY = L-0.45
th = math.asin(min(1, (H+0.3-PZ)/2.55))   # 폭기 중 배출장치는 헤더가 수면 위 0.3 m 까지 올라간 상태
ay, az = -math.cos(th), math.sin(th); s_end = (H+E-PZ)/az
obst["decanter"] = [
  {"t":"cyl","p0":[DX-0.42,PY,PZ],"p1":[DX+0.20,PY,PZ],"r":0.15},                  # 회전조인트 하우징
  {"t":"box","min":[DX-0.53,PY,PZ-0.11],"max":[DX-0.31,L+E,PZ+0.11]},              # 엘보·벽 관통관
  {"t":"box","min":[DX-0.40,L-0.018,PZ-0.375],"max":[DX+0.40,L+E,PZ+0.375]},       # 벽판
  {"t":"cyl","p0":[DX+0.05,PY,PZ],"p1":[DX+0.05,PY+ay*s_end,PZ+az*s_end],"r":0.109}]  # 연결관 (들어 올린 상태)
for k,(N,Pw,lab) in cases.items():
    w = 2*math.pi*N/60; Tq = Pw/w; Q = K_Q*N/60; tipv = w*T["D_max"]/2
    Vt = min(0.689*tipv, Tq/(1000*Q*T["D_max"]/2))   # 접선 토출속도 = 끝단속도의 68.9%(기존 78rpm 보정), 축동력 토크 한도 이내
    p = {"site":"양주 장흥 SBR #1 (잠긴 구조물 반영)","label":lab,"hz":round(N/95*60,1),"rpm":N,"P_shaft":Pw,"torque":Tq,
         "W":G["W"],"L":L,"H":H,"turb_x":xc,"turb_y":yc,"turb_R":T["D_max"]/2,"turb_depth":T["depth"],"band":T["band"],
         "suction_R":T["D_suction"]/2,"haunch":G["haunch"],"cross_w":G["cross"]["w"],"cross_h":G["cross"]["h"],"cross_t":G["cross"]["t"],
         "Q":Q,"Vt":Vt,"tip":w*T["D_max"]/2,"ccw":True,"cell":0.12,"refine":1,"iters":2000,"obst":obst,
         "decanter_angle_deg":round(math.degrees(th),1)}
    json.dump(p, open(f"q_{k}.json","w"), ensure_ascii=False, indent=1)
    print(k, lab, f"{p['hz']}Hz {N}rpm P={Pw/1000:.2f}kW T={Tq:.0f}Nm Q={Q:.3f} Vt={Vt:.2f} tip={tipv:.2f} Twater={1000*Q*Vt*T['D_max']/2:.0f}")
