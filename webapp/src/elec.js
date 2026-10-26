// ===== v12.3: 전기·계측제어 도면 읽기 — 반응조 제어반 전원(차단기·케이블·부하), MCC, RCS·통신, 반응조 계측기 =====
// 입력 sheets: [{name, page, items:[{s,x,y,h}]}]  (PDF 쪽 단위 또는 DWG 전체; 좌표 단위는 시트마다 달라도 됨 — 글자 높이 기준으로 판단)
// panelTags: 시방서·승인도서에서 읽은 반응조 제어반 기기번호 (예: "2M-300", "M-301")
const EL_PANEL = /반응조\s*제어반|반응조제어반|공법사?\s*제어반|포기\s*및\s*배출\s*장치|반응조\s*\(\s*포기/;
const EL_SRC = /\b(MCC-?[A-Z]?\d{1,4}[A-Z]?|LV-?[A-Z]?\d{0,3}|MDP-?\d*|P-?MCC\d*)\b/;
const EL_BRK = /(\d{2,4})\s*AF\s*\/\s*(\d{1,4})\s*AT/i;
const EL_CAB = /(?:F[-~]?CV|TFR-?CV|HFIX)\s*(?:\d+C\s*[*x×]?\s*\d*\s*\/\s*)?\d+(?:\.\d+)?\s*(?:㎟|mm2|mm²|SQ|sq|mi\b|㎡)(?:\s*[x×]\s*\d+)?|(?:F-?CV)\s*\d+\s*-\s*\d+C\s*[xX×]\s*\d+/i;
const EL_KW = /(?:3\s*[øφфΦ]\s*)?(?:380\s*V\s*)?(\d{1,3}(?:\.\d{1,2})?)\s*kW/i;
function elRows(sh, vert){
  if(vert) sh={items:sh.items.map(i=>({...i, x:-i.y, y:i.x}))};   // 90° 돌아간 표(세로 글자): 축을 바꿔 같은 방식으로 줄을 만듦
  const it=sh.items.filter(i=>i.s&&i.s.trim()).slice().sort((a,b)=>a.y-b.y||a.x-b.x); const rows=[];
  for(const i of it){ const tol=Math.max((i.h||8)*0.45, 1e-6); const r=rows.find(r=>Math.abs(r.y-i.y)<=tol); if(r) r.items.push(i); else rows.push({y:i.y,items:[i]}); }
  const out=[];
  for(const r of rows){ r.items.sort((a,b)=>a.x-b.x); let cur=null, px=null;
    for(const i of r.items){ const h=i.h||8; if(!cur || (i.x-px)>40*h){ cur={y:r.y,x0:i.x,items:[]}; out.push(cur); } cur.items.push(i); px=i.x+Math.max(i.w||0, i.s.length*h*0.8); } }
  for(const r of out) r.s=r.items.map(i=>i.s.trim()).join(" ").replace(/\s+/g," ").replace(/([가-힣])\s(?=[가-힣](?:\s|$|[가-힣]))/g,"$1");   // 글자 인식이 한 글자씩 끊은 한글 이어 붙임
  // 표의 " · 〃 (위와 같음) → 바로 위 줄의 첫 칸(출처 패널)으로 바꿈
  out.sort((a,b)=>a.y-b.y);
  for(let k=0;k<out.length;k++){ const r=out[k]; if(!/^(["“”〃]|&quot;)/.test(r.s)) continue; const h=r.items[0].h||8;
    for(let j=k-1;j>=0&&j>k-40;j--){ const q=out[j]; if(Math.abs(q.x0-r.x0)<3*h){ const m=q.s.match(/^(\S+)/); if(m&&!/^(["“”〃]|&quot;)/.test(m[1])){ r.s=r.s.replace(/^(["“”〃]|&quot;)/, m[1]); break; } } } }
  return out;
}
function elMedH(items){ const hs=items.map(i=>i.h||0).filter(h=>h>0).sort((a,b)=>a-b); return hs.length?hs[hs.length>>1]:8; }
function elecParse(sheets, panelTags){
  const found={};   // 1차: '반응조 제어반' 글자와 같은 줄에 있는 기기번호를 모아 제어반 번호로 씀
  for(const sh of sheets) for(const r of [...elRows(sh), ...elRows(sh,true)]) if(EL_PANEL.test(r.s)) for(const m of r.s.matchAll(/(?:^|[^A-Z0-9])(?:[A-Z]{2,4}-?)?(\d?M)-?(\d{3})(?![0-9])/g)) { const t=m[1]+"-"+m[2]; found[t]=(found[t]||0)+1; }
  const auto=Object.keys(found).filter(t=>found[t]>=2).sort((a,b)=>found[b]-found[a]).slice(0,2);
  const tags=[...new Set([...(panelTags||[]), ...auto].filter(Boolean).map(t=>t.replace(/\s/g,"")))];
  const tagRe = tags.length? new RegExp("(?:^|[^A-Z0-9-])(?:[A-Z]{2,4}-)?("+tags.map(t=>t.replace(/[-]/g,"-?")).join("|")+")(?![0-9-])") : null;
  const isPanel = s => EL_PANEL.test(s) || (tagRe && tagRe.test(s.replace(/\s/g," ")));
  const R={feeds:[], inst:{}, instTags:[], rcs:[], comm:[], loc:[], sheets:sheets.length, panelTags:tags};
  const add=(arr,v)=>{ if(v && !arr.includes(v)) arr.push(v); };
  for(const sh of sheets){
    const H=elMedH(sh.items); const rows=[...elRows(sh), ...elRows(sh,true).filter(r=>r.items.length>=3)]; const ref=sh.name+(sh.page?` p.${sh.page}`:"");
    const all=rows.map(r=>r.s).join("\n");
    const title=(all.match(/[^\n]*(?:단선\s*결선도|단선도|결선도|Cable\s*schedule|기기\s*배치|구성도|평면도)[^\n]*/i)||[""])[0].slice(0,60);
    // --- 반응조 제어반이 나오는 줄: 전원 출처·케이블·부하
    for(const r of rows){ if(!isPanel(r.s)) continue;
      const pi=r.items.find(i=>isPanel(i.s)||/반응조|제어반/.test(i.s)); const srcs=r.items.filter(i=>EL_SRC.test(i.s)&&!isPanel(i.s));
      const sI=pi&&srcs.length? srcs.slice().sort((a,b)=>Math.abs(a.x-pi.x)-Math.abs(b.x-pi.x))[0] : srcs[0];
      const src=sI? sI.s.match(EL_SRC)[1] : (r.s.replace(EL_PANEL,"").match(EL_SRC)||[])[1]; const cab=(r.s.match(EL_CAB)||[])[0]; const kw=(r.s.match(EL_KW)||[])[1];
      if(src||cab||kw) R.feeds.push({src, cab:cab&&cab.replace(/\s+/g," "), kw:kw?+kw:null, row:r.s.slice(0,140), ref});
      if(/기기\s*배치|평면도/.test(title)) add(R.loc, `${title.replace(/\s*S\s*=.*$/,"")} (${ref})`);
    }
    // --- 패널 글자 주변: 차단기(AF/AT)·부하(kW) — 단선결선도는 세로 글자라 같은 줄이 아님
    const pItems=sh.items.filter(i=>isPanel(i.s));
    if(!pItems.length) for(const r of rows) if(isPanel(r.s)){ let a=r.items.find(i=>/반응조|제어반|포기/.test(i.s)||(tagRe&&tagRe.test(" "+i.s)));
        if(!a) for(let k=0;k<r.items.length&&!a;k++){ const seg=r.items.slice(k,k+7).map(i=>i.s).join(""); if(EL_PANEL.test(seg)&&/^(공|반|포)/.test(r.items[k].s)) a=r.items[k]; }
        if(a) pItems.push(a); }
    // 세로 글자(단선결선도 부하명): 같은 x에 위아래로 이어진 글자를 합쳐서 판단
    for(const i of sh.items){ if(!/반응조|^제어반|^M-?\d|^\d?M-?3/.test(i.s)) continue; const col=sh.items.filter(j=>Math.abs(j.x-i.x)<(i.h||H)*0.6&&Math.abs(j.y-i.y)<(i.h||H)*12).sort((a,b)=>a.y-b.y).map(j=>j.s).join(""); if(EL_PANEL.test(col)&&!pItems.includes(i)) pItems.push(i); }
    if(pItems.length){
      const brk=sh.items.filter(i=>EL_BRK.test(i.s)); const kwI=sh.items.filter(i=>EL_KW.test(i.s));
      for(const p of pItems){ const near=(arr,rad)=>arr.map(i=>({i,dx:i.x-p.x,dy:i.y-p.y})).filter(o=>Math.abs(o.dx)<rad&&Math.abs(o.dy)<rad*3);
        const ph=p.h||H;
        for(const sw of [false,true]){   // 돌아간 쪽(세로 표기 도면)은 축을 바꿔 다시 찾음
          const T=i=>sw?{x:-i.y,y:i.x}:{x:i.x,y:i.y}; const pp=T(p);
          const B=brk.map(i=>{ const q=T(i); return {i,dx:q.x-pp.x,dy:q.y-pp.y}; }).filter(o=>Math.abs(o.dx)<6*ph&&Math.abs(o.dy)<60*ph);   // 같은 세로줄(부하선)에 있는 차단기만
          if(!B.length) continue;
          const n0=B.slice().sort((a,b)=>Math.hypot(a.dx,a.dy)-Math.hypot(b.dx,b.dy))[0]; const rowB=B.filter(o=>Math.abs(o.dy-n0.dy)<H*1.5).sort((a,b)=>a.dx-b.dx);
          const gaps=[]; for(let k=1;k<rowB.length;k++) gaps.push(rowB[k].dx-rowB[k-1].dx); gaps.sort((a,b)=>a-b); const sp=gaps.length?gaps[gaps.length>>1]:20*H;
          const L=rowB.filter(o=>o.dx<0).pop(), Rt=rowB.find(o=>o.dx>=0);
          const pick = !L?Rt : !Rt?L : (Math.abs(L.dx)>0.25*sp && Math.abs(Rt.dx)>0.25*sp)? Rt : (Math.abs(L.dx)<Math.abs(Rt.dx)?L:Rt);
          const m=pick.i.s.match(EL_BRK); R.feeds.push({brkAF:+m[1], brkAT:+m[2], ref, how:"차단기"}); break; }
        // 부하표(단선결선도 아래 표): '용량 kW' 줄에서 패널과 같은 열의 숫자
        { const ph2=p.h||H; const hdr=sh.items.filter(i=>/^용\s*량$|^용량\s*\(?kW\)?$|부하\s*용량|CAPACITY/i.test(i.s.trim()));
          for(const hd of hdr){ const v=sh.items.filter(i=>/^\d{1,3}(?:\.\d{1,2})?$/.test(i.s.trim()) && Math.abs(i.y-hd.y)<ph2*0.8 && Math.abs(i.x-p.x)<5*ph2).sort((a,b)=>Math.abs(a.x-p.x)-Math.abs(b.x-p.x))[0];
            if(v && Math.abs(v.y-p.y)<30*ph2){ R.feeds.push({kw:+v.s.trim(), ref, how:"부하표"}); break; } }
          if(!R.feeds.some(f=>f.how==="부하표"&&f.ref===ref)){ const bk=brk.filter(i=>Math.abs(i.x-p.x)<6*ph2 && i.y>p.y && i.y-p.y<30*ph2).sort((a,b)=>a.y-b.y)[0];
            if(bk){ const v=sh.items.filter(i=>/^\d{1,3}(?:\.\d{1,2})?$/.test(i.s.trim()) && Math.abs(i.x-p.x)<6*ph2 && i.y>p.y && i.y<bk.y).sort((a,b)=>b.y-a.y)[0]; if(v) R.feeds.push({kw:+v.s.trim(), ref, how:"부하표"}); } } }
        const K=near(kwI,25*H).sort((a,b)=>Math.hypot(a.dx,a.dy)-Math.hypot(b.dx,b.dy))[0];
        if(K) R.feeds.push({kw:+K.i.s.match(EL_KW)[1], ref, how:"부하"});
        const S=sh.items.filter(i=>EL_SRC.test(i.s)&&!isPanel(i.s)).map(i=>({i,d:Math.hypot(i.x-p.x,(i.y-p.y)*0.3)})).filter(o=>o.d<60*H).sort((a,b)=>a.d-b.d)[0];
        if(S && /MCC|LV|MDP/.test(S.i.s)) R.feeds.push({src:S.i.s.match(EL_SRC)[1], ref, how:"인접"});
      }
    }
    // --- 반응조 계측기
    for(const r of rows){ const s=r.s; if(!/반응조|SBR/.test(s)) continue;
      for(const [k,re] of [["DO",/\bDO\b|용존\s*산소/],["MLSS",/MLSS/],["pH",/\bpH\b/i],["ORP",/ORP/],["수위계",/수위계|레벨|Level/i],["수위스위치",/수위\s*스위치/],["유량계",/유입\s*유량|유량계/]])
        if(re.test(s)){ R.inst[k]=R.inst[k]||ref; }
      for(const m of s.matchAll(/\b((?:DO|MLSS|pH|ORP|L|LS|F)-\d?\d{2,3}[A-Z]?(?:\s*[,/~]\s*[A-Z])*)/g)) add(R.instTags, m[1].replace(/\s/g,""));
    }
    // --- 감시제어(RCS)·통신
    for(const m of all.matchAll(/\b(RCS(?:-[A-Z0-9]{1,4})?(?![-A-Z0-9])|SCADA|HMI|중앙\s*감시|감시\s*제어반?)/g)) add(R.rcs, m[1].replace(/\s/g,""));
    for(const [k,re] of [["Ethernet",/Ethernet|이더넷|TCP\s*\/?\s*IP/i],["광케이블",/광\s*케이블|Optical|F\.?O\.?\s*Cable|SM\s*\d+C|MM\s*\d+C/i],["Profibus",/Profibus/i],["Modbus",/Modbus/i],["RS-485",/RS-?485/i],["이중화",/\bRing\b|이중화/i]])
      if(re.test(all)) add(R.comm,k);
    // 반응조 제어반 ↔ RCS 연결 줄
    for(const r of rows) if(isPanel(r.s) && /RCS|네트워크|DATA\s*WAY|통신|UTP|Cat\.?\s*\d|광/.test(r.s)) { const rc=(r.s.match(/RCS-?[A-Z0-9]*/)||[])[0], net=(r.s.match(/RS-?485|Ethernet|UTP|광|DATA\s*WAY[^,]*/i)||[])[0]; R.panelNet=R.panelNet||[rc&&`RCS ${rc}`, net].filter(Boolean).join(" · ")||r.s.slice(0,60); }
  }
  { const t3=R.instTags.filter(t=>/-\d?3\d\d/.test(t)); if(t3.length) R.instTags=t3; }   // 생물반응조 계열(3xx) 번호가 있으면 그것만
  // 요약값
  const f=R.feeds;
  { const v={}; for(const x of f){ if(!x.src) continue; v[x.src]=(v[x.src]||0)+(x.how?0.2:1)+(x.cab?2:0); }   // 여러 줄에서 가장 많이 나온 출처 (케이블 표기 줄 가중)
    R.src = Object.keys(v).sort((a,b)=>v[b]-v[a])[0]||null; R.srcVotes=v; }
  R.cab = (f.find(x=>x.cab)||{}).cab||null;
  const b=f.find(x=>x.brkAT); R.brk=b?{AF:b.brkAF,AT:b.brkAT,ref:b.ref}:null;
  const k=f.filter(x=>x.kw).map(x=>x.kw); R.loadKW = k.length? Math.max(...k):null;
  R.capKW = R.brk? Math.round(Math.sqrt(3)*380*R.brk.AT*0.85/100)/10 : null;   // 차단기 정격전류 기준 공급 가능 전력 (380V, 역률 0.85)
  return R;
}
// 검토서 칸 채우기 (판정 전에 호출; 이미 있는 값은 그대로)
function elecFill(c, E){
  if(!E) return;
  const put=(r,f,g)=>{ if(f && (c["F"+r]==null||c["F"+r]==="")) c["F"+r]=f; if(!g) return; const o=c["G"+r]; c["G"+r]= (o==null||o==="")? g : (String(o).includes(g.slice(0,12))? o : `${o} / ${g}`); };
  const feedTxt=[E.src&&`${E.src}에서 공급`, E.brk&&`차단기 ${E.brk.AF}AF/${E.brk.AT}AT`, E.cab, E.loadKW&&`부하 ${E.loadKW}kW`].filter(Boolean).join(" · ");
  if(E.capKW!=null && (c.D74==null||c.D74==="")){ c.D74=E.capKW; put(74,"확인",`전기도면: ${feedTxt} → 380V×${E.brk.AT}A×역률 0.85 ≈ ${E.capKW}kW (${E.brk.ref})`); }
  else if(feedTxt) put(74,"검토",`전기도면: ${feedTxt} — 차단기 용량 표기 확인 필요`);
  if(E.src) put(71,"확인", /^MCC/i.test(E.src)? `반응조 제어반 전원은 ${E.src}(MCC)에서 공급 — MCC는 전기공사분` : `반응조 제어반 전원은 ${E.src}에서 직접 공급 (MCC 경유 안 함)`);
  if(E.loc.length) put(68,"검토",`전기도면 배치: ${E.loc[0]} — 설치 위치·유지관리 공간 확인`);
  const rcs=E.rcs.filter(x=>/RCS|SCADA|감시/.test(x));
  if(rcs.length) put(70,"확인",`전기도면 감시제어: ${rcs.slice(0,4).join(", ")}${E.panelNet?` · 반응조 제어반 연결: ${E.panelNet.slice(0,60)}`:""}`);
  if(E.comm.length) put(79,"확인",`전기도면 통신: ${E.comm.join(" · ")}`);
  const ik=Object.keys(E.inst);
  if(ik.length){ const ok=E.inst.DO && (E.inst["수위계"]||E.inst["수위스위치"]);
    put(80, ok?"확인":"검토", `전기도면 반응조 계측기: ${ik.join("·")}${E.instTags.length?` (${E.instTags.slice(0,6).join(", ")})`:""}${ok?"":" — DO계·수위계 확인 필요"} · 설치 위치·브라켓은 평면도 확인`); }
}

// 전기·계측 도면인지 판별 (글자 중 전기 용어 비율)
const EL_WORD=/MCCB?|\d+\s*AF\s*\/\s*\d+\s*AT|단선\s*결선|결선도|Cable\s*schedule|계측\s*제어|케이블\s*트레이|Cable\s*Tray|분전반|접지|피뢰|F-?CV|F-?CVV/i;
function elScore(strs){ let n=0; for(const s of strs) if(EL_WORD.test(s)) n++; return n; }
function elTextItems(ents){ const out=[]; for(const e of ents){ if(e.type!=="TEXT"&&e.type!=="MTEXT") continue;
  const t=String(e.text||"").replace(/\\P/g," ").replace(/\\[A-Za-z][^;\\]*;|[{}]/g," ").replace(/%%[cC]/g,"Ø").replace(/\s+/g," ").trim(); const p=e.insertionPoint||e.startPoint; if(!t||!p) continue;
  out.push({s:t, x:p.x, y:-p.y, h:e.textHeight||e.height||2.5}); } return out; }
function elPanelTags(){ const t=[]; const sp=V9.spec; if(sp&&sp.panel&&sp.panel.tag) t.push(sp.panel.tag); if(sp&&sp.items) for(const e of sp.items) if(e.type==="panel"&&e.tag) t.push(e.tag); return t; }
function elRefresh(){ try{ window.SBRDBG=Object.assign(window.SBRDBG||{}, {el:()=>({pdf:V9.elecPdf||[], dwg:V9.elecDwg||[], E:V9.elec})}); }catch(_){}
  const sh=[...(V9.elecPdf||[]), ...(V9.elecDwg||[])]; V9.elec = sh.length? elecParse(sh, elPanelTags()) : null; }
function elSummary(E){ if(!E) return ""; const a=[E.src&&`반응조 제어반 전원 ${E.src}`, E.brk&&`${E.brk.AF}AF/${E.brk.AT}AT`, E.loadKW&&`부하 ${E.loadKW}kW`, Object.keys(E.inst).length&&`계측기 ${Object.keys(E.inst).join("·")}`, E.comm.length&&`통신 ${E.comm.join("·")}`].filter(Boolean); return a.join(" · ")||"반응조 관련 전기 항목을 찾지 못함"; }

// ===== 공종별 도면 표기 찾기 (토목·건축·기계·전기 어디에 있든): 십자구조물 · 배출장치 슬리브 · 반응조 덮개/점검구 · 제어반 액세스플로어/베이스 =====
function tpAdd(src, strs){ V9.textPool=(V9.textPool||[]).filter(t=>t.src!==src); for(const s of strs){ const t=String(s||"").replace(/\s+/g," ").trim(); if(t.length>=2&&t.length<=160) V9.textPool.push({s:t, src}); } }
const DN_RULES=[
  {row:44, key:"십자구조물", re:/십자\s*(?:형\s*)?구조물|CROSS\s*(?:STRUCTURE|BEAM|WALL)|십자\s*벽|프로펠러\s*하우징/i},
  {row:47, key:"배출장치 슬리브", re:/(?:SLEEVE|슬리브|스리브)/i, near:/배출|디캔터|DECANTER|처리수|TW|200A|250A|300A/i},
  {row:46, key:"반응조 덮개·점검구", re:/점검구|덮개|GRATING|그레이팅|MAN\s*HOLE|맨홀\s*뚜껑|HATCH/i, near:/반응조|SBR/i},
  {row:73, key:"제어반 액세스플로어·베이스", re:/ACCESS\s*FLOOR|액세스\s*플로어|억세스\s*플로어|이중\s*바닥|FREE\s*ACCESS|채널\s*베이스|CHANNEL\s*BASE|제어반\s*(?:기초|베이스|BASE)/i},
];
function designNotes(){
  const P=V9.textPool||[]; const out={};
  for(const r of DN_RULES){ const hits=[]; for(const t of P){ if(!r.re.test(t.s)) continue; if(r.near && !r.near.test(t.s)) continue; /* 같은 글자 안에 관련어가 있어야 함 (일반 주기사항 제외) */ hits.push(t); }
    if(hits.length){ const bySrc={}; for(const h of hits){ (bySrc[h.src]=bySrc[h.src]||[]).push(h.s); }
      out[r.row]={key:r.key, n:hits.length, srcs:Object.keys(bySrc), sample:[...new Set(hits.map(h=>h.s))].slice(0,3)}; } }
  return out;
}
function designNotesFill(c){
  const N=designNotes(); const put=(r,g)=>{ const o=c["G"+r]; c["G"+r]=(o==null||o==="")?g:(String(o).includes(g.slice(0,10))?o:`${o} / ${g}`); if(c["F"+r]==null||c["F"+r]==="") c["F"+r]="검토"; };
  for(const [row,v] of Object.entries(N)) put(+row, `도면 표기 있음: ${v.sample.map(s=>`‘${s.slice(0,40)}’`).join(", ")} (${v.srcs.slice(0,2).join(", ")}${v.srcs.length>2?` 외 ${v.srcs.length-2}`:""}) — 규격·위치 확인`);
  const miss=DN_RULES.filter(r=>!N[r.row]).map(r=>r.key); return {found:N, miss};
}

// ===== 전기도면 기기별 동력: 기기번호 아래(또는 같은 열 '용량 kW' 줄)의 kW =====
function elecLoad(sheets, tag){
  if(!tag) return null; const base=String(tag).replace(/\s/g,"").replace(/[A-Z](?:[\/~,][A-Z])*$/,"").replace(/[-–—]/g,"-");
  if(base.length<3) return null; const re=new RegExp("(?:^|[^0-9A-Z])(?:LOP-|MOP-)?"+base.replace(/-/g,"[-–—]?")+"(?![0-9])");
  const cands=[];
  for(const sh of sheets){ const pri=/단선|결선|MCC|부하/i.test(sh.title||"")?0:1; const numNote=sh.items.some(i=>/숫자\s*표기|부하\s*용량\s*\(?kW/i.test(i.s));
    for(const sw of [false,true]){ const T=i=>sw?{x:-i.y,y:i.x,h:i.h,s:i.s}:i; const IT=sh.items.map(T);
      for(const it of IT){ const s=it.s.replace(/\s/g,""); if(!re.test(" "+s) || /^LOP|^MOP/.test(s)) continue; const h=it.h||5;
        const lbl=IT.filter(j=>/[가-힣]/.test(j.s) && Math.abs(j.x-it.x)<4*h && Math.abs(j.y-it.y)<7*h).map(j=>j.s).join("").replace(/\s/g,"");
        // ① 바로 아래 '3ø 380V 5.5kW' 형식
        const kwT=IT.filter(j=>/\d\s*kW/i.test(j.s) && Math.abs(j.x-it.x)<8*h && j.y>it.y-0.5*h && j.y<it.y+12*h).sort((a,b)=>a.y-b.y)[0];
        if(kwT){ const m=kwT.s.match(/(\d{1,3}(?:\.\d{1,2})?)\s*kW/i); if(m){ cands.push({kw:+m[1], pri, ref:sh.name+(sh.page?` p.${sh.page}`:""), how:"표기", lbl}); continue; } }
        // ③ 단선결선도에 '숫자표기는 부하용량(kW)' 주기가 있으면 기기번호 바로 옆 숫자
        if(numNote){ const v=IT.filter(j=>/^\d{1,3}(?:\.\d{1,2})?$/.test(j.s.trim()) && Math.hypot(j.x-it.x,(j.y-it.y)*1.5)<7*h).sort((a,b)=>Math.hypot(a.x-it.x,a.y-it.y)-Math.hypot(b.x-it.x,b.y-it.y))[0];
          if(v && +v.s>0 && +v.s<200){ cands.push({kw:+v.s.trim(), pri, ref:sh.name+(sh.page?` p.${sh.page}`:""), how:"단선도 숫자", lbl}); continue; } }
        // ② 부하표: 같은 열의 숫자 중, 그 줄 왼쪽 머리칸이 '용량'·'kW'
        const nums=IT.filter(j=>/^\d{1,3}(?:\.\d{1,2})?$/.test(j.s.trim()) && Math.abs(j.x-it.x)<3.5*h && j.y>it.y && j.y<it.y+20*h).sort((a,b)=>a.y-b.y);
        for(const v of nums){ const rowL=IT.filter(j=>Math.abs(j.y-v.y)<0.9*h && j.x<it.x-6*h).map(j=>j.s).join(" "); const hdr=/kW|용\s*량|부하\s*용량/i.test(rowL)||(/용/.test(rowL)&&!/수/.test(rowL)); if(hdr){ cands.push({kw:+v.s.trim(), pri, ref:sh.name+(sh.page?` p.${sh.page}`:""), how:"부하표", lbl}); break; } }
      } } }
  if(!cands.length) return null; cands.sort((a,b)=>a.pri-b.pri); const c0=cands[0];
  const same=cands.filter(c=>c.kw===c0.kw).length; return {...c0, tag, n:cands.length, agree:same};
}
function elLoadTags(){ const T={}; const sp=V9.spec||{}; const ds=(V9.drawSpec&&V9.drawSpec.R&&V9.drawSpec.R.items)||[]; const pm=(V9.dwg&&V9.dwg.pumps)||{};
  for(const t of ["feed","eff","aer","dec","panel"]){ T[t]=(ds.find(e=>e.type===t)||{}).tag || (sp[t]&&sp[t].tag) || (pm[t]&&pm[t].code) || null; }
  return T; }
function elecLoadsFill(c, E){
  if(!E) return; const sheets=[...(V9.elecPdf||[]), ...(V9.elecDwg||[])]; if(!sheets.length) return;
  const T=elLoadTags(), L={}; for(const [k,t] of Object.entries(T)) L[k]=elecLoad(sheets,t);
  // 전기도면에서 같은 번호가 '공법제어반'이면 포기장치가 아니라 제어반 부하로 봄
  for(const k of ["aer","dec"]) if(L[k] && /제어반|공법/.test(L[k].lbl||"")){ if(!L.panel) L.panel={...L[k], tag:L[k].tag}; L[k]=null; }
  E.loads=L;
  const app=(r,g)=>{ const o=c["G"+r]; c["G"+r]=(o==null||o==="")?g:(String(o).includes(g.slice(0,12))?o:`${o} / ${g}`); };
  const n=v=>typeof v==="number"&&isFinite(v);
  const cmp=(r,mechKW,ld,label)=>{ if(!ld) return; const t=`전기도면 ${ld.tag} ${ld.kw}kW (${ld.ref})`;
    if(n(mechKW)){ if(Math.abs(mechKW-ld.kw)<=Math.max(0.05,mechKW*0.01)) app(r,`${t} = 기계 ${mechKW}kW 일치`);
      else { app(r,`기계 ${mechKW}kW / ${t} — 불일치`); c["F"+r]="부적합"; } }
    else app(r,t); };
  cmp(31, n(c.D31)?c.D31:null, L.feed, "공급펌프");
  cmp(51, n(c.D51)?c.D51:null, L.aer, "포기장치");
  cmp(60, n(c.D60)?c.D60:null, L.dec, "전동윈치");
  if(L.eff){ app(94, `총인 공급펌프 ${L.eff.tag} 전기도면 ${L.eff.kw}kW (${L.eff.ref})`); }
  // 포기장치가 공법제어반을 거쳐 공급되면 제어반 부하 = (포기 + 윈치) × 지수 와 대조
  if(L.panel && !L.aer){ const a=n(c.D51)?c.D51:n(c.D52)?c.D52:null, w=n(c.D60)?c.D60:0, N=n(c.D13)?c.D13:1;
    if(a!=null){ const nA=(window.V9&&V9.xls&&V9.xls.nAer)||1, nD=(window.V9&&V9.xls&&V9.xls.nDec)||1;
      const sum=Math.round((a*nA+w*nD)*N*100)/100; const ok=L.panel.kw>=sum*0.98 && L.panel.kw<=sum*1.25;
      const expr = (nA>1||nD>1) ? `(포기 ${a}×${nA}+윈치 ${w}×${nD})×${N}` : `(포기 ${a}+윈치 ${w})×${N}`;
      app(53, `전기도면 공법제어반 ${L.panel.tag} ${L.panel.kw}kW ${ok?"≈":"≠"} ${expr} = ${sum}kW${ok?"":" — 확인 필요"} (${L.panel.ref})`); if(!ok && (c.F53==null||c.F53==="")) c.F53="검토"; } }
}
