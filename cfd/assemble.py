import json, os, subprocess, sys
OD = {"levels": [0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.5, 1.0], "cols": ["#7a0019", "#d7301f", "#fc8d59", "#fdd49e", "#c7e9c0", "#74c476", "#238b45"]}
P = json.load(open('cases/p60.json'))
cases = {}
for hz in (15, 30, 45, 60):
    f = f'post{hz}.json'
    if not os.path.exists(f): continue
    d = json.load(open(f)); cases[f'h{hz}'] = {"label": f"{hz} Hz", "hz": hz, **d}
if os.path.exists('post60f.json'):
    d = json.load(open('post60f.json')); cases['fine'] = {"label": "60 Hz 세밀격자", "hz": 60, "aux": True, **d}
first = next(iter(cases.values()))
geo = {k: P[k] for k in ("W","L","H","haunch","cross_w","cross_h","cross_t","turb_x","turb_y","turb_R","turb_depth","band")}
geo.update(site_short="장흥 SBR #1",
  title="양주 장흥 · SBR #1 · 포기장치 Ø1250 반시계 회전 · 바닥 정체구역 (15~60 Hz)",
  tag=f"HWL 3.5 m · 10.5×10.5 m · 십자구조물 2.5×1.2 m · 정상상태 RANS(realizable k-ε)",
  notes=[
   ("터빈 조건 (카탈로그)", f"Ø1250 속도범위 46~78 rpm → 60 Hz = 78 rpm. 토출량 2,100 m³/h는 공칭 선속도 Vu 5.5 m/s(84 rpm) 값이라 78 rpm에서 {P['Q']*3600:,.0f} m³/h로 환산했습니다. 60 Hz 축동력은 카탈로그 최대 10.5 kW이고, 이 토크를 물의 각운동량으로 그대로 넘겨 접선 토출속도 {P['Vt']:.2f} m/s(날개 끝 속도의 69%)를 정했습니다."),
   ("주파수 환산", "45·30·15 Hz는 각각 따로 해석했고, 순환량·토출속도는 회전수에 비례(상사법칙)시켰습니다. 카탈로그 동력 곡선은 저속에서 세제곱보다 덜 줄지만(지수 1.69), 그 차이는 물에 전달되지 않는 손실로 보고 유동에는 넣지 않았습니다. 46 rpm(약 35 Hz) 아래는 카탈로그 범위 밖입니다."),
   ("형상", "반응조 내부 10.5×10.5 m, HWL 수심 3.5 m(설계도면·용량계산서 일치). 바닥 45° 헌치 0.6 m(설치단면도 실측, 카탈로그 권장 0.15×H = 0.53 m), 터빈 직하부 십자구조물 2.5×1.2 m·두께 0.2 m 콘크리트. 터빈 몸체 Ø1,350, 흡입구 Ø832(카탈로그). S:T = 3.0으로 카탈로그 최적 범위(2.5~3.5) 안입니다."),
   ("결과 기준", "정상상태 계산이 큰 선회류 때문에 한 값으로 완전히 수렴하지 않아(잔차 약 0.3%에서 진동), 각 케이스를 3,000회까지 돌리고 2,000~3,000회 유속장 11개를 평균했습니다. 바닥 유속도·지표는 이 평균 유속장 기준이고(흔들리는 흐름이 상쇄돼 보수적), 표의 '순간값 범위'는 11개 각각의 0.15 m/s 미만 면적·평균 유속 범위입니다."),
   ("흐름 형태", "바닥을 따라 중심으로 모인 물이 터빈 아래 중심부에서 위로 올라가(60 Hz 중심부 상승유속 0.1~0.35 m/s, 흡입구 직하 0.77 m/s) 터빈이 수면으로 뿜어내는 카탈로그의 '중앙 수직 흐름'과 같은 형태입니다. 십자구조물 주변의 수평 저속 구역은 이 상승류가 시작되는 자리라, 수평유속만으로 정체라고 단정하면 안 됩니다."),
   ("모델 한계", "수면은 평평한 덮개(미끄럼면), 터빈은 \"흡입구(Ø832) 흡입 + 수면 아래 0.11 m 띠에서 반경·접선 토출\"로 대신했습니다(카탈로그 수로 높이 80 mm 기준). 기포·슬러지 밀도 차, 플로트·가이드레일·배출장치 수중관은 넣지 않았습니다. 절대 유속보다 정체 위치와 상대 크기를 보는 용도입니다."),
  ])
data = {"geo": geo, "levels": OD["levels"], "cols": OD["cols"], "magShape": first["magShape"], "cases": cases, "default": "h60" if "h60" in cases else next(iter(cases))}
json.dump(data, open('viewer_data.json', 'w'), ensure_ascii=False)
subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)),'build_viewer.py'), 'viewer_data.json', sys.argv[1] if len(sys.argv) > 1 else '장흥_SBR1_유동해석.html'], check=True)
