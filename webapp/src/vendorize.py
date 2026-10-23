# SBR_v12.html → (1) claude.ai 페이지용 index.html  (2) 데스크톱 앱용 index.html  — 라이브러리 경로를 ./vendor/ 로 바꿈
import re,sys
src,mode,out=sys.argv[1],sys.argv[2],sys.argv[3]
s=open(src,encoding='utf-8').read()
REP={"https://cdn.jsdelivr.net/npm/@mlightcad/libredwg-web@0.7.14/":"./vendor/libredwg-web/",
     "https://cdn.jsdelivr.net/npm/three@0.160.0/":"./vendor/three/",
     "https://cdn.jsdelivr.net/npm/jszip@3.10.1/":"./vendor/jszip/",
     "https://cdn.jsdelivr.net/npm/libarchive.js@2.0.2/":"./vendor/libarchive/"}
for a,b in REP.items(): s=s.replace(a,b)
assert 'cdn.jsdelivr' not in s, 'CDN 주소 남음'
if mode=='artifact':
    for pat in [r'(?is)<!doctype[^>]*>',r'(?is)<html[^>]*>',r'(?is)<head[^>]*>',r'(?is)</head>',r'(?is)<body[^>]*>',r'(?is)</body>',r'(?is)<title>.*?</title>']: s=re.sub(pat,'',s,count=1)
    s=re.sub(r'(?is)</html>\s*$','',s.rstrip()); s=re.sub(r'(?i)<meta\s+charset[^>]*>','',s); s=re.sub(r'(?i)<meta\s+name="viewport"[^>]*>','',s)
    s='<title>SBR 설계검토</title>\n<style>#printBtn{display:none!important}body{background:#f6f7f5}</style>\n'+s.lstrip()
    s=s.replace("인터넷 연결 필요(도면 해석 모듈)","").replace("도면 해석은 인터넷 연결 필요","도면 해석 모듈 포함").replace('�','\\ufffd')
else:
    s=s.replace("인터넷 연결 필요(도면 해석 모듈)","인터넷 연결 불필요(데스크톱 앱)").replace("도면 해석은 인터넷 연결 필요","데스크톱 앱 — 인터넷 연결 불필요")
open(out,'w',encoding='utf-8').write(s); print('ok',mode,len(s))
