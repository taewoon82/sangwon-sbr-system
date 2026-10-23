// ===== DWG 추출 규칙 (SBR 반응조 · 유량조정조) — 브라우저/노드 공용 =====
// 입력: libredwg-web convert() 결과의 entities 배열
// 블록 안에 그려진 단면도·문자(수위 E.L·D.W.L 등)를 모델 공간 좌표로 펼침
function dwgExpand(entities, blockRecords, maxDepth){
  if(!blockRecords||!blockRecords.length) return entities;
  const by={}; for(const b of blockRecords){ if(b&&b.name&&!/^\*(Model|Paper)_Space/i.test(b.name)) by[b.name]=b; }
  const out=[...entities]; let budget=400000;
  const tf=(p,M)=>{ if(!p) return p; const x=(p.x-M.bx)*M.sx, y=(p.y-M.by)*M.sy; return {x:M.ix+x*M.c-y*M.s, y:M.iy+x*M.s+y*M.c, z:p.z}; };
  const go=(ents,M,depth)=>{
    for(const e of ents){ if(--budget<0) return;
      if(e.type==="INSERT"){ if(depth>=maxDepth) continue; const b=by[e.name]; if(!b||!b.entities) continue;
        const r=(e.rotation||0)*(Math.abs(e.rotation||0)>6.3?Math.PI/180:1), ip=M?tf(e.insertionPoint,M):e.insertionPoint;
        const sx=(e.xScale||1)*(M?M.sx:1), sy=(e.yScale||1)*(M?M.sy:1), rot=r+(M?Math.atan2(M.s,M.c):0);
        go(b.entities,{ix:ip.x,iy:ip.y,bx:(b.basePoint||{}).x||0,by:(b.basePoint||{}).y||0,sx,sy,c:Math.cos(rot),s:Math.sin(rot)},depth+1); continue; }
      if(!M) continue;
      if(!/^(TEXT|MTEXT|DIMENSION|CIRCLE|LWPOLYLINE)$/.test(e.type)) continue;
      const n={...e, _blk:true};
      for(const k of ["startPoint","insertionPoint","endPoint","center","textPoint","definitionPoint","subDefinitionPoint1","subDefinitionPoint2"]) if(e[k]) n[k]=tf(e[k],M);
      if(e.vertices) n.vertices=e.vertices.map(v=>({...v,...tf(v,M)}));
      if(e.radius) n.radius=e.radius*Math.abs(M.sx);
      if(e.textHeight) n.textHeight=e.textHeight*Math.abs(M.sy);
      out.push(n);
    }
  };
  go(entities,null,0);
  return out;
}
function dwgExtract(entities, blockRecords){
  entities = dwgExpand(entities, blockRecords, 3);
  const clean = s => String(s||"").replace(/\\[A-Za-z][^;\\]*;|\\P|[{}]/g," ").replace(/%%[cC]/g,"Ø").replace(/\s+/g," ").trim();
  const T = [], D = [], INS = [], SQ = [], CIR = [], DECP = [];
  const DECL=/DECANTER|디캔터|배출\s*장치/i;
  const COLL=/토목|주열|기둥|col|구조/i;
  const sq=(pts,layer)=>{ if(!pts||pts.length<4) return; const xs=pts.map(p=>p.x), ys=pts.map(p=>p.y); const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys); const w=x1-x0,hh=y1-y0; if(w>=250&&w<=1200&&hh>=250&&hh<=1200&&Math.abs(w-hh)<=Math.max(w,hh)*0.4) SQ.push({x:(x0+x1)/2,y:(y0+y1)/2,w,h:hh,layer}); };
  for(const e of entities){
    if(DECL.test(e.layer||"")){ const pts=e.type==="LINE"?[e.startPoint,e.endPoint]:e.type==="LWPOLYLINE"?(e.vertices||[]):e.type==="INSERT"?[e.insertionPoint]:e.type==="CIRCLE"?[e.center]:[]; pts.forEach(p=>p&&DECP.push({x:p.x,y:p.y})); }
    if(e.type==="CIRCLE"&&e.center&&e.radius>0) CIR.push({x:e.center.x,y:e.center.y,r:e.radius,layer:e.layer});
    if(e.type==="INSERT"&&e.insertionPoint){ INS.push({name:e.name||"",layer:e.layer,x:e.insertionPoint.x,y:e.insertionPoint.y,rot:e.rotation||0}); continue; }
    if(e.type==="LWPOLYLINE"&&COLL.test(e.layer||"")&&e.vertices&&(e.vertices.length===4||e.vertices.length===5)){ sq(e.vertices,e.layer); continue; }
    if(e.type==="HATCH"&&COLL.test(e.layer||"")&&e.boundaryPaths){ for(const bp of e.boundaryPaths){ const pts=(bp.vertices&&bp.vertices.length?bp.vertices:(bp.edges||[]).flatMap(ed=>[ed.start,ed.end].filter(Boolean))); sq(pts,e.layer); } continue; }
    if(e.type==="TEXT"||e.type==="MTEXT"){ const p=e.startPoint||e.insertionPoint; const s=clean(e.text||e.contents); if(p&&s){ const an=(e.type==="TEXT"&&e.halign&&e.endPoint)?e.endPoint:p; T.push({s,x:p.x,y:p.y,ax:an.x,layer:e.layer,h:e.textHeight||0}); } }
    else if(e.type==="DIMENSION"){ const p=e.textPoint||e.definitionPoint; if(p&&isFinite(e.measurement)) D.push({m:e.measurement,x:p.x,y:p.y,p1:e.subDefinitionPoint1,p2:e.subDefinitionPoint2,layer:e.layer,txt:clean(e.text)}); }
  }
  // 도면 단위 축척: 선형 치수의 (정의점 거리 / 측정값) 중앙값 → 1이면 1:1 mm
  const sc=[]; for(const d of D){ if(d.p1&&d.p2&&d.m>100){ const L=Math.hypot(d.p1.x-d.p2.x,d.p1.y-d.p2.y); if(L>0) sc.push(L/d.m); } }
  sc.sort((a,b)=>a-b); const unit = sc.length? sc[sc.length>>1] : 1;
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const vote=arr=>{ const c={}; arr.forEach(v=>c[v]=(c[v]||0)+1); return Object.entries(c).sort((a,b)=>b[1]-a[1]).map(([v,n])=>({v:+v,n})); };
  const titles=T.filter(t=>/평면도|단면도/.test(t.s)&&/제목/.test(t.layer||"")||/^(상부|하부)?\s*평면도|단면도\s*\(\d+\)/.test(t.s));
  const nearestTitle=p=>{ let b=null,bd=1e18; for(const t of titles){ const d=Math.abs(t.x-p.x)*0.6+Math.max(0,p.y-t.y>0? (p.y-t.y):(t.y-p.y)*0.3); if(t.y<p.y-500*unit) { } if(d<bd){bd=d;b=t;} } return b; };
  const kind=p=>{ const t=nearestTitle(p); return t? (/단면/.test(t.s)?"sec":/평면/.test(t.s)?"plan":"?") : "?"; };
  const EL=(re,s)=>{ const m=s.match(re); return m?parseFloat(m[1]):null; };
  const levels = T.map(t=>({...t,
    hwl:EL(/(?:H|D)\.?\s*W\.?\s*L\.?\s*\(?\+?\)?\s*(\d+\.\d+)/i,t.s),
    lwl:EL(/L\.?\s*W\.?\s*L\.?\s*\(?\+?\)?\s*(\d+\.\d+)/i,t.s),
    el: /^\s*(E\.?\s*L|F\.?\s*L|FGL)\.?\s*\(?\+?\)?\s*\d/i.test(t.s)? EL(/(\d+\.\d+)/,t.s):null,
    bop:EL(/BOP\s*\(?\+?\)?\s*(\d+\.\d+)/i,t.s)}));

  function tank(labelRe, opt={}){
    const labs=T.filter(t=>labelRe.test(t.s));
    const R=(opt.R||7000)*unit;
    const out={labels:labs.length, n:new Set(labs.map(t=>(t.s.match(/#\s*(\d+)/)||[])[1]).filter(Boolean)).size||null};
    if(!labs.length) return out;
    // 수위: 라벨별로 가장 가까운 HWL/LWL 문자 → 투표
    const near=(key)=>{ const vals=[]; for(const l of labs){ let b=null,bd=R; for(const t of levels){ if(t[key]==null) continue; const d=dist(t,l); if(d<bd){bd=d;b=t;} } if(b) vals.push(b[key]); } return vote(vals); };
    out.hwlVotes=near("hwl"); out.lwlVotes=near("lwl");
    const cands=(key,filt)=>{ const m={}; for(const l of labs){ for(const t of levels){ const v=t[key]; if(v==null||(filt&&!filt(t))) continue; const d=dist(t,l); if(d<R*1.2 && (m[v]==null||d<m[v])) m[v]=d; } } return Object.entries(m).map(([v,d])=>({v:+v,d})).sort((a,b)=>a.d-b.d); };
    out.cand={hwl:cands("hwl"), lwl:cands("lwl"), el:cands("el")};
    out.hwl=out.hwlVotes[0]?.v ?? null; out.lwl=out.lwlVotes[0]?.v ?? null; if(out.hwl!=null&&out.lwl!=null&&out.lwl>=out.hwl) out.lwl=null;
    // 바닥 EL: 단면 라벨 근처 EL 중 LWL보다 낮은 값의 최빈값 / 상부 EL: HWL보다 높은 값 중 가장 가까운 레벨의 최빈값
    const els=[]; for(const l of labs){ for(const t of levels){ if(t.el!=null && dist(t,l)<R*1.2) els.push(t.el); } }
    const ref=out.lwl??out.hwl; const below=vote(els.filter(v=>ref!=null? v<ref : true)); out.bottom=below[0]?.v ?? null;
    const els2=[]; for(const l of labs){ for(const t of levels){ if(t.el!=null && dist(t,l)<R*2.2) els2.push(t.el); } }
    const above=els2.filter(v=>out.hwl!=null && v>out.hwl && v-out.hwl<3.5);
    const av=vote(above); out.top=av.length? av.sort((a,b)=>b.n-a.n||a.v-b.v)[0].v : null;
    // 평면 치수: 라벨 주변 치수 (3~30m)
    // 평면 치수: 라벨이 치수선 구간 안에 들어가는(라벨을 가로지르는) 치수 → 내부 폭·길이 후보
    const cand=[], dirs={};
    for(const l of labs){ for(const d of D){ if(!d.p1||!d.p2||d.m<(opt.min||2000)||d.m>(opt.max||30000)) continue;
      const vx=d.p2.x-d.p1.x, vy=d.p2.y-d.p1.y, L2=vx*vx+vy*vy; if(!L2) continue;
      const tpar=((l.x-d.p1.x)*vx+(l.y-d.p1.y)*vy)/L2; if(tpar<0.05||tpar>0.95) continue;
      const perp=Math.abs((l.x-d.p1.x)*vy-(l.y-d.p1.y)*vx)/Math.sqrt(L2);
      const dimPerp=Math.abs((d.x-d.p1.x)*vy-(d.y-d.p1.y)*vx)/Math.sqrt(L2); // 치수선까지 거리
      if(perp>Math.sqrt(L2)*1.2 || dimPerp>perp+3000*unit) continue;
      const m=Math.round(d.m); cand.push(m); const dir=Math.abs(vx)>=Math.abs(vy)?"x":"y"; (dirs[m]=dirs[m]||{x:0,y:0})[dir]++; } }
    out.dimVotes=vote(cand).slice(0,30).map(o=>({...o,dir:dirs[o.v]}));
    // 평면 위치: 라벨별 가로지르는 치수 구간 (적용 W·L과 맞는 것을 앱에서 골라 반응조 내부 사각형으로 사용)
    out.spans=labs.map(l=>({x:l.x,y:l.y,s:(t=>{ const r=[]; for(const d of D){ if(!d.p1||!d.p2||d.m<2000||d.m>40000) continue; const vx=d.p2.x-d.p1.x, vy=d.p2.y-d.p1.y; const ax=Math.abs(vx)>=Math.abs(vy)?"x":"y"; if(Math.min(Math.abs(vx),Math.abs(vy))>1) continue;
        const a=ax==="x"?Math.min(d.p1.x,d.p2.x):Math.min(d.p1.y,d.p2.y), b=ax==="x"?Math.max(d.p1.x,d.p2.x):Math.max(d.p1.y,d.p2.y), c=ax==="x"?l.x:l.y;
        if(c>a&&c<b && Math.abs((ax==="x"?d.p1.y:d.p1.x)-(ax==="x"?l.y:l.x))<20000*unit) r.push({m:Math.round(d.m),ax,a,b}); } return r; })()}));
    return out;
  }
  const sbr=tank(/SBR\s*반응조/i);
  const eq=tank(/유량\s*조정조/, {RP:9000});
  const ef=tank(/^처리수조\s*(#\s*\d+)?$/, {R:4000});
  // 기기 태그: 2M-xxx 코드 + 근처 명칭
  const tags=[]; const CODE=/\b(\d?M-\d{3}(?:[-\w/~]*)?)/;
  for(const t of T){ const m=t.s.match(CODE); if(!m) continue;
    const nm=T.filter(o=>o!==t && !CODE.test(o.s) && dist(o,t)<1600*unit && Math.abs(o.x-t.x)<1600*unit && /[가-힣]/.test(o.s) && o.s.length<=14).sort((a,b)=>dist(a,t)-dist(b,t)).slice(0,2).map(o=>o.s);
    tags.push({code:m[1], name:nm.join(" "), x:t.x, y:t.y, kind:kind(t)}); }
  const uniq={}; tags.forEach(t=>{ const k=t.code; if(!uniq[k]) uniq[k]={code:k,name:t.name,count:0}; uniq[k].count++; if(t.name.length>uniq[k].name.length) uniq[k].name=t.name; });
  const eqList=Object.values(uniq).filter(e=>e.name).sort((a,b)=>a.code.localeCompare(b.code));
  const sbrLabs=T.filter(t=>/SBR\s*반응조/i.test(t.s));
  const nearSbr=code=>tags.some(t=>t.code===code && sbrLabs.some(l=>dist(t,l)<16000*unit));
  const has=re=>eqList.filter(e=>re.test(e.name)).sort((a,b)=>(nearSbr(b.code)-nearSbr(a.code))||b.count-a.count)[0];
  // 펌프 (도면 기기명 + 태그) · 배관 표기 ('150A-TW-STS')
  const PIPE=/^(\d{2,3})A-([A-Za-z]+)(?:-|$)/;
  const pipes=T.map(t=>{ const m=t.s.match(PIPE); return m?{x:t.x,y:t.y,a:+m[1],svc:m[2].toUpperCase()}:null; }).filter(Boolean);
  const eqLabs=T.filter(t=>/유량\s*조정조/.test(t.s)), efLabs=T.filter(t=>/처리수조/.test(t.s));
  const BASE=/(\d?M-\d{3})/;
  const pumpOf=(nameRe, refs, svcRe)=>{ const by={};
    for(const t of T){ const k=t.s.replace(/\s/g,""); if(k.length>16||!nameRe.test(k)) continue;
      const tg=T.filter(o=>CODE.test(o.s)&&dist(o,t)<1600*unit).sort((a,b)=>dist(a,t)-dist(b,t))[0]; if(!tg) continue;
      const base=(tg.s.match(BASE)||[])[1]; if(!base) continue; const disp=tg.s.match(CODE)[1];
      const dRef=refs.length?Math.min(...refs.map(l=>dist(l,t))):1e12;
      const o=by[base]||(by[base]={code:disp,name:k,d:dRef,n:0,pv:{}}); o.n++; if(disp.length>o.code.length) o.code=disp; if(dRef<o.d) o.d=dRef;
      if(svcRe){ const np=pipes.filter(p=>svcRe.test(p.svc)&&dist(p,tg)<6000*unit).sort((a,b)=>dist(a,tg)-dist(b,tg))[0]; if(np){ const kk=np.a+"A-"+np.svc; o.pv[kk]=(o.pv[kk]||0)+1; } } }
    for(const o of Object.values(by)){ const top=Object.entries(o.pv).sort((a,b)=>b[1]-a[1])[0]; if(top&&top[1]>=2){ o.pipe={a:parseInt(top[0]),label:top[0],n:top[1]}; } delete o.pv; }
    const arr=Object.values(by).sort((a,b)=>a.d-b.d||b.n-a.n); return arr[0]? {...arr[0], others:arr.slice(1).filter(o=>o.d<Math.max(arr[0].d*3,15000*unit)).slice(0,3).map(o=>o.code)} : null; };
  // 기기목록표 / 장비 일람표 (도면 안의 표): 기기번호 · 명칭 · 단계별 수량(예비)
  const equipTable=(()=>{ const out={}; const heads=T.filter(t=>/^(기기|장비)\s*(목록표|일람표|목록)$/.test(t.s.replace(/\s+/g," ").trim()));
    for(const hd of heads){
      const near=T.filter(t=>t.y<hd.y+200 && t.y>hd.y-4000*unit && t.x>hd.x-3000*unit && t.x<hd.x+30000*unit);
      const nameH=near.find(t=>/^기기\s*명칭|^장비\s*명|^기기명|^품\s*명/.test(t.s)), tagH=near.find(t=>/^기기\s*번호|^장비\s*번호|^TAG/i.test(t.s));
      if(!nameH||!tagH) continue;
      const stg=near.filter(t=>/^단\s*계$/.test(t.s)).map(t=>({ax:t.ax, n:+((near.find(o=>/^\d$/.test(o.s)&&Math.abs(o.ax-t.ax)<300*unit&&o.y>t.y)||{}).s)||0})).filter(o=>o.n).sort((a,b)=>a.n-b.n);
      const qtyH=near.find(t=>/^수\s*량/.test(t.s));
      const cols=stg.length?stg:(qtyH?[{ax:qtyH.ax,n:1}]:[]);
      const y0=Math.min(nameH.y,tagH.y,...near.filter(t=>/^단\s*계$/.test(t.s)).map(t=>t.y))-400*unit;
      const body=T.filter(t=>t.y<y0 && t.y>y0-60000*unit && t.x>hd.x-3000*unit && t.x<hd.x+30000*unit).sort((a,b)=>b.y-a.y);
      const rows=[]; for(const t of body){ const r=rows.find(r=>Math.abs(r.y-t.y)<350*unit); if(r) r.items.push(t); else rows.push({y:t.y,items:[t]}); }
      rows.sort((a,b)=>b.y-a.y); let lastY=null;
      for(const r of rows){ if(lastY!=null && lastY-r.y>2500*unit) break; lastY=r.y;
        const tg=r.items.find(t=>CODE.test(t.s)); if(!tg) continue; const code=tg.s.match(CODE)[1];
        const nm=r.items.filter(t=>/[가-힣]/.test(t.s) && Math.abs(t.ax-nameH.ax)<Math.abs(t.ax-tagH.ax)+6000*unit && t!==tg).map(t=>t.s).join(" ");
        const qty={}; for(const c of cols){ const q=r.items.find(t=>Math.abs(t.ax-c.ax)<500*unit && /^(\d+(\(\d+\))?|-)$/.test(t.s)); if(q) qty[c.n]=q.s; }
        if(!out[code]) out[code]={code,name:nm.replace(/\s+/g,""),qty,stages:cols.length}; } }
    return Object.values(out); })();
  const eqOf=re=>equipTable.find(e=>re.test(e.name));
  const pumps={
    feed: pumpOf(/^(유량조정조(공급|이송)?|공급|SBR공급|반응조공급|원수공급)펌프$/, eqLabs.length?eqLabs:sbrLabs, /^(WW|SW|RW|IW|RAW|IN)/),
    eff:  pumpOf(/^(처리수(이송|공급)?|총인(설비|처리|처리설비)?공급|처리수조이송)펌프$/, efLabs.length?efLabs:sbrLabs, /^(TW|EW|OW|PW)/)
  };
  const tw={}; let twN=0; for(const p of pipes){ if(/^TW/.test(p.svc) && sbrLabs.some(l=>dist(l,p)<8000*unit)){ tw[p.a]=(tw[p.a]||0)+1; twN++; } }
  const twTop=Object.entries(tw).sort((a,b)=>b[1]-a[1])[0];
  const decPipe = twTop? {a:+twTop[0], n:twTop[1], total:twN, sizes:tw} : null;
  const near20=p=>sbrLabs.some(l=>dist(p,l)<22000*unit);
  const blocks={aer:INS.filter(b=>/포기장치|aerator|turbine/i.test(b.name)&&near20(b)).map(b=>({x:b.x,y:b.y,rot:b.rot,name:b.name})),
                dec:INS.filter(b=>/배출장치|decanter/i.test(b.name)&&near20(b)).map(b=>({x:b.x,y:b.y,rot:b.rot,name:b.name}))};
  const cir=CIR.filter(c=>near20(c)&&c.r>=250*unit&&c.r<=1400*unit).map(c=>({x:c.x,y:c.y,r:c.r,layer:c.layer}));
  const decPts=DECP.filter(p=>near20(p)).slice(0,4000);
  const seen=new Set(); const cols=SQ.filter(c=>near20(c)).filter(c=>{ const k=Math.round(c.x/50)+","+Math.round(c.y/50); if(seen.has(k)) return false; seen.add(k); return true; });
  return {unit, nText:T.length, nDim:D.length, sbr, eq, ef, equipment:eqList, blocks, cols, cir, decPts,
    pumps, decPipe, equipTable,
    eqAer:eqOf(/포기장치|표면포기/), eqDec:eqOf(/배출장치|디캔터/), eqFeed:eqOf(/반응조\s*공급펌프|유량조정조(공급|이송)?펌프|^공급펌프/), eqEff:eqOf(/처리수(이송)?펌프|총인\S*공급펌프/), eqWas:eqOf(/잉여슬러지/),
    hoist:has(/호이스트/), aerator:has(/포기장치/), decanter:has(/배출장치/), pump:has(/공급\s*펌프/),
    bops: levels.filter(t=>t.bop!=null).map(t=>({v:t.bop, s:t.s}))};
}
if(typeof module!=="undefined") module.exports={dwgExtract,dwgExpand};
