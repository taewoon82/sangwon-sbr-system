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
  lines.forEach((l,i)=>{ const m=l.s.match(HEAD); if(m) secs.push({i, no:m[1], name:m[2].replace(/\s+/g,""), tag:m[3].replace(/\s+/g,"").replace(/～/g,"~"), page:l.page}); });
  const UNIT="(kg\\s*[·.ㆍ]?\\s*O\\s*[₂2]\\s*\\/\\s*h(?:r)?|[ℓL]\\s*\\/\\s*s(?:ec)?|㎥\\s*\\/\\s*min|m3\\s*\\/\\s*min|㎥\\s*\\/\\s*h(?:r)?|m3\\s*\\/\\s*h(?:r)?|㎥\\s*\\/\\s*(?:일|d(?:ay)?)|m3\\s*\\/\\s*(?:일|d(?:ay)?))";
  const CAP=new RegExp("(?:용\\s*량|사\\s*양|토\\s*출\\s*량)\\s*[:：]?\\s*([\\d,]+(?:\\.\\d+)?)\\s*"+UNIT,"i");
  const normU=u=>{ u=u.replace(/\s/g,"").toLowerCase(); if(/kg/.test(u)) return "kgO₂/h"; if(/^[ℓl]\//.test(u)) return "L/s"; if(/min/.test(u)) return "㎥/min"; if(/\/h/.test(u)) return "㎥/h"; return "㎥/d"; };
  const out=[];
  secs.forEach((sc,k)=>{
    const end=k+1<secs.length?secs[k+1].i:Math.min(lines.length, sc.i+120);
    const body=lines.slice(sc.i+1,end).map(l=>l.s);
    const txt=body.join("\n");
    const e={no:sc.no, name:sc.name, tag:sc.tag, page:sc.page, src:`${sc.no} ${sc.name}(${sc.tag}) ${sc.page}쪽`};
    let m;
    if((m=txt.match(CAP))) e.cap={v:num(m[1]), unit:normU(m[2]), raw:m[0].replace(/\s+/g," ")};
    if((m=txt.match(/(참\s*고\s*동\s*력|전\s*동\s*기|동\s*력|출\s*력)\s*[:：]?\s*([\d.]+)\s*kW/i))) e.kw={v:num(m[2]), label:m[1].replace(/\s/g,""), raw:m[0].replace(/\s+/g," ")};
    else if(e.cap && (m=txt.slice(txt.indexOf(e.cap.raw.split(" ")[0])).match(/[×xX*]\s*([\d.]+)\s*kW/))) e.kw={v:num(m[1]), label:"동력", raw:m[0]};
    if((m=txt.match(/([\d.]+)\s*m\s*H\b/))) e.head=num(m[1]);
    if((m=txt.match(/구\s*경\s*[:：]?\s*(?:Ø|φ|ø)?\s*(\d{2,3})\s*(?:A|mm)?/))) e.size=+m[1];
    if((m=txt.match(/수\s*량\s*((?:\s*\d+(?:\(\d+\))?\s*(?:대|식|EA|조))+)/))){ const q=[...m[1].matchAll(/(\d+)(?:\(\d+\))?\s*(?:대|식|EA|조)/g)].map(x=>+x[1]); e.qty=q[0]; if(q.length>1) e.qtyAll=q.reduce((a,b)=>a+b,0); e.phases=q.length; }
    if((m=txt.match(/참\s*고\s*동\s*력[^\n]*\(([^)]+)\)/))) e.kwNote=m[1];
    const ty=/포기장치|표면\s*포기|폭기기|포기기/.test(e.name)?"aer": /배출장치|디캔터|decanter/i.test(e.name)?"dec":
      /반응조\s*공급\s*펌프|유량\s*조정조\s*(이송|공급)?\s*펌프|^공급\s*펌프/.test(e.name)?"feed": /처리수\s*(이송|공급)?\s*펌프|총인\S*\s*공급\s*펌프/.test(e.name)?"eff":
      /총인/.test(e.name)?"tp": "etc";
    e.type=ty; out.push(e);
  });
  const by={}; for(const e of out){ if(!by[e.type]) by[e.type]=e; }
  return {items:out, aer:by.aer||null, dec:by.dec||null, feed:by.feed||null, eff:by.eff||null, tp:by.tp||null, nLines:lines.length};
}
if(typeof module!=="undefined") module.exports={specParse,specLinesFromPages};
