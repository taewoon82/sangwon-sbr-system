// ===== v12: 설계도면(DWG, 여러 장) · 시방서(PDF) 대조 · 압축파일 · 첨부 상태 · 검토서 엑셀 출력 (3D 업데이트 중) =====
const CDN = {
  dwg:  "https://cdn.jsdelivr.net/npm/@mlightcad/libredwg-web@0.7.14/dist/libredwg-web.js",
  wasm: "https://cdn.jsdelivr.net/npm/@mlightcad/libredwg-web@0.7.14/wasm/",
  three:"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
  orbit:"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js",
  css2d:"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/renderers/CSS2DRenderer.js",
  gltf: "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/exporters/GLTFExporter.js",
  jszip:"https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
};
const V9 = { xls:null, xlsName:"", dwg:null, dwgName:"", over:{}, pick:{}, lib:null, mod:null };
// 십자구조물 표준 치수 (터빈 형식별, m) — 확인된 형식만. 나머지는 1250형 비례 추정
const CROSS = { 1250:{w:2.5,h:1.2,t:0.2,ok:true} };
function crossDims(turbMm){ const c=CROSS[turbMm]; if(c) return {...c}; const k=(turbMm||1250)/1250; return {w:Math.round(2.5*k*10)/10, h:Math.round(1.2*k*10)/10, t:0.2, ok:false}; }
const V9KEY = "turbine_sizing_v9_dwg";
const n2 = v => v==null||!isFinite(v) ? "–" : (Math.round(v*100)/100).toLocaleString(undefined,{maximumFractionDigits:2});
const h = s => String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const tick = () => new Promise(r=>setTimeout(r,30));

// ---------- 용량계산서(엑셀) 추가 항목: 유량조정조 · 처리수조 · 배출장치 · 산소공급능력 ----------
function capExtra(wb){
  const name = wb.SheetNames.find(n=>/용량\s*계산/.test(n)) || wb.SheetNames[wb.SheetNames.length-1];
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:null});
  const S = r => (r||[]).map(v=>v==null?"":String(v)).join(" | ");
  const tn = s => parseFloat(String(s).replace(/,/g,""));
  const out = {sheet:name};
  for(let i=0;i<Math.min(6,rows.length);i++){
    const t=S(rows[i]); const m=t.match(/([\d,]+(?:\.\d+)?)\s*(?:㎥|m3|m³)\s*\/\s*일/);
    if(m){ out.cap=tn(m[1]); const s=t.match(/^\s*\d+(?:\.\d+)*\s+(.+?)\s*-\s*[\d,]/); if(s) out.site=s[1].replace(/\s*용량\s*계산서\s*$/,"").trim(); break; }
  }
  const secs=[]; rows.forEach((r,i)=>{ const a=r&&r[0]!=null?String(r[0]).trim():""; const m=a.match(/^\d\)\s*(.+)$/); if(m) secs.push({i,name:m[1]}); });
  const range = re => { const k=secs.findIndex(s=>re.test(s.name)); return k<0?null:[secs[k].i, k+1<secs.length?secs[k+1].i:rows.length]; };
  const valAfter = (r,ci) => { for(let c=ci+1;c<r.length;c++){ const v=r[c]; if(typeof v==="number"&&isFinite(v)) return {v,c}; if(typeof v==="string"&&/^\s*-?\d[\d,]*(\.\d+)?\s*$/.test(v)) return {v:tn(v),c}; } return null; };
  const find = (rg,re,from) => { if(!rg) return null; for(let i=(from??rg[0]);i<rg[1];i++){ const r=rows[i]||[]; for(let c=0;c<r.length;c++){ if(r[c]!=null && re.test(String(r[c]))){ const f=valAfter(r,c); if(f) return {v:f.v, at:name+"!"+XLSX.utils.encode_cell({r:i,c:f.c})}; } } } return null; };
  const spec = rg => { if(!rg) return null; for(let i=rg[0];i<rg[1];i++) if((rows[i]||[]).some(v=>v!=null&&/규\s*격/.test(String(v)))) return i; return rg[0]; };
  const tank = (rg,pfx) => { if(!rg) return; const s=spec(rg);
    out[pfx+"W"]=find(rg,/폭\s*\(W\)/,s); out[pfx+"L"]=find(rg,/길\s*이\s*\(L\)/,s); out[pfx+"He"]=find(rg,/유효\s*수심/,s); out[pfx+"N"]=find(rg,/▶\s*지\s*수/,s); };
  tank(range(/유량\s*조정조/),"eq");
  { const eqR=range(/유량\s*조정조/); if(eqR){ out.eqT=find(eqR,/체류\s*시간\s*\(T\)/); out.eqVe=find(eqR,/▶\s*유효\s*용량/); } }
  const dec = range(/배출\s*장치/);
  tank(dec,"ef");
  out.decMin = find(dec,/배출\s*시간/);
  { const vmRow=find(dec,/\(Vm\)|필요용량/); if(vmRow) out.efVm=vmRow; }
  out.decQ = find(dec,/설계\s*유입량\s*\(Q\)/);
  const q = find(dec,/QIN\s*=/); if(q) out.qin = {v:q.v<1? q.v*1000 : q.v, at:q.at};
  if(dec){ for(let i=dec[0];i<dec[1];i++){ const r=rows[i]||[]; if(!r.some(v=>v!=null&&/Decanter\s*설치|배출장치\s*설치/i.test(String(v)))) continue;
      r.forEach((v,c)=>{ if(v==null) return; const s=String(v).trim(); let m;
        if((m=s.match(/^A\s*(\d{2,3})$/))) out.decSize={v:+m[1], at:name+"!"+XLSX.utils.encode_cell({r:i,c})};
        if((m=s.match(/^(\d+(?:\.\d+)?)\s*kw$/i))) out.winch={v:+m[1], at:name+"!"+XLSX.utils.encode_cell({r:i,c})}; }); } }
  const sbrR = range(/SBR|생물\s*반응조/);
  if(sbrR){ for(let i=sbrR[0];i<sbrR[1];i++){ const r=rows[i]||[]; if(!r.some(v=>v!=null&&/VF\s*\/\s*VT/.test(String(v)))) continue;
      for(let k=i;k<=i+2&&k<sbrR[1];k++){ const vs=(rows[k]||[]).filter(v=>typeof v==="number"&&v>0.15&&v<0.85); if(vs.length){ out.vfvt={min:Math.min(...vs), vals:[...new Set(vs)], at:name+"!"+(k+1)}; break; } } if(out.vfvt) break; } }
  const aer = range(/산기|포기|혼합/);
  out.o2 = find(aer,/▶\s*용\s*량/);
  if(out.o2 && aer){ for(let i=aer[0];i<aer[1];i++){ const r=rows[i]||[]; if(!r.some(v=>v!=null&&/▶\s*용\s*량/.test(String(v)))) continue;
      const vs=[]; r.forEach((v,c)=>{ if(typeof v==="number"&&isFinite(v)&&r.slice(c+1,c+3).some(u=>u!=null&&/kg\s*O/i.test(String(u)))) vs.push({v,c}); });
      if(vs.length>1){ const mx=vs.reduce((a,b)=>b.v>a.v?b:a); out.o2={v:mx.v, at:name+"!"+XLSX.utils.encode_cell({r:i,c:mx.c}), cases:vs.map(o=>o.v)}; } break; } }
  return out;
}

// ---------- 대조 모델 ----------
function dimPick(votes, target){
  if(!votes||!votes.length) return {v:null, match:false, cands:[]};
  const all = votes.map(o=>({v:o.v/1000, n:o.n}));
  const cands = all.slice(0,8);
  if(target>0){ const m=all.find(c=>Math.abs(c.v-target)/target<=0.01); if(m){ if(!cands.includes(m)) cands.push(m); return {v:m.v, match:true, cands}; } }
  return {v:null, match:false, cands};
}
function model(){
  const X=V9.xls||{}, D=V9.dwg, val=o=>o&&o.v!=null?o.v:null;
  const fromApp = id => { const e=$(id); return e && e.value!=="" && isFinite(parseFloat(e.value)) ? parseFloat(e.value) : null; };
  const rows=[];
  const add=(grp,key,lab,unit,xls,dwg,opt={})=>rows.push({grp,key,lab,unit,xls,dwg,...opt});
  const W=fromApp("W"), L=fromApp("L"), T=fromApp("T"), nT=fromApp("nTank");
  const s=D&&levelPick(D.sbr,"sbr",T), e=D&&levelPick(D.eq,"eq",val(X.eqHe));
  V9.lv={s,e};
  const pW=dimPick(D&&D.sbr.dimVotes, W), pL=dimPick(D&&D.sbr.dimVotes, L);
  const lv=(a,b)=>a!=null&&b!=null? Math.round((a-b)*1000)/1000 : null;
  add("SBR 반응조","W","가로 W","m",W, V9.pick.W ?? pW.v,{cands:pW.cands, src:"웹앱 Ⓑ (용량계산서)"});
  add("SBR 반응조","L","세로 L","m",L, V9.pick.L ?? pL.v,{cands:pL.cands});
  const noLv = D && D.sbr && D.sbr.cand && !D.sbr.cand.hwl.length && !D.sbr.cand.el.length;
  add("SBR 반응조","He","HWL 수심 (유효수심)","m",T, s?lv(s.hwl,s.bottom):null,{dnote:s&&s.hwl!=null?`HWL EL.${s.hwl} − 바닥 EL.${s.bottom}`: noLv?"도면에 수위·EL 표기 없음 (평면도) — 단면도 필요":""});
  add("SBR 반응조","Lw","LWL 수심","m",null, s?lv(s.lwl,s.bottom):null,{dnote:s&&s.lwl!=null?`LWL EL.${s.lwl}`:""});
  add("SBR 반응조","Fb","여유고 (HWL ~ 상부)","m",null, s?lv(s.top,s.hwl):null,{dnote:s&&s.top!=null?`상부 EL.${s.top}`:""});
  add("SBR 반응조","N","반응조 지수","지",nT, D&&D.sbr.n);
  const eW=val(X.eqW), eL=val(X.eqL);
  const peW=dimPick(D&&D.eq.dimVotes,eW), peL=dimPick(D&&D.eq.dimVotes,eL);
  add("유량조정조","eqW","가로 W","m",eW, V9.pick.eqW ?? peW.v,{cands:peW.cands});
  add("유량조정조","eqL","세로 L","m",eL, V9.pick.eqL ?? peL.v,{cands:peL.cands});
  add("유량조정조","eqHe","유효수심","m",val(X.eqHe), e&&(e.matched||!(val(X.eqHe)>0))?(e.noLwl?lv(e.hwl,e.bottom):lv(e.hwl,e.lwl)):null,{dnote:e&&e.hwl!=null&&(e.matched||!(val(X.eqHe)>0))?(e.noLwl?`HWL(D.W.L) EL.${e.hwl} − 바닥 EL.${e.bottom} (${e.lwlSeen?"LWL 표기로는 계산서 수심과 안 맞아 바닥 기준으로 대조":"도면에 LWL 표기 없음"})`:`HWL EL.${e.hwl} / LWL EL.${e.lwl}`):""});
  add("유량조정조","eqN","지수","지",val(X.eqN), D&&D.eq.n);
  const f=D&&D.ef&&{...levelPick(D.ef,"ef",val(X.efHe)), dimVotes:D.ef.dimVotes}, pfW=dimPick(f&&f.dimVotes,val(X.efW)), pfL=dimPick(f&&f.dimVotes,val(X.efL));
  V9.lv.f=f;
  add("처리수조","efW","가로 W","m",val(X.efW), V9.pick.efW ?? pfW.v,{cands:pfW.cands});
  add("처리수조","efL","세로 L","m",val(X.efL), V9.pick.efL ?? pfL.v,{cands:pfL.cands});
  add("처리수조","efHe","유효수심 (HWL − 바닥)","m",val(X.efHe), f&&f.hwl!=null&&f.bottom!=null&&(f.matched||!(val(X.efHe)>0))?lv(f.hwl,f.bottom):null,{dnote:f&&f.hwl!=null?`HWL EL.${f.hwl} − 바닥 EL.${f.bottom}`:""});
  add("처리수조","efN","지수","지",val(X.efN),null);
  const sz=($("hSize")?.textContent||"").match(/(\d{3,4})/);
  add("포기장치 · 배출장치","turb","포기장치 터빈 (웹앱 선정)","Ø mm", sz?+sz[1]:null, null,{dtxt:D&&D.aerator?`${D.aerator.code} ${D.aerator.name}`:"", xsrc:"웹앱 선정",noCmp:1});
  add("포기장치 · 배출장치","kw","설계 소요동력 (웹앱, 여유율 적용)","kW", designKW(), null,{xsrc:"웹앱 산정",noCmp:1});
  add("포기장치 · 배출장치","o2","산소공급능력 (지당, 최대 케이스)","kgO₂/h", val(X.o2), null,{noCmp:1, xsrc:X.o2&&X.o2.cases?`케이스별 ${X.o2.cases.join(" / ")}`:""});
  const dp=D&&D.decPipe;
  add("포기장치 · 배출장치","dsz","배출장치 구경","A", val(X.decSize), dp?dp.a:null,{dtxt:D&&D.decanter?`${D.decanter.code} ${D.decanter.name}`:"", dnote:dp?`반응조 주변 처리수(TW) 배관 표기 ${dp.n}곳${Object.keys(dp.sizes).length>1?` (그 외 ${Object.entries(dp.sizes).filter(([a])=>+a!==dp.a).map(([a,n])=>a+"A "+n+"곳").join(", ")})`:""}${D.decanter?` · ${D.decanter.code} ${D.decanter.name}`:""}`:""});
  add("포기장치 · 배출장치","qin","배출유량 (QIN)","L/s", val(X.qin), null,{noCmp:1});
  add("포기장치 · 배출장치","decQ","배출 대상 유량 (잉여슬러지 인발 후)","㎥/d", val(X.decQ), null,{noCmp:1});
  add("포기장치 · 배출장치","winch","전동윈치 동력","kW", val(X.winch), null,{noCmp:1});
  add("포기장치 · 배출장치","dt","배출단계 시간","hr", X.decMin? Math.round(X.decMin.v/60*1000)/1000 : null, null,{noCmp:1});
  add("포기장치 · 배출장치","hoist","반응조 상부 호이스트","", null, null,{dtxt:D? (D.hoist?`있음 · ${D.hoist.code} ${hoistName(D.hoist.name)}`:"도면에서 못 찾음"):"",noCmp:1});
  if(D){ const pp=D.pumps||{}, pt=(p,miss)=>p?`${p.code} ${p.name}${p.others&&p.others.length?` (그 외 ${p.others.join(", ")})`:""}${p.pipe?` · 주변 배관 ${p.pipe.label} (${p.pipe.n}곳)`:""}${p.fromTable?" · 도면 기기일람표":" · 용량·동력은 장비일람표 확인"}`:miss;
    add("펌프 (도면)","feedP","공급펌프 (유량조정조 → 반응조)","",null,null,{noCmp:1,dtxt:pt(pp.feed,"도면에서 못 찾음")});
    add("펌프 (도면)","effP","처리수 이송(총인 공급) 펌프","",null,null,{noCmp:1,dtxt:pt(pp.eff,"도면에서 못 찾음")}); }
  if(D&&D.equipTable&&D.equipTable.length){ const row=(k,lab,e)=>add("기기목록표 (도면)",k,lab,"",null,null,{noCmp:1,dtxt:e?`${e.code} · ${fmtQty(e)}`:"표에 없음"});
    row("tAer","포기장치",D.eqAer); row("tDec","배출장치",D.eqDec); row("tFeed","반응조 공급펌프",D.eqFeed); row("tWas","잉여슬러지 펌프",D.eqWas); row("tEff","처리수 이송(총인 공급) 펌프",D.eqEff); }
  const SP=V9.spec;
  if(SP){ const u=(e,k)=>e&&e[k]?e[k]:null, cv=(e,unit)=>{ const c=u(e,"cap"); if(!c) return null; if(c.unit===unit) return c.v; if(unit==="㎥/min"&&c.unit==="㎥/h") return Math.round(c.v/60*1000)/1000; if(unit==="㎥/min"&&c.unit==="㎥/d") return Math.round(c.v/1440*1000)/1000; return null; };
    const sx=(e)=>e?`${e.no||""} ${e.name}${e.tag?` (${e.tag})`:""}`.trim():"시방서에 없음";
    add("장비 사양 (시방서·도면 기기일람표)","sAerKw","포기장치 동력 (사양)","kW", designKW(), u(SP.aer,"kw")?SP.aer.kw.v:null,{xsrc:"웹앱 설계 소요동력",dnote:SP.aer?`${sx(SP.aer)} ${SP.aer.kw?SP.aer.kw.label:""}${SP.aer.kwNote?" · "+SP.aer.kwNote:""}`:"",cmp:"ge"});
    add("장비 사양 (시방서·도면 기기일람표)","sAerO2","포기장치 용량 (사양)","kgO₂/h", val(X.o2), SP.aer&&SP.aer.cap&&SP.aer.cap.unit==="kgO₂/h"?SP.aer.cap.v:null,{xsrc:"계산서 최대",dnote:SP.aer?sx(SP.aer):"",cmp:"ge"});
    add("장비 사양 (시방서·도면 기기일람표)","sDecQ","배출장치 용량 (사양)","L/s", val(X.qin), SP.dec&&SP.dec.cap&&SP.dec.cap.unit==="L/s"?SP.dec.cap.v:null,{xsrc:"계산서 QIN",dnote:SP.dec?sx(SP.dec):"",cmp:"ge"});
    add("장비 사양 (시방서·도면 기기일람표)","sWinch","배출장치(윈치) 동력 (사양)","kW", val(X.winch), u(SP.dec,"kw")?SP.dec.kw.v:null,{dnote:SP.dec?sx(SP.dec):"",noCmp:!val(X.winch)});
    add("장비 사양 (시방서·도면 기기일람표)","sFeedQ","공급펌프 용량 (사양)","㎥/min", null, cv(SP.feed,"㎥/min"),{dnote:sx(SP.feed),noCmp:1});
    add("장비 사양 (시방서·도면 기기일람표)","sFeedKw","공급펌프 동력 (사양)","kW", null, u(SP.feed,"kw")?SP.feed.kw.v:null,{noCmp:1});
    if(SP.panel) add("장비 사양 (시방서·도면 기기일람표)","sPanel","공법(반응조) 제어반 (사양)","",null,null,{noCmp:1,dtxt:[SP.panel.no+" "+SP.panel.name, SP.panel.whd, SP.panel.mat, SP.panel.loc].filter(Boolean).join(" · ")});
    add("장비 사양 (시방서·도면 기기일람표)","sTp","총인설비 처리용량 (사양)","㎥/d", val(X.decQ)??(num("q_0")||null), SP.tp&&SP.tp.cap&&SP.tp.cap.unit==="㎥/d"?SP.tp.cap.v:null,{xsrc:val(X.decQ)!=null?"처리수량(배출 대상)":"설계유량",dnote:SP.tp?sx(SP.tp):"",cmp:"ge"});
  }
  const P=planLayout(A0(rows,"W"),A0(rows,"L"),A0(rows,"N"));
  if(P){ const inside=P.cols.filter(c=>c.inside).length;
    add("평면 배치 (도면)","pos","포기장치 위치 (반응조 중심 기준)","m",null,null,{noCmp:1,dtxt:P.aer.filter(Boolean).length?P.aer.map((a,i)=>a?`#${i+1} ${Math.abs(a.ox)<0.05&&Math.abs(a.oz)<0.05?"중심":`편심 x${a.ox>=0?"+":""}${n2(a.ox)} · y${a.oz>=0?"+":""}${n2(a.oz)}`} (${a.src})`:`#${i+1} 못 찾음`).join(" / "):"도면에서 못 찾음 → 중심 가정"});
    add("평면 배치 (도면)","decpos","배출장치 위치","",null,null,{noCmp:1,dtxt:P.dec.filter(Boolean).length?P.dec.map((d,i)=>d?`#${i+1} ${d.wallName} 벽체`:`#${i+1} 못 찾음`).join(" / "):"도면에서 못 찾음 → 뒤쪽 벽 가정"});
    add("평면 배치 (도면)","cols","기둥 (반응조 주변 1.2m 이내)","개",null,null,{noCmp:1,dtxt:`${P.cols.length}개 · 반응조 내부 ${inside}개${inside?" ⚠":""}`});
  }
  V9.plan=P;
  for(const r of rows){
    r.apply = V9.over[r.key]!=null ? V9.over[r.key] : (r.xls ?? r.dwg ?? null);
    if(r.cmp==="ge" && r.xls!=null && r.dwg!=null){ r.st = r.dwg >= r.xls*0.99 ? "충족" : "부족"; continue; }
    if(r.xls!=null && r.dwg!=null){ const d=Math.abs(r.xls-r.dwg), tol=Math.max(0.01, Math.abs(r.xls)*0.01); r.st = d<=tol?"일치":"불일치"; }
    else if(r.noCmp) r.st="";
    else r.st = r.xls!=null? "계산서만" : r.dwg!=null? "도면만" : "";
    if(r.key==="N" && r.st==="불일치" && V9.dwg && V9.dwg.eqAer && qtyAll(V9.dwg.eqAer)===r.dwg && (qtyNow(V9.dwg.eqAer)||{}).n===r.xls){ r.st="단계"; r.dnote=`도면 ${r.dwg}지 = 기기목록표 포기장치 ${fmtQty(V9.dwg.eqAer)} · 금회(1단계) ${r.xls}지`; }
    if(r.key==="N" && r.st==="불일치" && V9.spec && V9.spec.aer && V9.spec.aer.qtyAll && r.dwg===V9.spec.aer.qtyAll && r.xls===V9.spec.aer.qty){ r.st="단계"; r.dnote=`도면 ${r.dwg}지 = ${V9.spec.aer.phases}단계 전체 · 금회 ${r.xls}지 (시방서 수량)`; }
  }
  return rows;
}
// 수위 후보 중 용량계산서 수심과 맞는 조합 선택 (sbr/ef: HWL−바닥, eq: HWL−LWL)
function levelPick(t, mode, He){
  if(!t) return null;
  const base={hwl:t.hwl,lwl:t.lwl,bottom:t.bottom,top:t.top,matched:false};
  const C=t.cand; if(!C||!(He>0)) return base;
  let best=null;
  if(mode==="eq"){ for(const h of C.hwl) for(const l of C.lwl){ if(Math.abs(h.v-l.v-He)<=0.02){ const sc=h.d+l.d; if(!best||sc<best.sc) best={sc,hwl:h.v,lwl:l.v}; } }
    if(best){ const b=C.el.filter(e=>e.v<best.lwl).sort((a,c)=>a.d-c.d)[0]; best.bottom=b?b.v:null; }
    if(!best){ for(const h of C.hwl) for(const b of C.el){ if(Math.abs(h.v-b.v-He)<=0.02){ const sc=h.d+b.d; if(!best||sc<best.sc) best={sc,hwl:h.v,bottom:b.v,lwl:null,noLwl:true,lwlSeen:C.lwl.length>0}; } } } }
  else { for(const h of C.hwl) for(const b of C.el){ if(Math.abs(h.v-b.v-He)<=0.02){ const sc=h.d+b.d; if(!best||sc<best.sc) best={sc,hwl:h.v,bottom:b.v}; } }
    if(best){ const l=C.lwl.filter(x=>x.v>best.bottom&&x.v<best.hwl).sort((a,c)=>a.d-c.d)[0]; best.lwl=l?l.v:null; } }
  if(!best) return base;
  const tops=C.el.filter(e=>e.v>best.hwl+0.05&&e.v-best.hwl<3.5).sort((a,c)=>a.d-c.d);
  best.top = (t.top!=null&&t.top>best.hwl&&t.top-best.hwl<3.5)? t.top : (tops[0]?tops[0].v:null);
  best.matched=true; return best;
}
function A0(rows,k){ const r=rows.find(r=>r.key===k); if(!r) return null; return V9.over[k]!=null?V9.over[k]:(r.xls??r.dwg??null); }
// 도면 평면에서 반응조 내부 사각형·기기 블록·기둥을 찾아 3D 좌표(m)로 변환
function planLayout(W,L,nT){
  const D=V9.dwg; if(!D||!D.sbr||!D.sbr.spans||!(W>0&&L>0)) return null;
  const u=D.unit||1, near=(m,t)=>Math.abs(m/1000/u-t)/t<=0.01;
  const rects=[];
  for(const sp of D.sbr.spans){
    const xs=sp.s.filter(s=>s.ax==="x"&&near(s.m,W)), ys=sp.s.filter(s=>s.ax==="y"&&near(s.m,L));
    const xs2=sp.s.filter(s=>s.ax==="x"&&near(s.m,L)), ys2=sp.s.filter(s=>s.ax==="y"&&near(s.m,W));
    const X=xs[0]||xs2[0], Y=ys[0]||ys2[0]; if(!X||!Y) continue;
    if(!rects.some(r=>Math.abs(r.x0-X.a)<100*u&&Math.abs(r.y1-Y.b)<100*u)) rects.push({x0:X.a,x1:X.b,y0:Y.a,y1:Y.b});
  }
  if(!rects.length) return null;
  rects.sort((a,b)=>a.x0-b.x0||b.y1-a.y1);
  const R0=rects[0], t=0.5;
  const toX=x=>t+(x-R0.x0)/1000/u, toZ=y=>(R0.y1-y)/1000/u;
  const toXr={}, toZr={};
  const inR=(p,r,m=0)=>p.x>r.x0-m&&p.x<r.x1+m&&p.y>r.y0-m&&p.y<r.y1+m;
  const aer=[], dec=[];
  rects.forEach((r,i)=>{ const cx=(r.x0+r.x1)/2, cy=(r.y0+r.y1)/2;
    let a=(D.blocks?.aer||[]).find(b=>inR(b,r)), src="블록";
    if(!a){ // 블록이 없으면: 반응조 안의 동심원(터빈 외곽선) 중심
      const cs=(D.cir||[]).filter(c=>inR(c,r,-300*u)&&c.r<=1300*u);
      const grp=cs.map(c=>({c,n:cs.filter(o=>Math.hypot(o.x-c.x,o.y-c.y)<60*u).length,rmax:Math.max(...cs.filter(o=>Math.hypot(o.x-c.x,o.y-c.y)<60*u).map(o=>o.r))}));
      grp.sort((p,q)=>q.n-p.n||Math.hypot(p.c.x-cx,p.c.y-cy)-Math.hypot(q.c.x-cx,q.c.y-cy));
      if(grp[0]&&grp[0].n>=2){ a={x:grp[0].c.x,y:grp[0].c.y}; src=`도면 원(최대 Ø${Math.round(grp[0].rmax*2/u)})`; } }
    if(a) aer[i]={_x:a.x,_y:a.y,x:toX(a.x),z:toZ(a.y),ox:(a.x-cx)/1000/u,oz:(cy-a.y)/1000/u,src};
    let d=(D.blocks?.dec||[]).find(b=>inR(b,r,800*u));
    if(!d){ const pts=(D.decPts||[]).filter(p=>inR(p,r,1000*u)); if(pts.length>=4) d={x:pts.reduce((s,p)=>s+p.x,0)/pts.length,y:pts.reduce((s,p)=>s+p.y,0)/pts.length,fromLayer:true}; }
    if(d){ const dd=[["뒤쪽(도면 위)",r.y1-d.y,"z0"],["앞쪽(도면 아래)",d.y-r.y0,"z1"],["왼쪽",d.x-r.x0,"x0"],["오른쪽",r.x1-d.x,"x1"]].sort((p,q)=>Math.abs(p[1])-Math.abs(q[1]))[0];
      dec[i]={_x:d.x,_y:d.y,x:toX(d.x),z:toZ(d.y),wall:dd[2],wallName:dd[0]+(d.fromLayer?" (DECANTER 레이어)":"")}; } });
  // 같은 반응조가 여러 평면도(상부층·하부층)에 반복되면: 기기 위치를 찾은 평면의 연속된 nT개만 사용
  { const n=Math.max(1,Math.round(nT||1)); const sc=rects.map((r,i)=>(aer[i]?2:0)+(dec[i]?1:0));
    const groups=[]; let g=[0]; for(let i=1;i<rects.length;i++){ const p=rects[i-1], q=rects[i]; if(Math.abs(q.y1-p.y1)<200*u && q.x0-p.x1>0 && q.x0-p.x1<1500*u) g.push(i); else { groups.push(g); g=[i]; } } groups.push(g);
    let best=null; for(const gr of groups){ for(let s=0;s+n<=gr.length;s++){ const idx=gr.slice(s,s+n), tot=idx.reduce((a,i)=>a+sc[i],0); if(!best||tot>best.tot) best={idx,tot}; } }
    if(!best){ best={idx:rects.map((_,i)=>i).sort((a,b)=>sc[b]-sc[a]).slice(0,n)}; best.idx.sort((a,b)=>a-b); }
    const keep=best.idx; const nr=keep.map(i=>rects[i]), na=keep.map(i=>aer[i]), nd=keep.map(i=>dec[i]);
    rects.length=0; rects.push(...nr); aer.length=0; aer.push(...na); dec.length=0; dec.push(...nd);
    const R1=rects[0]; const tX=x=>t+(x-R1.x0)/1000/u, tZ=y=>(R1.y1-y)/1000/u;
    // 좌표 재계산 (기준 반응조가 바뀌었을 수 있음)
    aer.forEach((a,i)=>{ if(a){ a.x=tX(a._x); a.z=tZ(a._y); } }); dec.forEach((d,i)=>{ if(d){ d.x=tX(d._x); d.z=tZ(d._y); } });
    toXr.f=tX; toZr.f=tZ; }
  const m=1200*u, cols=(D.cols||[]).filter(c=>rects.some(r=>inR(c,r,m))).map(c=>({x:toXr.f(c.x),z:toZr.f(c.y),w:c.w/1000/u,h:c.h/1000/u,inside:rects.some(r=>inR(c,r,-50*u))}));
  return {rects:rects.map(r=>({x0:toXr.f(r.x0),x1:toXr.f(r.x1),z0:toZr.f(r.y1),z1:toZr.f(r.y0)})),aer,dec,cols};
}
function designKW(){ const t=($("powerOut")?.innerText||""); const m=t.match(/설계 소요동력[\s\S]*?([\d.,]+)\s*kW/); return m? parseFloat(m[1].replace(/,/g,"")) : null; }
function hoistName(s){ return String(s||"").replace(/(호이스트(?:\s*[A-Z](?![가-힣]))?).*$/,"$1"); }
function srcL(e){ return e&&(e.approval||e.src&&/승인도서/.test(e.src))?"승인도서":e&&e.fromTable?"도면 기기일람표":"시방서"; }
function capTxt(e){ return e&&e.cap?`${e.cap.v.toLocaleString()} ${e.cap.unit}${e.head?` × H${e.head}m`:""}`:""; }
function fmtQty(e){ if(!e||!e.qty) return ""; const ks=Object.keys(e.qty).sort(); return ks.length>1? ks.map(k=>`${k}단계 ${e.qty[k]}`).join(" / ") : `수량 ${e.qty[ks[0]]}`; }
function qtyNow(e){ if(!e||!e.qty) return null; const q=e.qty["1"]??Object.values(e.qty)[0]; const m=String(q||"").match(/^(\d+)(?:\((\d+)\))?$/); return m?{n:+m[1],spare:m[2]?+m[2]:0,raw:q}:null; }
function qtyAll(e){ if(!e||!e.qty) return null; let s=0; for(const v of Object.values(e.qty)){ const m=String(v).match(/^(\d+)/); if(m) s+=+m[1]; } return s; }
function noLvLwl(){ const s=V9.lv&&V9.lv.s; return !!(s && s.lwl==null); }
function noLevel(){ const D=V9.dwg; return !!(D && D.sbr && D.sbr.cand && !D.sbr.cand.hwl.length && !D.sbr.cand.el.length); }
const A = (rows,k) => { const r=rows.find(r=>r.key===k); return r? r.apply : null; };

// ---------- 대조표 렌더 ----------
function renderCmp9(){
  const rows=model(); let html=`<tr><th>구분</th><th>항목</th><th>단위</th><th>용량계산서 · 웹앱</th><th>설계도면 (DWG) · 시방서</th><th>대조</th><th>적용값</th></tr>`, g="";
  for(const r of rows){
    if(r.grp!==g){ g=r.grp; html+=`<tr class="grp"><td colspan="7">${g}</td></tr>`; }
    let dcell = r.dtxt!=null && r.dwg==null ? h(r.dtxt||"–") : n2(r.dwg);
    if(r.cands && r.cands.length && V9.dwg){
      const cur = r.dwg;
      dcell = `<select data-pick="${r.key}"><option value="">${cur==null?"선택 (자동판별 실패)":"–"}</option>${r.cands.map(c=>`<option value="${c.v}" ${cur!=null&&Math.abs(cur-c.v)<1e-6?"selected":""}>${n2(c.v)} m (${c.n}회)</option>`).join("")}</select>`;
    }
    if(r.dnote) dcell += ` <small>${h(r.dnote)}</small>`;
    const st = r.st==="일치"||r.st==="충족"||r.st==="단계"?`<span class="ok">${r.st}</span>`: r.st==="불일치"||r.st==="부족"?`<span class="ng">${r.st}</span>`: r.st?`<span class="one">${r.st}</span>`:"";
    const ap = ["hoist","pos","decpos","cols","feedP","effP","tAer","tDec","tFeed","tWas","tEff","sPanel"].includes(r.key) ? h(r.dtxt||"–") : `<input type="number" step="0.01" data-ap="${r.key}" value="${r.apply??""}">`;
    html+=`<tr><td></td><td class="lab">${r.lab}</td><td>${r.unit}</td><td>${n2(r.xls)}${r.xsrc?` <small>${r.xsrc}</small>`:""}</td><td>${dcell}</td><td>${st}</td><td>${ap}</td></tr>`;
  }
  $("v9cmp").innerHTML=html;
  const ng=rows.filter(r=>r.st==="불일치");
  const D=V9.dwg;
  $("v9cmpNote").innerHTML = (V9.xls?`용량계산서: <b>${h(V9.xlsName)}</b> ‘${h(V9.xls.sheet)}’ 시트. `:`<span class="miss">용량계산서 엑셀을 아직 불러오지 않았습니다 (유량조정조·처리수조·배출장치 값은 엑셀에서 읽음).</span> `)+
    (D?`설계도면: <b>${h(V9.dwgName)}</b> — 문자 ${D.nText.toLocaleString()}개 · 치수 ${D.nDim.toLocaleString()}개 해석. 수위는 SBR 라벨 주변 HWL·LWL·EL 문자에서, 가로·세로는 라벨을 가로지르는 치수 중 계산서 값과 맞는 것을 찾습니다. 맞는 치수가 없으면 후보에서 직접 고르세요.`:`설계도면을 아직 불러오지 않았습니다.`)+
    (ng.length?`<br><b class="ng">불일치 ${ng.length}건:</b> ${ng.map(r=>`${r.grp} ${r.lab} (계산서 ${n2(r.xls)} / 도면 ${n2(r.dwg)})`).join(", ")} — 검토서 6번 기타 사항에 자동으로 올라갑니다.`:"");
  draw3D(rows); updAtt();
  try{ localStorage.setItem(V9KEY, JSON.stringify({xls:V9.xls,xlsName:V9.xlsName,dwg:V9.dwg,dwgName:V9.dwgName,spec:V9.spec,specName:V9.specName,over:V9.over,pick:V9.pick,designer:$("v9designer").value,reviewer:$("v9reviewer").value})); }catch(e){}
}


// ---------- 첨부 상태 (v10) ----------
const ATT={dwgBusy:false, dwgErr:"", specBusy:false, specErr:"", restored:false};
function updAtt(){
  const xn = V9.xlsName || (typeof state!=="undefined" && state.pdfName) || "";
  const set=(id,ok,label,detail,cls)=>{ const e=$(id); if(!e) return; e.className="chip "+(cls||(ok?"ok":"no")); e.innerHTML=`${label} <b>${detail}</b>`; e.title=ok?detail.replace(/<[^>]+>/g,""):""; };
  const rs=ATT.restored?` <small>(이전 작업)</small>`:"";
  set("attXls", !!xn, "📄 용량계산서", xn? `✓ ${h(xn)}${V9.xls&&V9.xls.sheet?` <small>‘${h(V9.xls.sheet)}’</small>`:""}${rs}` : "미첨부");
  const D=V9.dwg;
  if(ATT.dwgBusy) set("attDwg", false, "📐 설계도면", "해석 중…", "busy");
  else if(ATT.dwgErr) set("attDwg", false, "📐 설계도면", "읽기 실패 — 아래 Ⓓ 안내 확인", "err");
  else set("attDwg", !!D, "📐 설계도면", D? `✓ ${h(V9.dwgName)}${V9.dwgNames&&V9.dwgNames.length>1?` <small>(${V9.dwgNames.length}장)</small>`:""} <small>문자 ${D.nText.toLocaleString()} · 치수 ${D.nDim.toLocaleString()}</small>${rs}` : "미첨부");
  if(ATT.specBusy) set("attSpec", false, "📑 시방서·승인도서", "읽는 중…", "busy");
  else if(ATT.specErr) set("attSpec", false, "📑 시방서·승인도서", "읽기 실패", "err");
  else set("attSpec", !!V9.spec, "📑 시방서·승인도서", V9.spec? `✓ ${h(V9.specName)} <small>기기 ${V9.spec.items.length}개</small>${rs}` : "미첨부");
  { const en=V9.elecNames||[]; set("attElec", en.length>0, "⚡ 전기·계측 도면", en.length? `✓ ${h(en.length>1?`${en[0]} 외 ${en.length-1}개`:en[0])}` : "미첨부"); }
  const mark=(id,name)=>{ const e=$(id); if(!e) return; let s=e.querySelector(".v10done"); if(!name){ e.classList.remove("done"); if(s) s.remove(); return; } e.classList.add("done"); if(!s){ s=document.createElement("div"); s.className="v10done"; e.appendChild(s); } s.innerHTML=`✓ 첨부됨: <b>${h(name)}</b> <small>(다른 파일을 올리면 바꿉니다)</small>`; };
  mark("drop", xn); mark("v9drop", D&&!ATT.dwgBusy? V9.dwgName : ""); mark("v11drop", V9.spec&&!ATT.specBusy? V9.specName : "");
}

// ---------- DWG 불러오기 (여러 장 합쳐 읽기) ----------
// 각 도면을 블록까지 펼친 뒤 x좌표를 도면마다 크게 띄워(1e9) 겹치지 않게 합쳐서 한 번에 해석
function shiftEnt(e, dx, seen){ const go=(o,k)=>{ if(!o||typeof o!=="object"||seen.has(o)) return; seen.add(o);
    if(typeof o.x==="number"&&typeof o.y==="number"&&!/extrusion|normal|direction/i.test(k||"")) o.x+=dx;
    for(const [kk,v] of Object.entries(o)) if(v&&typeof v==="object") go(v,kk); }; go(e,""); }
async function loadDwg(file){ return loadDwgs([file]); }
async function loadDwgs(files, pdfDraws){ pdfDraws=pdfDraws||[];
  const st=$("v9stat"); const sec=$("v9sec");
  try{
    sec.classList.add("v9-busy"); ATT.dwgBusy=true; ATT.dwgErr=""; ATT.restored=false; updAtt();
    st.innerHTML=`도면 ${files.length}장 — 도면 해석 모듈 준비 중… (처음 한 번 약 11MB 내려받음)`; await tick();
    if(files.length && !V9.mod) V9.mod = await import(CDN.dwg);
    const all=[]; const ok=[], bad=[]; const elecD=[], elecN=[];
    for(let i=0;i<files.length;i++){ const file=files[i];
      st.innerHTML=`<b>${h(file.name)}</b> (${i+1}/${files.length}) — 도면 해석 중… (큰 도면은 10초 이상 걸릴 수 있습니다)`; await tick();
      try{
        const buf=new Uint8Array(await file.arrayBuffer());
        const isDxf=/\.dxf$/i.test(file.name);
        if(!isDxf && !/^AC10\d\d/.test(String.fromCharCode(...buf.slice(0,6)))) throw new Error("DWG 형식이 아님");
        // 도면마다 해석기를 새로 만듦 (같은 해석기로 두 번째 도면을 읽으면 WASM 오류가 남)
        const lib = await V9.mod.LibreDwg.create(CDN.wasm);
        const dwg=lib.dwg_read_data(buf, isDxf?V9.mod.Dwg_File_Type.DXF:V9.mod.Dwg_File_Type.DWG);
        if(!dwg) throw new Error("읽지 못함 — 오토캐드에서 DXF로 저장 후 다시");
        const db=lib.convert(dwg);
        const ents=dwgExpand(db.entities||[], (db.tables&&db.tables.BLOCK_RECORD&&db.tables.BLOCK_RECORD.entries)||[], 3);
        { const ti=elTextItems(ents); const sc=elScore(ti.map(t=>t.s)); if(sc>=40 && sc>ti.length*0.02){ elecD.push({name:file.name, items:ti}); elecN.push(file.name); continue; } }   // 전기·계측 도면은 따로
        if(i>0){ const seen=new WeakSet(); for(const e of ents) shiftEnt(e, i*1e9, seen); }
        for(const e of ents) all.push(e);
        ok.push(file.name);
      }catch(e){ bad.push(`${file.name}: ${e.message||e}`); }
    }
    V9.dwgBad=bad;
    if(elecD.length){ V9.elecDwg=elecD; V9.elecNames=[...new Set([...(V9.elecNames||[]), ...elecN])]; elRefresh(); }
    if(!ok.length && elecD.length && !pdfDraws.length){ st.innerHTML=`전기·계측 도면 ${elecD.length}장을 읽었습니다 (${elecN.map(h).join(", ")}): ${h(elSummary(V9.elec))}`; renderCmp9(); return; }
    // 그림 글자 PDF 도면: 글자 인식으로 기기일람표·단면도 수위 읽기
    V9.drawSpec=null; let ocrNote=[];
    for(const pf of pdfDraws){
      try{ const say=t=>{ st.innerHTML=`<b>${h(pf.name)}</b> — ${h(t)}`; };
        const t0=Date.now(); const r=await ocrPdfDrawing(pf, say);
        for(const e of r.texts) all.push(e);
        if(r.equip.items.length){ const src={name:`${pf.name} 기기일람표`, R:{items:r.equip.items, facts:{}}}; V9.drawSpec=src; V9.drawEquipQty=r.equip.qtyRows; }
        ok.push(pf.name); ocrNote.push(`${pf.name}: ${r.N}쪽 중 기기일람표 ${r.tablePages.length?r.tablePages.join("·")+"쪽":"없음"}, 단면도 ${r.secPages.length?r.secPages.join("·")+"쪽":"없음"} 글자 인식 (${Math.round((Date.now()-t0)/1000)}초)`);
      }catch(e){ bad.push(`${pf.name}: ${e.message||e}`); }
    }
    if(!ok.length) throw new Error(bad.join(" / "));
    const R=dwgExtract(all, []);
    if(V9.drawEquipQty && (!R.equipTable||!R.equipTable.length)){ R.equipTable=V9.drawEquipQty; const it=(V9.drawSpec&&V9.drawSpec.R.items)||[]; const by=t=>{ const e=it.find(x=>x.type===t); return e?R.equipTable.find(q=>q.code===e.tag)||null:null; };
      R.eqAer=by("aer"); R.eqDec=by("dec"); R.eqFeed=by("feed"); R.eqEff=by("eff"); R.eqWas=by("was"); }
    R.ocrNote=ocrNote;
    if(V9.drawSpec){ const it=V9.drawSpec.R.items; R.pumps=R.pumps||{}; for(const t of ["feed","eff"]){ const e=it.find(x=>x.type===t); if(e) R.pumps[t]={code:e.tag, name:e.name, d:0, n:1, others:[], fromTable:true}; } }
    if(!R.sbr.labels && !V9.drawSpec && !pdfDraws.length) throw new Error(`도면 ${ok.length}장 어디에서도 ‘SBR 반응조’ 명칭을 찾지 못했습니다`);
    if(elecD.length) R.ocrNote=[...(R.ocrNote||[]), `전기·계측 도면 ${elecD.length}장: ${elSummary(V9.elec)}`];
    V9.dwg=R; V9.dwgNames=ok; V9.dwgName=ok.length>1?`${ok[0]} 외 ${ok.length-1}장`:ok[0]; V9.pick={}; V9.over={}; ATT.dwgBusy=false;
    st.innerHTML=`설계도면 ${ok.length}장 해석 완료 (${ok.map(h).join(", ")}). 문자 ${R.nText.toLocaleString()}개 · 치수 ${R.nDim.toLocaleString()}개 · ‘SBR 반응조’ 명칭 ${R.sbr.labels}곳${R.equipTable&&R.equipTable.length?` · 기기목록표 ${R.equipTable.length}개 기기`:""}.${R.ocrNote&&R.ocrNote.length?`<br><small>글자 인식: ${R.ocrNote.map(h).join(" / ")} — 인식 결과는 대조표에서 꼭 확인하세요.</small>`:""}`+(bad.length?`<br><span class="miss">못 읽은 도면: ${bad.map(h).join(" / ")}</span>`:"");
    renderCmp9();
  }catch(e){ ATT.dwgErr=String(e&&e.message||e); st.innerHTML=`<span class="miss">도면을 읽지 못했습니다: ${h(e&&e.message?e.message:e)}</span>`; }
  finally{ sec.classList.remove("v9-busy"); ATT.dwgBusy=false; updAtt(); }
}

// ---------- 시방서 · 장비일람표 (PDF) 불러오기 (v11) ----------
async function loadSpec(file){
  const st=$("v9stat");
  try{
    ATT.specBusy=true; ATT.specErr=""; updAtt();
    st.innerHTML=`<b>${h(file.name)}</b> — 시방서 읽는 중…`; await tick();
    if(!/\.pdf$/i.test(file.name)) throw new Error("PDF 파일만 읽습니다 (HWP는 PDF로 저장해서 올려주세요)");
    const {pages}=await readPdf(new Uint8Array(await file.arrayBuffer()));
    const lines=specLinesFromPages(pages);
    if(lines.length<5) throw new Error("글자를 읽지 못했습니다 — 스캔(이미지) PDF일 수 있습니다");
    const R=specParseAll(lines);
    if(!R.items.length && !R.isApproval && elScore(lines.map(l=>l.s))>=20){ V9.elecPdf=[...(V9.elecPdf||[]).filter(x=>x.name!==file.name), ...pages.map((p,k)=>({name:file.name, page:k+1, items:p.items}))]; V9.elecNames=[...new Set([...(V9.elecNames||[]), file.name])]; elRefresh();
      st.innerHTML=`<b>${h(file.name)}</b> — 전기·계측 도면 ${pages.length}쪽: ${h(elSummary(V9.elec))}`; renderCmp9(); return; }
    if(!R.items.length) throw new Error("‘2.1 포기장치(M-201)’처럼 기기번호가 붙은 항목 제목을 찾지 못했습니다");
    V9.spec=R; V9.specName=file.name;
    const f=e=>e?`${e.name} ${e.tag}${e.cap?` · ${e.cap.v.toLocaleString()} ${e.cap.unit}`:""}${e.kw?` · ${e.kw.v} kW`:""}${e.qty?` · 금회 ${e.qty}대${e.qtyAll?`/전체 ${e.qtyAll}대`:""}`:""}`:"";
    st.innerHTML=`<b>${h(file.name)}</b> — 시방서 ${pages.length}쪽에서 기기 ${R.items.length}개를 읽었습니다: ${R.items.map(e=>h(f(e))).join(" / ")}.`+
      `${!R.feed?` <span class="miss">공급펌프 사양은 이 시방서에 없습니다(장비일람표·기계 시방서 필요).</span>`:""}`;
    renderCmp9();
  }catch(e){ ATT.specErr=String(e&&e.message||e); st.innerHTML=`<span class="miss">시방서를 읽지 못했습니다: ${h(e&&e.message?e.message:e)}</span>`; }
  finally{ ATT.specBusy=false; updAtt(); }
}

// ---------- 3D ----------
const G3 = {};
function ensure3D(){ return G3.ready || (G3.ready = init3D()); }
async function init3D(){
  try{
    G3.THREE = await import(CDN.three);
    G3.Orbit = (await import(CDN.orbit)).OrbitControls;
    const c2 = await import(CDN.css2d); G3.CSS2DRenderer=c2.CSS2DRenderer; G3.CSS2DObject=c2.CSS2DObject;
    const T=G3.THREE, box=$("v9view");
    G3.renderer = new T.WebGLRenderer({antialias:true, preserveDrawingBuffer:true});
    G3.renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
    G3.renderer.localClippingEnabled = true;
    box.appendChild(G3.renderer.domElement);
    G3.lr = new G3.CSS2DRenderer(); G3.lr.domElement.style.cssText="position:absolute;top:0;left:0;pointer-events:none"; box.appendChild(G3.lr.domElement);
    G3.scene = new T.Scene(); G3.scene.background=new T.Color(0xeef2f3);
    G3.cam = new T.PerspectiveCamera(40,1,0.1,500);
    G3.ctl = new G3.Orbit(G3.cam, G3.renderer.domElement); G3.ctl.enableDamping=true;
    G3.scene.add(new T.HemisphereLight(0xffffff,0x8899aa,1.1));
    const dl=new T.DirectionalLight(0xffffff,1.1); dl.position.set(20,40,25); G3.scene.add(dl);
    G3.clip = new T.Plane(new T.Vector3(0,0,-1), 0);
    const size=()=>{ const w=box.clientWidth, hh=box.clientHeight; G3.renderer.setSize(w,hh); G3.lr.setSize(w,hh); G3.cam.aspect=w/hh; G3.cam.updateProjectionMatrix(); };
    new ResizeObserver(size).observe(box); size();
    const loop=t=>{ requestAnimationFrame(loop); if(G3.rotors) G3.rotors.forEach(r=>r.rotation.y=t/1000*1.2); G3.ctl.update(); G3.renderer.render(G3.scene,G3.cam); G3.lr.render(G3.scene,G3.cam); };
    requestAnimationFrame(loop);
    const ph=$("v9ph"); if(ph) ph.remove();
    return true;
  }catch(e){ G3.ready=null; const ph=$("v9ph"); if(ph) ph.textContent="3D 모듈을 불러오지 못했습니다 (인터넷 연결 확인): "+(e.message||e); return false; }
}
// 3D 배치: 터빈 상세도면 반영 전까지 끔 (형상 불일치). 다시 켤 때 true + v9_section.html 3D 블록 복원
const V9_3D_ON = false;
async function draw3D(rows){
  if(!V9_3D_ON){ V9.geo=null; return; }
  const W=A(rows,"W"), L=A(rows,"L"), He=A(rows,"He"), nT=Math.max(1,Math.round(A(rows,"N")||1));
  if(!(W>0&&L>0&&He>0)){ $("v9geoNote").innerHTML="반응조 가로·세로·HWL 수심이 있어야 3D를 그립니다."; return; }
  if(!(await ensure3D())) return;
  const T=G3.THREE, sc=G3.scene;
  if(G3.root){ sc.remove(G3.root); G3.root.traverse(o=>{ if(o.geometry) o.geometry.dispose(); if(o.element) o.element.remove(); }); }
  const root=new T.Group(); G3.root=root; sc.add(root); G3.rotors=[];
  const Lw = A(rows,"Lw") ?? Math.max(0.5,He-1.0), Fb = A(rows,"Fb") ?? 0.8;
  const top = He+Fb, t=0.5;
  const turbD = (A(rows,"turb")||1250)/1000, k=turbD/1.25;
  const lvT = +$("v9lv").value/1000, level = Lw+(He-Lw)*lvT;
  $("v9lvT").textContent = lvT>=0.999?`HWL ${n2(He)} m`: lvT<=0.001?`LWL ${n2(Lw)} m`:`${n2(level)} m`;
  const cut=$("v9cut").checked, showLab=$("v9lab").checked;
  G3.clip.constant = L/2;
  const clipArr = cut?[G3.clip]:[];
  const M = (c,o={}) => new T.MeshStandardMaterial({color:c, roughness:.85, metalness:o.m||0, transparent:!!o.op, opacity:o.op||1, clippingPlanes:o.noclip?[]:clipArr, side:o.ds?T.DoubleSide:T.FrontSide, depthWrite:o.op?false:true});
  const conc=M(0xbfc4c2), concTop=M(0xd5d9d6), steel=M(0x8a99a6,{m:.5,noclip:1}), sts=M(0xc9d1d8,{m:.6,noclip:1}), frp=M(0x2f6f9f,{noclip:1}), motor=M(0x3b6e4f,{noclip:1}), floatM=M(0xe3e6e8,{m:.3,noclip:1}), water=M(0x3d8fc6,{op:.32,ds:1}), waterTop=M(0x2f7fb8,{op:.55,ds:1}), yellow=M(0xe0b000,{noclip:1}), railM=M(0xc9d1d8,{m:.6}), armM=M(0x8a99a6,{m:.5});
  const box=(w,hh,d,mat,x,y,z)=>{ const m=new T.Mesh(new T.BoxGeometry(w,hh,d),mat); m.position.set(x,y,z); root.add(m); return m; };
  const cyl=(r,hh,mat,x,y,z,seg=24)=>{ const m=new T.Mesh(new T.CylinderGeometry(r,r,hh,seg),mat); m.position.set(x,y,z); root.add(m); return m; };
  const pipe=(a,b,r,mat)=>{ const va=new T.Vector3(...a), vb=new T.Vector3(...b), d=vb.clone().sub(va), len=d.length(); const m=new T.Mesh(new T.CylinderGeometry(r,r,len,16),mat); m.position.copy(va.clone().add(vb).multiplyScalar(.5)); m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0), d.normalize()); root.add(m); return m; };
  const label=(txt,x,y,z,cls="")=>{ if(!showLab) return; const d=document.createElement("div"); d.className="v9lbl "+cls; d.textContent=txt; const o=new G3.CSS2DObject(d); o.position.set(x,y,z); root.add(o); };
  const lineLoop=(x0,x1,z0,z1,y,col,dash)=>{ const g=new T.BufferGeometry().setFromPoints([new T.Vector3(x0,y,z0),new T.Vector3(x1,y,z0),new T.Vector3(x1,y,z1),new T.Vector3(x0,y,z1),new T.Vector3(x0,y,z0)]); const mat=dash?new T.LineDashedMaterial({color:col,dashSize:.3,gapSize:.2,clippingPlanes:clipArr}):new T.LineBasicMaterial({color:col,clippingPlanes:clipArr}); const l=new T.Line(g,mat); if(dash) l.computeLineDistances(); root.add(l); };
  const totX = nT*W+(nT+1)*t;
  // 바닥 · 벽체
  box(totX, 0.6, L+2*t, M(0xbfc4c2,{noclip:1}), totX/2, -0.3, L/2);
  for(let i=0;i<=nT;i++){ const x=i*(W+t)+t/2; box(t, top, L+2*t, conc, x, top/2, L/2); }
  box(totX, top, t, conc, totX/2, top/2, -t/2);
  box(totX, top, t, conc, totX/2, top/2, L+t/2);
  // 유지관리층(상부 슬래브 일부: 뒤쪽 1.5m 띠)
  box(totX, 0.25, 1.5, concTop, totX/2, top+0.125, -t+0.75-0.5);
  const cd=crossDims(Math.round(turbD*1000)); const cw=+$("v9cw").value||cd.w, chh=+$("v9ch").value||cd.h, ct=+$("v9ct").value||cd.t, hn=Math.max(0,+$("v9hn").value||0);
  if(!$("v9cw").value){ $("v9cw").placeholder=cd.w; $("v9ch").placeholder=cd.h; $("v9ct").placeholder=cd.t; }
  const prism=(len,a,mat,pos,rotY)=>{ const sh=new T.Shape(); sh.moveTo(0,0); sh.lineTo(a,0); sh.lineTo(0,a); sh.lineTo(0,0); const g=new T.ExtrudeGeometry(sh,{depth:len,bevelEnabled:false}); g.translate(0,0,-len/2); const m=new T.Mesh(g,mat); m.rotation.y=rotY; m.position.set(...pos); root.add(m); return m; };
  const D=V9.dwg, s=V9.lv&&V9.lv.s;
  const el = y => s&&s.bottom!=null? ` (EL.${(s.bottom+y).toFixed(2)})` : "";
  const fr=1.25*k, fl=1.3*k, frad=0.22*k, env=fr+fl/2+frad, P=V9.plan, clrs=[];
  for(let i=0;i<nT;i++){
    const x0=t+i*(W+t), cx=x0+W/2, cz=L/2;
    box(W, level, L, water, cx, level/2, cz);
    const wt=new T.Mesh(new T.PlaneGeometry(W,L), waterTop); wt.rotation.x=-Math.PI/2; wt.position.set(cx,level+0.002,cz); root.add(wt);
    lineLoop(x0+0.01,x0+W-0.01,0.01,L-0.01,He,0x0b5d8f,false);
    lineLoop(x0+0.01,x0+W-0.01,0.01,L-0.01,Lw,0xc0392b,true);
    label(`SBR 반응조 #${i+1}`, cx-W*0.3, top+0.6, -0.4);
    if(i===0){ label(`HWL ${n2(He)} m${el(He)}`, x0+0.2, He+0.15, 0.2, "water"); label(`LWL ${n2(Lw)} m${el(Lw)}`, x0+0.2, Lw+0.15, 0.2, "water"); }
    // --- 도면 평면 배치 (있으면 사용, 없으면 표준 배치 가정) ---
    const pa=P&&P.aer[i], pd=P&&P.dec[i];
    const ax=pa?pa.x:cx, az=pa?pa.z:cz;
    const decWall=pd?pd.wall:"z0", railWall={z0:"z1",z1:"z0",x0:"x1",x1:"x0"}[decWall];
    const WP=(wall,s,d,y)=> wall==="z0"?[s,y,d]: wall==="z1"?[s,y,L-d]: wall==="x0"?[x0+d,y,s]:[x0+W-d,y,s];
    const along=(wall,p)=> wall==="z0"||wall==="z1"? p.x : p.z;
    // --- 바닥 헌치 · 십자구조물 (콘크리트) ---
    if(hn>0){ prism(L,hn,conc,[x0,0,cz],0); prism(L,hn,conc,[x0+W,0,cz],Math.PI); prism(W,hn,conc,[cx,0,0],-Math.PI/2); prism(W,hn,conc,[cx,0,L],Math.PI/2); }
    const crossM=M(0xa9aeab,{noclip:1});
    box(cw,chh,ct,crossM,ax,chh/2,az); box(ct,chh,cw,crossM,ax,chh/2,az);
    if(i===0) label(`십자구조물 ${n2(cw)}×${n2(chh)}m${(+$("v9cw").value||cd.ok)?"":" (추정)"}`, ax+cw/2, chh+0.2, az);
    // --- 포기장치 (부유식 표면포기기) ---
    const tg=new T.Group(); tg.position.set(ax, level, az); root.add(tg);
    const prof=[[0.06*k,-0.42*k],[0.16*k,-0.38*k],[0.40*k,-0.22*k],[0.625*k,-0.04*k],[0.675*k,0],[0.675*k,0.03*k],[0.60*k,0.03*k],[0.10*k,0.02*k]].map(p=>new T.Vector2(p[0],p[1]));
    const rotor=new T.Group(); tg.add(rotor); G3.rotors.push(rotor);
    rotor.add(new T.Mesh(new T.LatheGeometry(prof,40), frp));
    for(let b=0;b<8;b++){ const f=new T.Mesh(new T.BoxGeometry(0.42*k,0.16*k,0.025*k), frp); const a=b/8*Math.PI*2; f.position.set(Math.cos(a)*0.42*k,-0.16*k,Math.sin(a)*0.42*k); f.rotation.y=-a; f.rotation.z=0.5; rotor.add(f); }
    const add=(m,x,y,z)=>{ m.position.set(x,y,z); tg.add(m); return m; };
    add(new T.Mesh(new T.CylinderGeometry(0.05*k,0.05*k,0.55,16),sts),0,0.27,0);
    add(new T.Mesh(new T.BoxGeometry(1.15*k,0.04,1.15*k),sts),0,0.48,0);
    add(new T.Mesh(new T.BoxGeometry(0.46*k,0.30,0.46*k),motor),0,0.66,0);
    add(new T.Mesh(new T.CylinderGeometry(0.17*k,0.17*k,0.45,24),motor),0,1.03,0);
    for(let j=0;j<3;j++){ const a=Math.PI/2+j*2*Math.PI/3; const fx=Math.cos(a)*fr, fz=Math.sin(a)*fr;
      const fc=new T.Mesh(new T.CylinderGeometry(frad,frad,fl,20),floatM); fc.rotation.z=Math.PI/2; fc.rotation.y=-a+Math.PI/2; add(fc,fx,0.04,fz);
      const arm=new T.Mesh(new T.BoxGeometry(0.08,0.08,fr),steel); arm.position.set(fx/2,0.45,fz/2); arm.rotation.y=-a+Math.PI/2; tg.add(arm); }
    // 가이드레일 2개 (배출장치 반대쪽 벽 가정) + 플로트 암
    const ra=along(railWall,{x:ax,z:az});
    for(const ds of [-0.45,0.45]){ pipe(WP(railWall,ra+ds,0.12,0.2),WP(railWall,ra+ds,0.12,top),0.045,railM); }
    const sl=WP(railWall,ra,0.25,level+0.15); { const m=box(railWall[0]==="z"?1.1:0.22,0.18,railWall[0]==="z"?0.22:1.1,armM,sl[0],sl[1],sl[2]); }
    const tv=new T.Vector3(ax-sl[0],0,az-sl[2]); const tl=tv.length(); tv.normalize();
    pipe(sl,[ax-tv.x*fr*0.95,level+0.45,az-tv.z*fr*0.95],0.05,armM);
    label(`포기장치${D&&D.aerator?" "+(nT>1?D.aerator.code.replace(/[AB/]+$/,"")+String.fromCharCode(65+i):D.aerator.code):""} · Ø${Math.round(turbD*1000)}${pa&&(Math.abs(pa.ox)>0.05||Math.abs(pa.oz)>0.05)?" (편심)":""}`, ax, level+1.6, az);
    // --- 배출장치 (부유식 디캔터) ---
    const wl=decWall[0]==="z"?W:L, ds0=pd? along(decWall,pd) : (decWall[0]==="z"? cx+W*0.3 : cz);
    const dlen=Math.min(2.4,wl*0.3), dy=level-0.25, sleeveY=Math.max(0.6,Lw-0.6);
    pipe(WP(decWall,ds0-dlen/2,0.9,dy),WP(decWall,ds0+dlen/2,0.9,dy),0.11,sts);
    pipe(WP(decWall,ds0-dlen/2,0.85,level+0.05),WP(decWall,ds0+dlen/2,0.85,level+0.05),0.15,floatM);
    pipe(WP(decWall,ds0,0.9,dy),WP(decWall,ds0,0.05,sleeveY),0.1,sts);
    pipe(WP(decWall,ds0+0.6,0.12,0.2),WP(decWall,ds0+0.6,0.12,top),0.04,sts);
    { const p=WP(decWall,ds0+0.6,-0.1,top+0.45); box(0.5,0.35,0.5,yellow,p[0],p[1],p[2]); }
    { const p=WP(decWall,ds0,0.9,level+0.9); label(`배출장치${D&&D.decanter?" "+(nT>1?D.decanter.code.replace(/[AB/]+$/,"")+String.fromCharCode(65+i):D.decanter.code):""}`, p[0],p[1],p[2]); }
    // --- 이격 (벽체) ---
    clrs.push({i, wall: Math.min(ax-x0, x0+W-ax, az, L-az)-env});
  }
  // 기둥 (도면 3.토목 등 사각 단면 · 반응조 주변)
  const colInfo=[];
  if(P) for(const c of P.cols){ const m=box(c.w,top+3.4,c.h, c.inside?M(0xc0392b,{noclip:1}):M(0x8f979b,{noclip:1}), c.x, (top+3.4)/2-0.3, c.z);
    const near=clrs.map(o=>{ const ap=P.aer[o.i]; const ax=ap?ap.x:t+o.i*(W+t)+W/2, az=ap?ap.z:L/2; return Math.max(0,Math.hypot(Math.max(Math.abs(c.x-ax)-c.w/2,0),Math.max(Math.abs(c.z-az)-c.h/2,0)))-env; });
    colInfo.push({...c, clr:Math.min(...near)}); if(c.inside) label("기둥 (반응조 내부)", c.x, top+3.6, c.z); }
  // 호이스트 레일
  const hoist = D && D.hoist;
  if(hoist){ const hy=top+3.0; box(totX,0.3,0.15,steel,totX/2,hy,L/2); box(0.5,0.4,0.35,yellow,t+W/2,hy-0.35,L/2); label(`${hoist.code} ${hoist.name}`, totX-0.5, hy+0.5, L/2); }
  // 카메라
  const R=Math.max(totX,L,top)*(nT>1?0.95:1.45);
  if(!G3.camSet){ G3.cam.position.set(totX/2-R*0.30, top+R*0.62, L/2+R*0.95); G3.ctl.target.set(totX/2, He*0.45, L/2); G3.camSet=true; }
  // 이격 검토 (개략)
  const clr=Math.min(...clrs.map(o=>o.wall)), cmin=colInfo.length?Math.min(...colInfo.map(c=>c.clr)):null, inside=colInfo.filter(c=>c.inside).length;
  V9.geo={clr,cmin,inside,nCol:colInfo.length,pos:P&&P.aer.length?(P.aer.every(a=>Math.abs(a.ox)<0.05&&Math.abs(a.oz)<0.05)?"반응조 중심 배치":"편심 배치"):"중심 가정"};
  $("v9geoNote").innerHTML=`반응조 ${nT}지 · 내부 ${n2(W)} × ${n2(L)} m · HWL ${n2(He)} / LWL ${n2(Lw)} m · 여유고 ${n2(Fb)} m · 현재 수위 ${n2(level)} m (포기장치·디캔터는 부유식이라 수위를 따라 움직입니다).<br>`+
    `포기장치 Ø${Math.round(turbD*1000)} 플로트 포함 외곽 약 Ø${n2(env*2)} m → 벽체까지 최소 이격 <b>${n2(clr)} m</b>${clr<1?` <span class="ng">(1m 미만 — 간섭 확인)</span>`:""}`+
    (P? ` · 주변 기둥 ${colInfo.length}개 (반응조 내부 ${inside}개${inside?` <span class="ng">⚠ 간섭 검토</span>`:""})${cmin!=null?`, 포기장치 외곽~가장 가까운 기둥 <b>${n2(cmin)} m</b>`:""}. 위치 근거 — 포기장치: ${P.aer.some(Boolean)?[...new Set(P.aer.filter(Boolean).map(a=>a.src))].join(', '):'못 찾음(중앙 가정)'}, 배출장치: ${P.dec.some(Boolean)?'도면':'못 찾음(뒤쪽 벽 가정)'}.` : ". 도면 평면 배치를 못 찾아 포기장치는 반응조 중앙, 배출장치는 뒤쪽 벽으로 가정했습니다.")+
    `<br><small>터빈 본체(Ø${Math.round(turbD*1000)}/Ø${Math.round(turbD*1080)})·감속기 형상은 장흥 1250형 제작도 기준 개략, 플로트 반경·가이드레일 위치는 표준 배치 가정입니다. 기둥은 도면의 사각 단면(0.25~1.2m, 토목·주열 레이어)으로 추정하며 보(beam)는 아직 읽지 않습니다.</small>`;
}


// 파일 저장: claude.ai 페이지에서는 저장 확인 창(downloads), 그 외(크롬·데스크톱 앱)는 일반 다운로드
async function saveFile(blob, filename){
  try{ if(window.claude && window.claude.use){ const dl=await window.claude.use("downloads"); if(dl){ try{ await dl.save({filename, data:blob}); return true; }catch(e){ if(e&&e.code==="declined") return false; throw e; } } } }catch(e){ if(e&&e.code&&e.code!=="unavailable") throw new Error(e.message||e.code); }
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),4000); return true;
}

// ---------- 검토서 엑셀 ----------
const TPL_B64 = "__TPL_B64__";
async function makeXlsx(){
  const btn=$("v9xlsx"), note=$("v9xNote");
  try{
    btn.disabled=true; note.textContent="검토서 만드는 중…";
    if(!window.JSZip){ await new Promise((ok,ng)=>{ const s=document.createElement("script"); s.src=CDN.jszip; s.onload=ok; s.onerror=()=>ng(new Error("JSZip 로드 실패 (인터넷 연결 확인)")); document.head.appendChild(s); }); }
    const rows=model(), X=V9.xls||{}, D=V9.dwg, s=V9.lv&&V9.lv.s, e=V9.lv&&V9.lv.e;
    const c={}; const set=(a,v)=>{ if(typeof v==="string" && /^\s*-?\d+(\.\d+)?\s*$/.test(v) && /^D/.test(a)) v=+v; if(v!=null&&v!==""&&!(typeof v==="number"&&!isFinite(v))) c[a]=v; };
    const r3=v=>v==null?null:Math.round(v*1000)/1000;
    const date=$("printDate").value||new Date().toISOString().slice(0,10);
    set("C3",$("siteName").value.trim()||X.site); set("C4",$("v9designer").value.trim());
    set("C5",[date,$("v9reviewer").value.trim()].filter(Boolean).join(" · ")); set("C6",`SBR (표면포기기 ${($("hSize").textContent||"").trim()})`);
    set("D11",X.cap); set("D12",num("q_0")||null); set("D13",A(rows,"N")); set("D14",num("nc")||null);
    set("D16",num("hrtT")||null); set("D17",state.pdfRef&&state.pdfRef.SRT?r3(state.pdfRef.SRT[0]):null);
    set("D22",A(rows,"eqW")); set("D23",A(rows,"eqL")); set("D24",A(rows,"eqHe")); set("D25",A(rows,"eqN"));
    if(e&&e.hwl!=null&&e.matched){ set("G28", e.noLwl?`도면 HWL(D.W.L) EL.${e.hwl} − 바닥 EL.${e.bottom} = ${n2(e.hwl-e.bottom)} m (계산서 유효수심과 비교) · ${e.lwlSeen?"도면 LWL 표기와 계산서 수심이 맞지 않음 → 펌프 정지수위 확인":"도면에 LWL 표기 없음 → 펌프 정지수위 확인"}`:`도면 HWL EL.${e.hwl} / LWL EL.${e.lwl} → 변동수심 ${n2(e.hwl-e.lwl)} m`); }
    set("D37",A(rows,"W")); set("D38",A(rows,"L")); set("D39",A(rows,"Lw")); set("D40",A(rows,"He")); set("D41",A(rows,"Fb"));
    if(s&&s.top!=null) set("G41",`도면 상부 EL.${s.top} − HWL EL.${s.hwl}`);
    const cmpTxt=k=>{ const r=rows.find(x=>x.key===k); return r&&r.st==="일치"?`용량계산서 = 도면 (${n2(r.xls)})`: r&&r.st==="불일치"?`용량계산서 ${n2(r.xls)} / 도면 ${n2(r.dwg)} 불일치`:""; };
    set("H37",cmpTxt("W")); set("H38",cmpTxt("L")); set("H40",cmpTxt("He")); set("H22",cmpTxt("eqW")); set("H23",cmpTxt("eqL")); set("H24",cmpTxt("eqHe"));
    const he=rows.find(x=>x.key==="He"); if(he&&he.st) { set("F42", he.st==="일치"?"확인":"검토"); set("H42",cmpTxt("He")); }
    const tb=A(rows,"turb"); set("D49",tb); set("G49",`웹앱 선정 ${($("hSize").textContent||"").trim()} · 설계 소요동력 ${n2(designKW())} kW · 운전점 산소전달 ${($("hO2").textContent||"").replace(/kgO₂\/h/,"").trim()} kgO₂/h`);
    set("D50",A(rows,"o2")); set("H51",`웹앱 설계 소요동력 ${n2(designKW())} kW (참고)`);
    if(D){ set("D56",D.hoist?"있음":"없음"); if(D.hoist){ set("F56","확인"); set("G56",`${D.hoist.code} ${hoistName(D.hoist.name)}`); } else set("F56","검토"); }
    set("D58",A(rows,"qin")); set("D59",A(rows,"dsz")); set("D60",A(rows,"winch")); set("D61",A(rows,"dt")); set("D62",A(rows,"decQ"));
    if(D){ const pp=D.pumps||{};
      if(pp.feed){ const t=`도면 ${pp.feed.code} ${pp.feed.name}`; set("H29",t+" · 구경 장비일람표 확인"); set("H30",t+" · 용량 장비일람표 확인"); set("H31",t+" · 동력 장비일람표 확인"); }
      if(pp.eff){ const t=`도면 ${pp.eff.code} ${pp.eff.name}`; set("H94",t+" · 용량 장비일람표 확인"); set("H95",t+" · 구경 장비일람표 확인"); }
      const dsr=rows.find(r=>r.key==="dsz");
      if(noLevel()){ set("H39","도면(평면도)에 수위 표기 없음 — 단면도 확인"); set("H41","도면(평면도)에 수위 표기 없음 — 단면도 확인"); } if(dsr&&dsr.xls==null&&dsr.dwg!=null&&V9.over.dsz==null) set("H59",`도면 처리수(TW) 배관 ${dsr.dwg}A 표기 기준 (반응조 주변 ${D.decPipe.n}곳) — 장비일람표 확인`); }
    // --- v11 보강: 도면·계산서·시방서에서 더 채울 수 있는 칸 ---
    { const nr=rows.find(x=>x.key==="N"); if(nr&&nr.st==="단계") set("H13",nr.dnote); }
    if(D&&D.equipTable&&D.equipTable.length){ const tq=(e,lab)=>{ const q=qtyNow(e); return e?`기기목록표 ${e.code} ${lab||e.name}: ${fmtQty(e)}${q?` → 금회 ${q.n}대${q.spare?`(예비 ${q.spare} 포함)`:""}`:""}`:""; };
      if(D.eqFeed){ set("H31", tq(D.eqFeed)+(V9.spec&&V9.spec.feed&&V9.spec.feed.kw?"":" · 동력은 장비일람표 확인")); }
      if(D.eqEff){ set("H97", tq(D.eqEff)); }
      if(D.eqAer){ set("H49", tq(D.eqAer)); }
      if(D.eqDec){ set("H61", tq(D.eqDec)); }
    }
    const cut=(s,n=150)=>{ s=String(s||"").replace(/\s+/g," ").trim(); return s.length>n? s.slice(0,n-1)+"…" : s; };
    if(D&&D.pumps){ const fp=D.pumps.feed, ep=D.pumps.eff;
      if(fp&&fp.pipe&&!(V9.spec&&V9.spec.feed&&V9.spec.feed.size)){ set("D29",fp.pipe.a); set("H29",`도면 ${fp.code} 주변 토출배관 ${fp.pipe.label} 표기 ${fp.pipe.n}곳 기준(추정) — 장비일람표 확인`); }
      if(fp){ const qn=qtyNow(D.eqFeed); set("G33",`도면 ${fp.code} ${fp.name}${qn?` · 금회 ${qn.n}대${qn.spare?`(예비 ${qn.spare})`:""}`:(/\/|~/.test(fp.code)?" (복수 대수 — 상용/예비 확인)":"")}${fp.pipe?` · 토출 ${fp.pipe.label}`:""}${D.feedLine?` · 반응조 유입관 ${D.feedLine}`:""}`); }
      if(ep&&ep.pipe){ set("D95",ep.pipe.a); set("H95",`도면 ${ep.code} ${ep.name} 주변 ${ep.pipe.label} 표기 ${ep.pipe.n}곳 기준`); } }
    if(X.vfvt && A(rows,"W") && A(rows,"L") && A(rows,"He")){ const He=A(rows,"He"), area=A(rows,"W")*A(rows,"L"), qc=(num("q_0")||0)/(A(rows,"N")||1)/(num("nc")||1);
      const dMax=He*X.vfvt.min, dReq=qc/area;
      set("G39",`계산서 VF/VT ${X.vfvt.vals.join(" / ")} → 최대 배출수심 ${n2(dMax)} m (LWL ≥ ${n2(He-dMax)} m) · Q/Cycle 배출수심 ${n2(dReq)} m (운전 LWL ≈ ${n2(He-dReq)} m) — 도면 LWL 표기와 대조`); }
    { const S2=V9.lv&&V9.lv.s; if(S2&&S2.hwl!=null&&S2.bottom!=null&&noLvLwl()) set("H39",`도면 D.W.L EL.${S2.hwl} · 바닥 EL.${S2.bottom} — 도면에 LWL 표기 없음`); }
    { const ef=V9.lv&&V9.lv.f; if(ef&&ef.matched&&ef.hwl!=null&&ef.bottom!=null) set("G87",`도면 HWL EL.${ef.hwl} − 바닥 EL.${ef.bottom} = ${n2(ef.hwl-ef.bottom)} m${ef.top!=null?` · 상부 EL.${ef.top} (여유고 ${n2(ef.top-ef.hwl)} m)`:""}`); }
    const sz=($("hSize").textContent||"").trim(), rpm=($("hRpm")?.textContent||"").trim();
    set("G54",`웹앱 ${sz}${rpm?` · 정격/운전 ${rpm}`:""}${V9.spec&&V9.spec.facts&&V9.spec.facts.gear?" · 시방서: 감속기 "+((V9.spec.facts.gear.t.match(/감속기\s*\(([^)]+)\)/)||[])[1]||"헬리컬"):""}${V9.spec&&V9.spec.facts&&V9.spec.facts.motor?` · 전동기 ${(V9.spec.facts.motor.t.match(/IP\s*\d{2}/)||[""])[0]}${/F종/.test(V9.spec.facts.motor.t)?", F종 절연":""}${/서미스터|Thermistor/i.test(V9.spec.facts.motor.t)?", 서미스터":""}`:""}`);
    if(V9.spec&&V9.spec.facts){ const F=V9.spec.facts, pg=f=>f&&f.page?` (시방서 p.${f.page})`:" (시방서)";
      if(F.cross||F.aerPad) set("G44",cut([F.cross?"십자형 크로스 배플: 토목구조물(토목 시공분)":"", F.aerPad?"포기장치 기초 패드: 토목공사분":""].filter(Boolean).join(" · "))+pg(F.cross||F.aerPad));
      if(F.decWall) set("G47","배출장치는 유입부 반대 방향 벽체에 설치 (구동장치 포함)"+pg(F.decWall));
      if(F.decPad) set("G48","배출장치 기초 패드: 토목공사분 · 슬리브 scope는 시방서에 별도 명시 없음"+pg(F.decPad));
      const pt=[]; const tx=Object.values(F).map(f=>f.t).join(" ");
      if(/PLC/.test(tx)) pt.push("PLC"); if(/Screen\s*Monitor|Monitor/i.test(tx)) pt.push("터치 모니터"); if(/Inverter|VVVF/i.test(tx)) pt.push("포기기 인버터(VVVF)"); if(/리액터/.test(tx)) pt.push("리액터·노이즈필터");
      if(F.scope2&&/현장조작반/.test(F.scope2.t)) pt.push("현장조작반 공급·설치"); if(F.scope2&&/2차측/.test(F.scope2.t)) pt.push("2차측 배관·배선 공급자");
      if(pt.length) set("G69",pt.join(" · ")+pg(F.panelMat||F.scope2));
      if(F.rcs) set("G70","RCS(상위 감시제어) 미포함 — 통신 포트만 제공, 통신선은 전기도급자"+pg(F.rcs)); set("F70", F.rcs?"확인":"");
      if(F.power1) set("G71","1차측 전원은 전기도급자 (MCC반은 시방서 범위 밖으로 판단 — 전기 도면 확인)"+pg(F.power1));
      if(F.panelMat){ const t=F.panelMat.t, th=(t.match(/(\d+(?:\.\d+)?)\s*mm\s*이상/)||[])[1], mat=/STS|스테인/i.test(t)?"STS":/Steel|강판/i.test(t)?"Steel":"";
        set("G72",[/방진/.test(t)?"방진":"", /자립형/.test(t)?"자립형":"", th?`${th}mm 이상 ${mat}`.trim():mat, /분체\s*도장/.test(t)?"정전 분체도장":""].filter(Boolean).join(" · ")+" · W×D×H는 시방서에 없음"+pg(F.panelMat)); }
      const PN=V9.spec.panel; if(PN&&(PN.whd||PN.mat||PN.form)){ set("G72",[PN.form?`형식 ${PN.form}`:"", PN.whd?`규격 ${PN.whd}`:"", PN.mat?`재질 ${PN.mat}`:""].filter(Boolean).join(" · ")+` (${srcL(PN)} ${PN.tag||PN.no} ${PN.name})`); }
      if(PN&&PN.loc) set("G68",`시방서 설치위치: ${PN.loc} (${PN.no} ${PN.name})`);
      if(PN&&PN.qty) set("H69",`${srcL(PN)} ${PN.name} 수량 ${PN.qty}${PN.qtyAll?` (전체 ${PN.qtyAll})`:""}`);
      if(F.comm) set("G79",(/Ethernet/i.test(F.comm.t)?"Ethernet (개방형 프로토콜) 통신 포트":"통신 포트 제공")+pg(F.comm));
      const ins=[]; if(F.do) ins.push("DO·온도 신호 → 제어반 표시·인버터 제어"); if(F.level) ins.push("유량조정조·반응조 수위 4~20mA → 공급펌프 연동"); if(/Limit/i.test(tx)) ins.push("배출장치 Limit·Level S/W 연동");
      if(ins.length) set("G80",ins.join(" · ")+pg(F.do||F.level));
      if(F.tpPad) set("G93","총인설비(부상분리장치) 기초 패드: 토목공사분"+pg(F.tpPad));
      if(F.tpScope||F.tpPad) set("G92",[F.tpScope?"약품펌프 흡입밸브~토출밸브 배관: 공급자":"", "제어반 1차측 전원: 전기도급자"].filter(Boolean).join(" · ")+pg(F.tpScope));
    }
    { const P=V9.plan, F=V9.spec&&V9.spec.facts; const parts=[];
      if(P){ const ins=P.cols.filter(c=>c.inside).length; parts.push(`도면: 반응조 주변 기둥 ${P.cols.length}개(내부 ${ins}개)`); parts.push(P.aer.some(Boolean)?`포기장치 위치 ${P.aer.filter(Boolean).map(a=>Math.abs(a.ox)<0.05&&Math.abs(a.oz)<0.05?"중심":"편심").join("/")}`:"포기장치 위치 블록 못 찾음(중심 가정)"); }
      if(F&&F.aerPos) parts.push("시방서: 반응조 중앙 수면 부유식");
      if(parts.length) set("G45",parts.join(" · ")+" — 보·배출장치 간섭은 도면 확인 (3D 업데이트 중)"); }
    if(D&&D.decPipe){ const t=D.decPipe; set("G96",`도면 반응조 주변 처리수(TW) 배관: ${Object.entries(t.sizes).map(([a,n])=>a+"A "+n+"곳").join(", ")}`); }
    const SP=V9.spec;
    if(SP){ const g=(k)=>rows.find(r=>r.key===k)||{};
      { const aT=(SP.items||[]).find(e=>e.type==="aer"&&e.fromTable&&e.kw); if(aT){ set("D51",aT.kw.v); set("H51",`도면 기기일람표 ${aT.tag} ${aT.cap?aT.cap.v+" "+aT.cap.unit+" · ":""}${aT.kw.v} kW${aT.qty?` · 상용 ${aT.qty}${aT.spare?`·예비 ${aT.spare}`:""}`:""} (웹앱 설계 소요동력 ${n2(designKW())} kW)`); } }
      if(SP.aer && !SP.aer.fromTable){ if(SP.aer.kw){ set("D52",SP.aer.kw.v); set("H52",`시방서 ${SP.aer.no} ${SP.aer.name}(${SP.aer.tag}) ${SP.aer.kw.label}${SP.aer.kwNote?" · "+SP.aer.kwNote:""}`); const r=g("sAerKw"); if(r.st){ set("H51",`웹앱 설계 소요동력 ${n2(designKW())} kW · 시방서 ${SP.aer.kw.v} kW ${r.st==="충족"?"≥":"<"} 웹앱`); } }
        if(SP.aer.cap&&SP.aer.cap.unit==="kgO₂/h"){ const r=g("sAerO2"); set("G50",`${srcL(SP.aer)} ${SP.aer.cap.v} kgO₂/h ${r.st==="충족"?"≥":"<"} 계산서 최대 ${n2(A(rows,"o2"))}`); set("F50", r.st==="충족"?"확인":r.st==="부족"?"부적합":""); } }
      if(SP.dec){ if(SP.dec.cap&&SP.dec.cap.unit==="L/s"){ const r=g("sDecQ"); set("G58",`${srcL(SP.dec)} 배출장치 ${SP.dec.cap.v} L/s ${r.st==="충족"?"≥":"<"} 계산서 QIN ${n2(A(rows,"qin"))} L/s`); set("F58", r.st==="충족"?"확인":r.st==="부족"?"부적합":""); }
        if(SP.dec.kw && A(rows,"winch")==null){ c["D60"]=SP.dec.kw.v; set("H60",`${srcL(SP.dec)} ${SP.dec.tag} ${SP.dec.name} ${SP.dec.kw.label} ${SP.dec.kw.v} kW${SP.dec.kwNote?" · "+SP.dec.kwNote:""}`); } }
      if(SP.feed){ if(SP.feed.size) set("D29",SP.feed.size); const q=g("sFeedQ").dwg; if(q!=null) set("D30",q); if(SP.feed.kw) set("D31",SP.feed.kw.v); set("H30",`${srcL(SP.feed)} ${SP.feed.tag} ${SP.feed.name} ${capTxt(SP.feed)}${SP.feed.kw?` · ${SP.feed.kw.v} kW`:""}${SP.feed.qty?` · 상용 ${SP.feed.qty}${SP.feed.spare?`·예비 ${SP.feed.spare}`:""}`:""}`); }
      if(SP.eff){ const e=SP.eff, cm=e.cap&&e.cap.unit==="㎥/min"?e.cap.v:e.cap&&e.cap.unit==="㎥/h"?Math.round(e.cap.v/60*1000)/1000:null; if(cm!=null) set("D94",cm); if(e.size) set("D95",e.size); set("H94",`${srcL(e)} ${e.tag} ${e.name} ${capTxt(e)}${e.kw?` · ${e.kw.v} kW`:""}${e.qty?` · 상용 ${e.qty}${e.spare?`·예비 ${e.spare}`:""}`:""}`); }
      if(SP.tp&&SP.tp.cap&&SP.tp.cap.unit==="㎥/d"){ const r=g("sTp"); set("D91",SP.tp.cap.v); set("H91",`${srcL(SP.tp)} ${SP.tp.tag} ${SP.tp.name} ${capTxt(SP.tp)}`); if(r.st) set("G91",`${r.xsrc||"설계유량"} ${n2(r.xls)} ㎥/d 대비 ${r.st}`); if(r.st) set("F91",r.st==="충족"?"확인":"부적합"); }

    }
    set("H85",cmpTxt("efW")); set("H86",cmpTxt("efL")); set("H87",cmpTxt("efHe"));
    if(V9.geo){ const g=V9.geo; set("G45",`도면 기준 포기장치 ${g.pos} · 플로트 외곽~벽체 ${n2(g.clr)} m · 주변 기둥 ${g.nCol}개(반응조 내부 ${g.inside}개)${g.cmin!=null?` · 최근접 기둥 ${n2(g.cmin)} m`:""} — 보·핸드레일은 별도 확인`); set("F45", g.inside||g.clr<1?"검토":"확인"); }
    set("D85",A(rows,"efW")); set("D86",A(rows,"efL")); set("D87",A(rows,"efHe")); set("D88",A(rows,"efN"));
    const ng=rows.filter(r=>r.st==="불일치").slice(0,5);
    ng.forEach((r,i)=>{ const R=101+i; set("B"+R,"공통"); set("C"+R,`용량계산서↔설계도면 불일치: ${r.grp} ${r.lab}`); set("D"+R,r.dwg); set("E"+R,r.unit); set("F"+R,"검토"); set("G"+R,`용량계산서 ${n2(r.xls)} ${r.unit} / 도면 ${n2(r.dwg)} ${r.unit}`); });
    // 설계 Check List 프로젝트명
    const proj = $("siteName").value.trim()||X.site||"";
    const cells={"검토서":c}; if(proj){ for(const sh of ["기술제안서","설계","시공","시운전"]) cells[sh]={A3:"프로젝트 명 : "+proj}; }
    // 판정·검토의견 채우기 → 양식 수식 계산값 (미리보기·뷰어에서도 보이게)
    try{ elRefresh(); elecFill(c, V9.elec); }catch(e){ console.warn("전기도면 반영 오류", e); }
    try{ reviewJudge(c, {rows, X, SP:V9.spec, D, designKW:designKW()}); }catch(e){ console.warn("판정 작성 오류", e); }
    let cache={}; try{ cache={"검토서": tplEval(c)}; }catch(e){ console.warn("수식 계산 오류", e); }
    const tpl=Uint8Array.from(atob(TPL_B64),ch=>ch.charCodeAt(0));
    const out=await xlsxFill(window.JSZip, tpl, cells, cache);
    const blob=new Blob([out],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
    const saved=await saveFile(blob, `설계성과품 검토서_${(proj||"현장").replace(/[\\/:*?"<>|]/g,"")}_${date.replace(/-/g,"")}.xlsx`);
    if(saved===false){ note.innerHTML=`<span class="miss">저장을 취소했습니다. 다시 누르면 저장 창이 뜹니다.</span>`; return; }
    note.innerHTML=`검토서를 만들었습니다 — 값 ${Object.keys(c).length}칸 입력${ng.length?`, 불일치 ${ng.length}건은 6번 기타 사항에 ‘검토’로 기재`:""}. 엑셀을 열면 Q/Cycle·유입시간·배출량·배출소요시간 판정이 계산됩니다.`;
  }catch(err){ note.innerHTML=`<span class="miss">검토서를 만들지 못했습니다: ${h(err.message||err)}</span>`; }
  finally{ btn.disabled=false; }
}

// ---------- 연결 ----------
(function initV9(){
  const f=$("v9file");
  $("v9drop").addEventListener("click",()=>f.click());
  f.setAttribute("multiple",""); f.setAttribute("accept",".xls,.xlsx,.xlsm,.dwg,.dxf,.pdf,.zip,.rar,.7z,.egg,.alz,.tar,.gz");
  f.addEventListener("change",()=>{ if(f.files.length) ingestFiles(f.files,"all"); f.value=""; });
  { const tb=$("pdfBtn"); if(tb){ tb.textContent="📂 자료 불러오기"; tb.title="용량계산서·설계도면·시방서·전기계측 도면·압축파일을 한꺼번에 선택"; const nb=tb.cloneNode(true); tb.replaceWith(nb); nb.addEventListener("click",()=>f.click()); } }
  const sf=$("v11file"); sf.setAttribute("multiple",""); sf.setAttribute("accept",".pdf,application/pdf,.zip,.rar,.7z,.egg,.alz");
  $("v11drop").addEventListener("click",()=>sf.click()); sf.addEventListener("change",()=>{ if(!sf.files.length) return; const L=[...sf.files]; (L.length===1&&/\.pdf$/i.test(L[0].name))? loadSpec(L[0]) : ingestFiles(L,"spec"); sf.value=""; });
  $("attSpec").style.cursor="pointer"; $("attSpec").addEventListener("click",()=>sf.click());
  // 어디에 놓든: 여러 파일·압축파일은 자동 분류, 한 파일은 놓은 칸 기준
  window.addEventListener("drop",e=>{ const L=[...(e.dataTransfer?.files||[])]; if(!L.length) return; e.preventDefault(); e.stopImmediatePropagation(); document.body.classList.remove("dragover");
    const z=e.target.closest&&e.target.closest("#v11drop"); if(L.length===1&&z&&/\.pdf$/i.test(L[0].name)) loadSpec(L[0]); else ingestFiles(L,"drop"); }, true);
  // 위쪽 용량계산서 버튼: 여러 개·압축파일 선택 허용
  { const pf=$("pdfFile"); pf.setAttribute("multiple",""); pf.setAttribute("accept", pf.getAttribute("accept")+",.zip,.rar,.7z,.egg,.alz");
    window.addEventListener("change",e=>{ if(e.target!==pf||!pf.files.length) return; const L=[...pf.files]; if(L.length===1&&/\.(pdf|xls|xlsx|xlsm)$/i.test(L[0].name)) return; e.stopImmediatePropagation(); ingestFiles(L,"cap"); pf.value=""; }, true); }
  const pf=$("pdfFile"); pf.setAttribute("accept", pf.getAttribute("accept")+",.dwg,.dxf");
  const orig = window.importPdf;
  window.importPdf = async function(file){
    if(!file) return;
    if(/\.(dwg|dxf)$/i.test(file.name)) return loadDwgs([file]);
    if(/\.(zip|rar|7z|egg|alz|tar|gz)$/i.test(file.name)) return ingestFiles([file],"cap");
    ATT.restored=false;
    await orig(file);
    if(/\.xls[xm]?$/i.test(file.name) && window.XLSX){
      try{ V9.xls=capExtra(XLSX.read(new Uint8Array(await file.arrayBuffer()),{type:"array"})); V9.xlsName=file.name; V9.over={};
        const base=file.name.replace(/\.(xlsx?|xlsm)$/i,""), sn=$("siteName");
        if(V9.xls.site && (!sn.value.trim() || sn.value.trim()===base)){ sn.value=V9.xls.site; sn.dispatchEvent(new Event("input")); } }catch(e){ V9.xls=null; }
    }
    renderCmp9();
  };
  $("v9cmp").addEventListener("change",ev=>{ const t=ev.target;
    if(t.dataset.pick){ V9.pick[t.dataset.pick]= t.value===""? undefined : parseFloat(t.value); delete V9.over[t.dataset.pick]; renderCmp9(); }
    else if(t.dataset.ap){ const v=parseFloat(t.value); if(isFinite(v)) V9.over[t.dataset.ap]=v; else delete V9.over[t.dataset.ap]; renderCmp9(); } });
  ["v9lv","v9cut","v9lab","v9cw","v9ch","v9ct","v9hn"].forEach(id=>$(id)&&$(id).addEventListener("input",()=>draw3D(model())));
  ["W","L","T","nTank","rated","size"].forEach(id=>{ const e=$(id); if(e) e.addEventListener("input",()=>setTimeout(renderCmp9,0)); });
  $("v9png")&&$("v9png").addEventListener("click",()=>{ if(!G3.renderer) return; G3.renderer.render(G3.scene,G3.cam); const a=document.createElement("a"); a.href=G3.renderer.domElement.toDataURL("image/png"); a.download=`3D_${($("siteName").value||"현장").trim()}.png`; a.click(); });
  $("v9glb")&&$("v9glb").addEventListener("click",async()=>{ if(!G3.root) return; const {GLTFExporter}=await import(CDN.gltf); new GLTFExporter().parse(G3.root, r=>{ const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([r],{type:"model/gltf-binary"})); a.download=`3D_${($("siteName").value||"현장").trim()}.glb`; a.click(); }, err=>alert(err), {binary:true}); });
  $("v9xlsx").addEventListener("click",makeXlsx);
  ["v9designer","v9reviewer"].forEach(id=>$(id).addEventListener("input",()=>{ try{ const o=JSON.parse(localStorage.getItem(V9KEY)||"{}"); o.designer=$("v9designer").value; o.reviewer=$("v9reviewer").value; localStorage.setItem(V9KEY,JSON.stringify(o)); }catch(e){} }));
  try{ const o=JSON.parse(localStorage.getItem(V9KEY)||"null"); if(o){ ATT.restored=!!(o.xlsName||o.dwgName||o.specName); V9.spec=o.spec||null; V9.specName=o.specName||""; V9.xls=o.xls||null; V9.xlsName=o.xlsName||''; V9.dwg=o.dwg||null; V9.dwgName=o.dwgName||""; V9.over=o.over||{}; V9.pick=o.pick||{}; $("v9designer").value=o.designer||""; $("v9reviewer").value=o.reviewer||""; } }catch(e){}
  { const b=$("resetAllBtn"); if(b) b.addEventListener("click",()=>setTimeout(()=>{ if(b.classList.contains("arm")) return;
      V9.xls=null; V9.xlsName=""; V9.dwg=null; V9.dwgName=""; V9.spec=null; V9.specName=""; V9.over={}; V9.pick={}; ATT.restored=false; ATT.dwgErr=""; ATT.specErr="";
      try{ if(typeof state!=="undefined"){ state.pdfName=null; } localStorage.removeItem(V9KEY); }catch(e){}
      $("v9stat").innerHTML="위 칸에 용량계산서·설계도면·시방서·전기계측 도면을 넣으면(한꺼번에 넣어도 됨) 자료를 대조해 검토서 엑셀을 만듭니다."; renderCmp9(); },0)); }
  renderCmp9();
})();
