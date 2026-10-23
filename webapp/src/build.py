import base64
v8=open('v8.html',encoding='utf-8').read()
tpl=base64.b64encode(open('/home/claude/cl/out/Project 체크리스트_정리본.xlsx','rb').read()).decode()
js=open('dwgx.js',encoding='utf-8').read()+"\n"+open('xfill.js',encoding='utf-8').read()+"\n"+open('v9.js',encoding='utf-8').read().replace("__TPL_B64__",tpl)
css=open('v9.css',encoding='utf-8').read(); sec=open('v9_section.html',encoding='utf-8').read()
i=v8.find('</head>'); assert i>0
out=v8[:i]+"<style>\n"+css+"</style>\n"+'<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js"}}</script>\n'+v8[i:]
j=out.find('<script>\n// ===== 카탈로그'); assert j>0
out=out[:j]+sec+"\n"+out[j:]
ATT='<div id="v10att" class="v10att noprint"><span class="t">첨부 자료</span><span class="chip no" id="attXls">📄 용량계산서 <b>미첨부</b></span><span class="chip no" id="attDwg">📐 설계도면 <b>미첨부</b></span><span class="chip off" id="attSpec" title="장흥 장비일람표·시방서로 형식 확인 후 추가 예정">📑 장비일람표·시방서 <b>준비 중</b></span></div>'
pt='<div id="printTitle" class="print-only-title"></div>'; assert pt in out; out=out.replace(pt, ATT+'\n'+pt,1)
k=out.rfind('</body>')
out=out[:k]+'<script type="module">\n'+js+'\n</script>\n'+out[k:]
# v8 보완: COR = SOR × δ ÷ Ta 양식에서 δ 값이 따로 없으면 계산서 COR·SOR·Ta로 역산
anchor='  ref("COR",/표준산소요구량\\s*\\(COR\\)/,/=\\s*(\\d[\\d,]*(?:\\.\\d+)?)\\s*kgO/,{look:3});'
assert anchor in out, 'COR anchor'
out=out.replace(anchor, anchor+'\n  if(R.glob.delta==null && R.ref.COR && R.ref.SOR && R.glob.ta){ const d=R.ref.COR[0]*R.glob.ta/R.ref.SOR[0]; if(isFinite(d)&&d>0.8&&d<1.6){ R.glob.delta=Math.round(d*100)/100; R.src.delta=R.src.ta; R.deltaInferred=true; } }')
out=out.replace('<title>물질수지·터빈 선정 (PDF 자동입력)</title>','<title>물질수지·터빈 선정 v10 (도면 대조·검토서)</title>')
out=out.replace('>SBR 반응조 물질수지 · 표면포기기 터빈 선정</h1>','>SBR 반응조 물질수지 · 표면포기기 터빈 선정 <small style="font-size:.55em;opacity:.7">v10 · 도면 대조·검토서</small></h1>')
open('SBR_v10.html','w',encoding='utf-8').write(out)
print(len(out))
