import json, sys, re
old=open('old.html',encoding='utf-8').read()
a=old.find('<script id="data"')
pre=old[:a]
data=json.load(open(sys.argv[1])); out=sys.argv[2]
G=data['geo']
# 텍스트 교체
pre=pre.replace('<title>월정 SBR #2 유동해석</title>', f'<title>{G["site_short"]} 유동해석</title>')
pre=re.sub(r'<h1>.*?</h1>', f'<h1>{G["title"]}</h1>', pre, flags=re.S)
pre=re.sub(r'<span class="tag">.*?</span>', f'<span class="tag">{G["tag"]}</span>', pre, flags=re.S)
i=pre.index('<section>\n      <div class="lab">인버터 주파수'); j=pre.index('</section>',i)+len('</section>')
pre=pre[:i]+'<section>\n      <div class="lab">주파수별 바닥 저속 면적 (바닥 위 0.2 m · 각 점이 실제 해석)</div>\n      <div class="cw"><svg id="hzc" viewBox="0 0 330 170" role="img" aria-label="주파수별 바닥 저속 면적"></svg></div>\n    </section>'+pre[j:]
pre=pre.replace('<div class="lab">해석 케이스</div>','<div class="lab">해석 케이스 (인버터 주파수 · 각각 별도 해석)</div>')
pre=pre.replace('<div class="presets" id="cases"></div>','<div class="presets p4" id="cases"></div>')
pre=re.sub(r'<div class="lab">정체 지점 \(.*?\)</div>','<div class="lab" id="spotlab">정체 지점</div>',pre)
i=pre.index('<p class="note"><strong>모델 한계</strong>'); j=pre.index('</section>',i)
pre=pre[:i]+''.join(f'<p class="note"><strong>{k}</strong> {v}</p>\n      ' for k,v in G['notes'])+pre[j:]
pre=pre.replace('<label><input id="cS" type="checkbox" checked> 벽·기둥</label>','<label><input id="cS" type="checkbox" checked> 벽·헌치·십자구조물</label>')
js=open(__import__('os').environ.get('VJS','viewer2.js'),encoding='utf-8').read()
html=pre+'<script id="data" type="application/json">'+json.dumps(data,ensure_ascii=False,separators=(',',':'))+'</script>\n<script>\n'+js+'\n</script>\n</body>\n</html>\n'
open(out,'w',encoding='utf-8').write(html); print(len(html))
