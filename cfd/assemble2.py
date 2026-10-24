import json, os, subprocess, sys
old = open('old.html', encoding='utf-8').read()
a = old.find('<script id="data" type="application/json">') + 42; b = old.find('</script>', a)
OD = json.loads(old[a:b])
ORDER = [("n46","29 Hz · 카탈로그 최소"),("n70","44 Hz · 운전점"),("n78","49 Hz · 카탈로그 최대"),("n95","60 Hz · 정격")]
cases = {}
for k, lab in ORDER:
    f = f'postq_{k}.json'
    if not os.path.exists(f): continue
    d = json.load(open(f)); P = json.load(open(f'q_{k}.json'))
    cases[k] = {"label": lab, "hz": P["hz"], **d}
P = json.load(open('q_n70.json'))
first = next(iter(cases.values()))
geo = {k: P[k] for k in ("W","L","H","haunch","cross_w","cross_h","cross_t","turb_x","turb_y","turb_R","turb_depth","band")}
geo["obst"] = P["obst"]
geo.update(site_short="장흥 SBR #1",
  title="양주 장흥 · SBR #1 · 포기장치 Ø1250 · 잠긴 구조물 반영 바닥 정체구역 (46~95 rpm)",
  tag="HWL 3.5 m · 10.5×10.5 m · 기둥 4 · 플로트 3 · 가이드레일 2 · 배출장치(들어올림) · 정상상태 RANS(realizable k-ε)",
  notes=[
   ("터빈 조건", "승인도서 데이터시트: 60 Hz에서 95 rpm(모터 1,775 rpm ÷ 감속비 18.70), 축입력 15.0 kW, 산소전달 25 kgO₂/h. 카탈로그 운전 범위는 46~78 rpm(4.3~10.5 kW), 웹앱 운전점은 69.6 rpm(44 Hz). 토출량은 회전수에 비례(78 rpm에서 1,949 m³/h 기준), 접선 토출속도는 날개 끝 속도의 69%로 두되 축동력 토크를 넘지 않게 제한했습니다(60 Hz는 15 kW 토크 한도로 3.39 m/s)."),
   ("이전 해석과 차이", "이전 장흥 해석은 기둥·플로트·가이드레일·배출장치 없이 터빈만 넣었고, '60 Hz'를 78 rpm으로 계산해 실제로는 49 Hz 조건이었습니다. 이번 49 Hz(78 rpm) 케이스가 이전 '60 Hz'와 같은 터빈 조건이라 구조물 영향만 비교할 수 있습니다."),
   ("잠긴 구조물", "기둥 Ø600 ×4(내벽에서 2.5 m, 바닥~상부), 가이드레일 100A ×2, 플로트 Ø1200 ×3(터빈 중심에서 2.95 m, 수면 아래 0.85 m까지) + 하부 노즐관 150A(수면 아래 1.85 m까지), 배출장치는 폭기 중 들어올린 상태(헤더 수면 위 0.3 m, 연결관 약 47°)로 회전조인트 Ø300·연결관 200A·벽판만 물에 잠김. 출처: 설계 DWG(기둥), 제작도 JH-MS-004·005·008·011, JH-MD-004·005·008·009."),
   ("형상", "반응조 내부 10.5×10.5 m, HWL 수심 3.5 m, 바닥 45° 헌치 0.6 m, 터빈 직하부 십자구조물 2.5×1.2 m·두께 0.2 m, 터빈 몸체 Ø1,350·흡입구 Ø832."),
   ("결과 기준", "각 케이스 3,000회 계산, 2,000~3,000회 유속장 11개 평균. 바닥 유속도·지표는 평균 유속장 기준, 표의 '순간값 범위'는 11개 각각의 범위입니다."),
   ("모델 한계", "수면은 평평한 미끄럼면, 터빈은 흡입구 흡입 + 수면 아래 0.11 m 띠에서 반경·접선 토출로 대신했습니다. 기포·슬러지 밀도 차와 플로트 연결 텐션볼트(Ø24)는 넣지 않았습니다. 절대 유속보다 정체 위치와 상대 크기를 보는 용도입니다."),
  ])
data = {"geo": geo, "levels": OD["levels"], "cols": OD["cols"], "magShape": first["magShape"], "cases": cases, "default": "n70" if "n70" in cases else next(iter(cases))}
json.dump(data, open('viewer_data_q.json', 'w'), ensure_ascii=False)
subprocess.run([sys.executable, 'build_viewer.py', 'viewer_data_q.json', sys.argv[1]], check=True)
