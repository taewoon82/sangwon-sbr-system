// ===== DWG 추출 규칙 (SBR 반응조 · 유량조정조) — 브라우저/노드 공용 =====
// 입력: libredwg-web convert() 결과의 entities 배열
function dwgExtract(entities){
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
    if(e.type==="TEXT"||e.type==="MTEXT"){ const p=e.startPoint||e.insertionPoint; const s=clean(e.text||e.contents); if(p&&s) T.push({s,x:p.x,y:p.y,layer:e.layer,h:e.textHeight||0}); }
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
    hwl:EL(/H\.?\s*W\.?\s*L\.?\s*\(?\+?\)?\s*(\d+\.\d+)/i,t.s),
    lwl:EL(/L\.?\s*W\.?\s*L\.?\s*\(?\+?\)?\s*(\d+\.\d+)/i,t.s),
    el: /^\s*(EL|FL|FGL)\.?\s*\(?\+?\)?\s*\d/i.test(t.s)? EL(/(\d+\.\d+)/,t.s):null,
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
    const above=els.filter(v=>out.hwl!=null && v>out.hwl && v-out.hwl<3.5);
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
  const ef=tank(/^처리수조$/, {R:2500});
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
  const near20=p=>sbrLabs.some(l=>dist(p,l)<22000*unit);
  const blocks={aer:INS.filter(b=>/포기장치|aerator|turbine/i.test(b.name)&&near20(b)).map(b=>({x:b.x,y:b.y,rot:b.rot,name:b.name})),
                dec:INS.filter(b=>/배출장치|decanter/i.test(b.name)&&near20(b)).map(b=>({x:b.x,y:b.y,rot:b.rot,name:b.name}))};
  const cir=CIR.filter(c=>near20(c)&&c.r>=250*unit&&c.r<=1400*unit).map(c=>({x:c.x,y:c.y,r:c.r,layer:c.layer}));
  const decPts=DECP.filter(p=>near20(p)).slice(0,4000);
  const seen=new Set(); const cols=SQ.filter(c=>near20(c)).filter(c=>{ const k=Math.round(c.x/50)+","+Math.round(c.y/50); if(seen.has(k)) return false; seen.add(k); return true; });
  return {unit, nText:T.length, nDim:D.length, sbr, eq, ef, equipment:eqList, blocks, cols, cir, decPts,
    hoist:has(/호이스트/), aerator:has(/포기장치/), decanter:has(/배출장치/), pump:has(/공급\s*펌프/),
    bops: levels.filter(t=>t.bop!=null).map(t=>({v:t.bop, s:t.s}))};
}
if(typeof module!=="undefined") module.exports={dwgExtract};
