import base64
v8=open('v8.html',encoding='utf-8').read()
import zipfile, io, re
def patch_tpl(src):
    zi=zipfile.ZipFile(src); bo=io.BytesIO(); zo=zipfile.ZipFile(bo,'w',zipfile.ZIP_DEFLATED)
    for it in zi.infolist():
        d=zi.read(it.filename)
        if it.filename=='xl/worksheets/sheet2.xml':
            s=d.decode('utf-8')
            # 요약: 점검 항목(K=1)만 집계
            for w in ('확인','검토','부적합'):
                s=s.replace(f'COUNTIF($F$1:$F$105,&quot;{w}&quot;)', f'COUNTIFS($K$1:$K$105,1,$F$1:$F$105,&quot;{w}&quot;)')
            # 지적사항 문구: 숫자는 소수 둘째 자리까지
            s=re.sub(r'(?<![A-Z$])D(\d+)&amp;IF\(ISNUMBER\(D\1\)', lambda m: f'IF(ISNUMBER(D{m[1]}),ROUND(D{m[1]},2),D{m[1]})&amp;IF(ISNUMBER(D{m[1]})', s)
            # 판정 칸 서식 통일: 기본 데이터 행(회색 20/21)도 판정을 쓰므로 점검 항목 행과 같은 노란 입력 서식(F 28, G·H 12)으로
            def restyle(m):
                r=int(m.group(2))
                if 11<=r<=105: return m.group(0).replace(f'r="{m.group(1)}{r}" s="20"', f'r="{m.group(1)}{r}" s="{28 if m.group(1)=="F" else 12}"').replace(f'r="{m.group(1)}{r}" s="21"', f'r="{m.group(1)}{r}" s="12"')
                return m.group(0)
            s=re.sub(r'<c r="([FGH])(\d+)" s="2[01]"', restyle, s)
            # 판정 색 (조건부 서식·목록)을 F11:F105 전체로, 확인 = 초록 추가
            s=re.sub(r'(<conditionalFormatting sqref=")F27:F28[^"]*(">)', r'\1F11:F105\2', s)
            s=s.replace('<formula>F27=&quot;부적합&quot;</formula>','<formula>F11=&quot;부적합&quot;</formula>').replace('<formula>F27=&quot;검토&quot;</formula>','<formula>F11=&quot;검토&quot;</formula>')
            s=s.replace('<formula>F11=&quot;검토&quot;</formula></cfRule>','<formula>F11=&quot;검토&quot;</formula></cfRule><cfRule type="expression" priority="5" dxfId="3"><formula>F11=&quot;확인&quot;</formula></cfRule>',1)
            s=re.sub(r'(<dataValidation [^>]*sqref=")F27:F28[^"]*(")', r'\1F11:F105\2', s)
            d=s.encode('utf-8')
        if it.filename=='xl/styles.xml':
            st=d.decode('utf-8')
            st=st.replace('<dxfs count="3">','<dxfs count="4">').replace('</dxfs>','<dxf><font><b val="1"/><color rgb="FF006100"/></font><fill><patternFill><bgColor rgb="FFC6EFCE"/></patternFill></fill></dxf></dxfs>',1)
            d=st.encode('utf-8')
        zo.writestr(it, d)
    zo.close(); return bo.getvalue()
tpl=base64.b64encode(patch_tpl('/home/claude/cl/out/Project 체크리스트_정리본.xlsx')).decode()
js=open('dwgx.js',encoding='utf-8').read()+"\n"+open('spec.js',encoding='utf-8').read()+"\n"+open('ingest.js',encoding='utf-8').read()+"\n"+open('ocr.js',encoding='utf-8').read()+"\n"+open('elec.js',encoding='utf-8').read()+"\n"+open('review.js',encoding='utf-8').read().replace('__TPL_META__',open('tpl_meta.json',encoding='utf-8').read())+"\n"+open('xfill.js',encoding='utf-8').read()+"\n"+open('v9.js',encoding='utf-8').read().replace("__TPL_B64__",tpl)
css=open('v9.css',encoding='utf-8').read(); sec=open('v9_section.html',encoding='utf-8').read()
i=v8.find('</head>'); assert i>0
out=v8[:i]+"<style>\n"+css+"</style>\n"+'<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js"}}</script>\n'+v8[i:]
j=out.find('<script>\n// ===== 카탈로그'); assert j>0
out=out[:j]+sec+"\n"+out[j:]
ATT='<div id="v10att" class="v10att noprint"><span class="t">첨부 자료</span><span class="chip no" id="attXls">📄 용량계산서 <b>미첨부</b></span><span class="chip no" id="attDwg">📐 설계도면 <b>미첨부</b></span><span class="chip no" id="attSpec" title="눌러서 시방서 PDF 선택">📑 시방서·승인도서 <b>미첨부</b></span><span class="chip no" id="attElec">⚡ 전기·계측 도면 <b>미첨부</b></span></div>'
pt='<div id="printTitle" class="print-only-title"></div>'; assert pt in out; out=out.replace(pt, ATT+'\n'+pt,1)
k=out.rfind('</body>')
out=out[:k]+'<script type="module">\n'+js+'\n</script>\n'+out[k:]
# v8 보완: COR = SOR × δ ÷ Ta 양식에서 δ 값이 따로 없으면 계산서 COR·SOR·Ta로 역산
anchor='  ref("COR",/표준산소요구량\\s*\\(COR\\)/,/=\\s*(\\d[\\d,]*(?:\\.\\d+)?)\\s*kgO/,{look:3});'
assert anchor in out, 'COR anchor'
out=out.replace(anchor, anchor+'\n  if(R.glob.delta==null && R.ref.COR && R.ref.SOR && R.glob.ta){ const d=R.ref.COR[0]*R.glob.ta/R.ref.SOR[0]; if(isFinite(d)&&d>0.8&&d<1.6){ R.glob.delta=Math.round(d*100)/100; R.src.delta=R.src.ta; R.deltaInferred=true; } }')
out=out.replace('<title>물질수지·터빈 선정 (PDF 자동입력)</title>','<title>물질수지·터빈 선정 v12 (도면·시방서 대조·검토서)</title>')
out=out.replace('>SBR 반응조 물질수지 · 표면포기기 터빈 선정</h1>','>SBR 반응조 물질수지 · 표면포기기 터빈 선정 <small style="font-size:.55em;opacity:.7">v12 · 도면·시방서·압축파일 대조·검토서</small></h1>')
APP_VER='12.4.0'
out=out.replace('v12 · 도면·시방서·압축파일 대조·검토서</small></h1>','v'+APP_VER+' · 도면·시방서·압축파일 대조·검토서</small></h1>')
PRINTFIX = """<style>
@media print{
  /* 큰 칸이 통째로 다음 장으로 밀려 첫 장이 비던 문제: 칸이 페이지 경계에서 나뉘도록 */
  section,details.coef,.hero{display:block !important;break-inside:auto !important;page-break-inside:auto !important}
  section>h2,details.coef>summary{break-after:avoid;page-break-after:avoid}
  .row,.rline,tr,.note,.alert{break-inside:avoid;page-break-inside:avoid}
  #updBtn,#updPop{display:none !important}
}
#updBtn{margin-left:8px;font-size:12px;padding:3px 9px;border:1px solid var(--accent);border-radius:4px;background:transparent;color:var(--accent);cursor:pointer}
#updPop{display:none;position:fixed;top:56px;right:16px;z-index:50;max-width:340px;background:var(--bg,#fff);color:var(--ink,#111);border:1px solid var(--accent);border-radius:6px;padding:12px 14px;font-size:13px;line-height:1.6;box-shadow:0 4px 18px rgba(0,0,0,.18)}
#updPop.on{display:block}
</style>
<script>
(function(){
  const ver='"""+APP_VER+"""';
  const desk = location.protocol==='app:';
  const h1=document.querySelector('h1'); if(!h1) return;
  const b=document.createElement('button'); b.id='updBtn'; b.textContent='⟳ 업데이트 (현재 v'+ver+')';
  const p=document.createElement('div'); p.id='updPop';
  p.innerHTML = desk
    ? '<b>업데이트 방법</b><br>① 깃허브 <code>desktop/updates</code>에서 최신 <code>SBR-Design-Review_update_v….zip</code> 내려받기<br>② 창 맨 위 메뉴 <b>[업데이트] → [업데이트 파일 열기…]</b>에서 그 zip 선택<br><small>메뉴줄이 안 보이면 <b>Alt</b> 키를 누르세요. 적용 후 제목 옆 버전이 바뀝니다.</small>'
    : '<b>최신 버전 받기</b><br>깃허브 <code>webapp/</code> 폴더의 <code>SBR_물질수지·터빈선정_v12.html</code>을 다시 내려받아 여세요.<br><small>폰 링크는 항상 최신으로 자동 반영됩니다.</small>';
  b.onclick=e=>{ e.stopPropagation(); p.classList.toggle('on'); };
  document.addEventListener('click',e=>{ if(!p.contains(e.target)) p.classList.remove('on'); });
  h1.insertAdjacentElement('afterend', b); document.body.appendChild(p);
})();
</script>"""
k=out.rfind('</body>'); out=out[:k]+PRINTFIX+out[k:]
open('SBR_v12.html','w',encoding='utf-8').write(out)
print(len(out))
