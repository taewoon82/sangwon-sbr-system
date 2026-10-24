// ===== v11: 시방서 · 장비일람표 (PDF) 읽기 — 브라우저/노드 공용 =====
// 입력: 줄 배열 [{s, page}] → 장비 목록
function specLinesFromPages(pages){
  const out=[];
  pages.forEach((pg,pi)=>{
    const it=pg.items.filter(i=>i.s&&i.s.trim()).sort((a,b)=>a.y-b.y||a.x-b.x);
    const rows=[];
    for(const i of it){ const r=rows.find(r=>Math.abs(r.y-i.y)<=Math.max(2,(i.h||8)*0.45)); if(r) r.items.push(i); else rows.push({y:i.y,items:[i]}); }
    rows.sort((a,b)=>a.y-b.y);
    for(const r of rows){ r.items.sort((a,b)=>a.x-b.x); let s="", px=null;
      for(const i of r.items){ if(px!=null && i.x-px>1.5) s+=" "; s+=i.s; px=i.x+(i.w||0); }
      out.push({s:s.replace(/\s+/g," ").trim(), page:pi+1}); }
  });
  return out;
}
function specParse(lines){
  const num=s=>parseFloat(String(s).replace(/,/g,""));
  const HEAD=/^\s*(\d+(?:\.\d+)+)\.?\s+([^()（）]{2,40}?)\s*[\(（]\s*((?:\d?[A-Z]{0,2}M|P)-?\d{3}[^)）]*)[\)）]/;
  const secs=[];
  // 제목에 기기번호가 없어도 포기(폭기)장치 · 배출장치 · 공법(반응조) 제어반은 항목으로 읽음
  const HEAD2=/^\s*(?:(\d+(?:\.\d+)+)\.?|(\d+)\.|[가-하]\.)\s*((?:SBR\s*)?(?:표면\s*)?(?:포기|폭기)\s*(?:장치|기)|배출\s*장치|디캔터|Decanter|(?:공법|반응조|SBR|현장)?\s*제어\s*반)\s*(?:[\(（]\s*([^)）]{2,30})[\)）])?\s*$/i;
  lines.forEach((l,i)=>{ let m=l.s.match(HEAD); if(m){ secs.push({i, no:m[1], name:m[2].replace(/\s+/g,""), tag:m[3].replace(/\s+/g,"").replace(/～/g,"~"), page:l.page}); return; }
    m=l.s.match(HEAD2); if(m){ const tg=(m[4]&&/M-?\d{3}/i.test(m[4]))?m[4].replace(/\s+/g,"").replace(/～/g,"~"):""; secs.push({i, no:m[1]||m[2]||l.s.trim().split(/\s+/)[0], name:m[3].replace(/\s+/g,""), tag:tg, page:l.page}); } });
  const UNIT="(kg\\s*[·.ㆍ]?\\s*O\\s*[₂2]\\s*\\/\\s*h(?:r)?|[ℓL]\\s*\\/\\s*s(?:ec)?|㎥\\s*\\/\\s*min|m3\\s*\\/\\s*min|㎥\\s*\\/\\s*h(?:r)?|m3\\s*\\/\\s*h(?:r)?|㎥\\s*\\/\\s*(?:일|d(?:ay)?)|m3\\s*\\/\\s*(?:일|d(?:ay)?))";
  const CAP=new RegExp("(?:용\\s*량|사\\s*양|토\\s*출\\s*량)\\s*[:：]?\\s*([\\d,]+(?:\\.\\d+)?)\\s*"+UNIT,"i");
  const normU=u=>{ u=u.replace(/\s/g,"").toLowerCase(); if(/kg/.test(u)) return "kgO₂/h"; if(/^[ℓl]\//.test(u)) return "L/s"; if(/min/.test(u)) return "㎥/min"; if(/\/h/.test(u)) return "㎥/h"; return "㎥/d"; };
  const out=[];
  secs.forEach((sc,k)=>{
    const end=k+1<secs.length?secs[k+1].i:Math.min(lines.length, sc.i+120);
    const body=lines.slice(sc.i+1,end).map(l=>l.s);
    const txt=body.join("\n");
    const e={no:sc.no, name:sc.name, tag:sc.tag, page:sc.page, src:`${sc.no} ${sc.name}${sc.tag?`(${sc.tag})`:""} ${sc.page}쪽`};
    let m;
    if((m=txt.match(CAP))) e.cap={v:num(m[1]), unit:normU(m[2]), raw:m[0].replace(/\s+/g," ")};
    if((m=txt.match(/(참\s*고\s*동\s*력|전\s*동\s*기|동\s*력|출\s*력)\s*[:：]?\s*([\d.]+)\s*kW/i))) e.kw={v:num(m[2]), label:m[1].replace(/\s/g,""), raw:m[0].replace(/\s+/g," ")};
    else if(e.cap && (m=txt.slice(txt.indexOf(e.cap.raw.split(" ")[0])).match(/[×xX*]\s*([\d.]+)\s*kW/))) e.kw={v:num(m[1]), label:"동력", raw:m[0]};
    if((m=txt.match(/([\d.]+)\s*m\s*H\b/))) e.head=num(m[1]);
    if((m=txt.match(/구\s*경\s*[:：]?\s*(?:Ø|φ|ø)?\s*(\d{2,3})\s*(?:A|mm)?/))) e.size=+m[1];
    if((m=txt.match(/수\s*량\s*[:：]?\s*((?:\s*\d+(?:\(\d+\))?\s*(?:대|식|EA|조|면|SET))+)/i))){ const q=[...m[1].matchAll(/(\d+)(?:\(\d+\))?\s*(?:대|식|EA|조|면|SET)/gi)].map(x=>+x[1]); e.qty=q[0]; if(q.length>1) e.qtyAll=q.reduce((a,b)=>a+b,0); e.phases=q.length; }
    if((m=txt.match(/참\s*고\s*동\s*력[^\n]*\(([^)]+)\)/))) e.kwNote=m[1];
    if((m=txt.match(/(\d{3,4})\s*(?:mm)?\s*[W]?\s*[×xX*]\s*(\d{3,4})\s*(?:mm)?\s*[DL]?\s*[×xX*]\s*(\d{3,4})\s*(?:mm)?\s*H?/))) e.whd=`${m[1]} × ${m[2]} × ${m[3]}`;
    if((m=txt.match(/(?:^|\n)\s*(?:[가-하]\.\s*|\d+\)\s*|[①-⑩]\s*)?재\s*질(?!\s*및)\s*[:：]?\s*([^\n]{2,40})/))) e.mat=m[1].replace(/\s+/g," ").trim();
    if((m=txt.match(/(?:^|\n)\s*(?:[가-하]\.\s*|\d+\)\s*|[①-⑩]\s*)?설치\s*(?:위치|장소)\s*[:：]?\s*([^\n]{2,40})/))) e.loc=m[1].replace(/\s+/g," ").trim();
    if((m=txt.match(/(?:^|\n)\s*(?:[가-하]\.\s*|\d+\)\s*|[①-⑩]\s*)?형\s*식\s*[:：]?\s*([^\n]{2,40})/))) e.form=m[1].replace(/\s+/g," ").trim();
    const ty=/(포기|폭기)\s*(장치|기)|표면\s*포기/.test(e.name)?"aer": /제어\s*반/.test(e.name)?"panel": /배출장치|디캔터|decanter/i.test(e.name)?"dec":
      /반응조\s*공급\s*펌프|유량\s*조정조\s*(이송|공급)?\s*펌프|^공급\s*펌프/.test(e.name)?"feed": /처리수\s*(이송|공급)?\s*펌프|총인\S*\s*공급\s*펌프/.test(e.name)?"eff":
      /총인/.test(e.name)?"tp": "etc";
    e.type=ty; out.push(e);
  });
  for(let i=out.length-1;i>=0;i--){ const e=out[i]; if(!e.cap&&!e.kw&&!e.qty&&!e.whd&&!e.mat&&out.some(o=>o!==e&&o.type===e.type)) out.splice(i,1); }
  const by={}; for(const e of out){ if(!by[e.type]) by[e.type]=e; }
  // 시방서 본문 문장 (scope · 제어반 · 계측 · 감속기) — 해당 문장을 쪽 번호와 함께 그대로 가져옴
  const facts={};
  const sentOf=(i)=>{ let a=i, b=i; while(a>0 && !/^\s*([가-힣]\.|\d+\)|[가-힣]\))/.test(lines[a].s) && i-a<3) a--; while(b<lines.length-1 && !/[다음]\.\s*$/.test(lines[b].s) && b-i<3) b++; return {t:lines.slice(a,b+1).map(l=>l.s).join(" ").replace(/^\s*([가-힣]\.|\d+\)|[가-힣]\))\s*/,"").replace(/\s+/g," ").trim(), page:lines[i].page}; };
  const grab=(key,re,filt)=>{ for(let i=0;i<lines.length;i++){ if(re.test(lines[i].s) && (!filt||filt(i))){ facts[key]=sentOf(i); return; } } };
  const inSec=(type)=>(i)=>{ const sc=secs.filter(s=>s.i<=i).pop(); if(!sc) return false; const e=out.find(o=>o.no===sc.no); return e&&e.type===type; };
  grab("aerPos",/중앙\s*수면에\s*부유식|부유식으로\s*설치/);
  grab("cross",/크로스\s*배플|십자형|Cross-?Construction/i);
  grab("aerPad",/기초\s*패드/, inSec("aer"));
  grab("decPad",/기초\s*패드/, inSec("dec"));
  grab("tpPad",/기초\s*패드/, inSec("tp"));
  grab("decWall",/유입부와\s*반대|반대\s*방향에\s*위치하는\s*벽/);
  grab("gear",/감속기\s*\(|Helical\s*Gear|헬리컬/i, inSec("aer"));
  grab("motor",/IP\s*\d{2}/i, inSec("aer"));
  grab("panelMat",/\d+(?:\.\d+)?\s*mm\s*이상의/);
  grab("panelParts",/Inverter|VVVF|인버터/i, inSec("dec"));
  grab("comm",/Ethernet|이더넷|통신\s*포트/i);
  grab("rcs",/상위\s*감시\s*제어\s*설비와\s*통신선|통신선\s*구축/);
  grab("power1",/1차측\s*전원/);
  grab("scope2",/2차측\s*전원|현장조작반을\s*공급/);
  grab("level",/4\s*[～~]\s*20\s*㎃|4\s*[～~]\s*20\s*mA/i);
  grab("do",/DO\s*(Meter|및)|용존산소/i);
  grab("tpScope",/흡입측\s*밸브|토출밸브까지/);
  return {items:out, facts, panel:by.panel||null, aer:by.aer||null, dec:by.dec||null, feed:by.feed||null, eff:by.eff||null, tp:by.tp||null, nLines:lines.length};
}
if(typeof module!=="undefined") module.exports={specParse,specLinesFromPages};

// ===== 승인도서: '공급기기 목록'·'DATA SHEET' 에서 공법 기자재 사양 읽기 (시방서 항목 제목이 없거나 값이 빠졌을 때 보충) =====
const APPROVAL_RE=/제\s*작\s*승\s*인\s*도\s*서|공급\s*기기\s*목록|DATA\s*SHEET|설계\s*\/?\s*제작\s*시방서|승인\s*도서/i;
function supplyParse(lines){
  const num=s=>parseFloat(String(s).replace(/,/g,""));
  const out={}; const mk=(t,name)=> out[t]=out[t]||{type:t, name, no:"승인도서", src:"승인도서 공급기기 목록"};
  const pg=(lines.find(l=>/공급\s*기기\s*목록/.test(l.s))||{}).page;
  if(pg){ const L=lines.filter(l=>l.page===pg); const tagAt=i=>{ for(let d=0;d<=3;d++) for(const j of [i-d,i+d]){ const m=L[j]&&L[j].s.match(/\b(\d?M-\d{1,3}(?:-\d{1,2})?)(?=[A-Z]?\b|[A-Z]\/)/); if(m) return m[1]; } return null; };
    L.forEach((l,i)=>{ const s=l.s; let m;
      if(/터빈|포기|폭기/.test(s) && (m=s.match(/([\d.]+)\s*kg\s*[·.\-]?\s*O\s*[2₂]/i))){ const e=mk("aer","포기장치"); e.cap={v:num(m[1]),unit:"kgO₂/h",raw:s.slice(0,60)}; const d=s.match(/[ØΦφ∅]\s*([\d,]+)\s*mm/); if(d) e.dia=num(d[1]); const q=s.match(/(\d+)\s*set/i); if(q) e.qty={"1":q[1]}; e.tag=e.tag||tagAt(i); e.page=pg; }
      if(/감속기|모터/.test(s) && !/윈치/.test(s) && (m=s.match(/([\d.]+)\s*kW/i))){ const e=mk("aer","포기장치"); e.kw={v:num(m[1]),label:"동력",raw:s.slice(0,60)}; e.page=pg; }
      if(/디\s*[켄캔]\s*터|배출\s*장치|Decanter/i.test(s) && (m=s.match(/([\d.]+)\s*(?:L|ℓ)\s*\/\s*s(?:ec)?/i))){ const e=mk("dec","처리수배출장치"); e.cap={v:num(m[1]),unit:"L/s",raw:s.slice(0,60)}; const q=s.match(/(\d+)\s*set/i); if(q) e.qty={"1":q[1]}; e.tag=e.tag||tagAt(i); e.page=pg; }
      if(/윈치/.test(s) && (m=s.match(/([\d.]+)\s*kW/i))){ const e=mk("dec","처리수배출장치"); e.kw={v:num(m[1]),label:"동력",raw:s.slice(0,60)}; e.page=pg; }
      if(/제어반|PLC|인버터/.test([L[i-1],l,L[i+1],L[i+2]].filter(Boolean).map(x=>x.s).join(" ")) && !/현장\s*조작|조작반/.test(s) && (m=s.match(/([\d.]+)\s*m?\s*W\s*[x×*]\s*([\d.]+)\s*m?\s*D\s*[x×*]\s*([\d.]+)\s*m?\s*H/i))){ const e=mk("panel","반응조 제어반"); const f=v=>{ v=num(v); return Math.round(v<10?v*1000:v); }; e.whd=`${f(m[1])} × ${f(m[2])} × ${f(m[3])}`; const q=s.match(/(\d+)\s*면/); if(q) e.qty={"1":q[1]}; e.tag=e.tag||tagAt(i); e.page=pg; }
    }); }
  // DATA SHEET: 산소 전달량 · 적용 동력 · 운전 회전수
  const ds=lines.filter(l=>/DATA\s*SHEET/i.test(l.s)).map(l=>l.page); const dsp=new Set(ds);
  const DL=lines.filter(l=>dsp.has(l.page)); let m;
  for(const l of DL){ const s=l.s;
    if(/산소\s*전달량/.test(s) && (m=s.match(/([\d.]+)\s*kg\s*[·.\-]?\s*O\s*[2₂]/i))){ const e=mk("aer","포기장치"); if(!e.cap) e.cap={v:num(m[1]),unit:"kgO₂/h",raw:s.slice(0,60)}; }
    if(/적용\s*동력|Shaft/i.test(s) && (m=s.match(/([\d.]+)\s*kW/i))){ const e=mk("aer","포기장치"); if(!e.kw) e.kw={v:num(m[1]),label:"동력",raw:s.slice(0,60)}; }
    if(/운전\s*회전수/.test(s) && (m=s.match(/([\d.]+)\s*rpm/i))){ const e=mk("aer","포기장치"); e.rpm=e.rpm||num(m[1]); }
  }
  return Object.values(out);
}
// 시방서 파싱 + 승인도서 보충: 같은 종류 항목의 빈 값만 채움, 없는 종류는 새로 추가
function specParseAll(lines){
  const R=specParse(lines); const txt=lines.slice(0,600).map(l=>l.s).join(" ");
  R.isApproval=APPROVAL_RE.test(txt);
  if(!R.isApproval) return R;
  const S=supplyParse(lines);
  for(const s of S){ const e=R.items.find(x=>x.type===s.type);
    if(!e){ R.items.push(s); continue; }
    for(const k of ["cap","kw","qty","whd","tag","rpm","dia"]) if(e[k]==null&&s[k]!=null) e[k]=s[k]; }
  for(const t of ["aer","dec","panel"]) if(!R[t]) R[t]=R.items.find(x=>x.type===t)||null;
  for(const e of R.items){ e.approval=true; if(e.no&&!/승인도서/.test(e.no)) e.no=`승인도서 ${e.no}`; }   // 검토 기준은 설계시방서 — 승인도서 값은 설계시방서가 없을 때만 씀
  return R;
}
