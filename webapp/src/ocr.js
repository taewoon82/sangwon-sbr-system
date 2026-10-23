// ===== v12.1: 그림 글자로 된 PDF 도면 읽기 (OCR) — 기기일람표(용량·동력·수량) · 단면도(수위) =====
const TESS = {
  lib:    "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js",
  worker: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
  core:   "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/",
};
let OCR_POOL=null;
async function ocrPool(onMsg){
  if(OCR_POOL) return OCR_POOL;
  if(!window.Tesseract){ await new Promise((ok,ng)=>{ const s=document.createElement("script"); s.src=TESS.lib; s.onload=ok; s.onerror=()=>ng(new Error("글자 인식 모듈을 불러오지 못했습니다 (인터넷 연결 확인)")); document.head.appendChild(s); }); }
  const local=!/^https?:/.test(TESS.worker);
  const abs=p=>new URL(p, location.href).href;
  const opt={ workerPath:abs(TESS.worker), corePath:abs(TESS.core), workerBlobURL:!local, gzip:true };
  if(local){ opt.langPath=abs(TESS.core.replace(/core\/?$/,"lang"));
    // 내장 인식 데이터는 '.traineddata.gz.wasm' 이름으로 둠 (페이지 서버가 .gz를 내주지 않음) → 작업 스레드에서 이름만 바꿔 읽음
    const wrap=`const _f=self.fetch.bind(self); self.fetch=(u,o)=>_f(String(u).replace(/\\.traineddata\\.gz$/,".traineddata.gz.wasm"),o); importScripts(${JSON.stringify(abs(TESS.worker))});`;
    opt.workerPath=URL.createObjectURL(new Blob([wrap],{type:"text/javascript"})); }
  const n=Math.max(1, Math.min(3, ((navigator.hardwareConcurrency||2)>>1)));
  onMsg&&onMsg(`글자 인식 준비 중… (처음 한 번 한글·영문 인식 데이터 약 4.5MB 내려받음)`);
  const ws=[]; for(let i=0;i<n;i++) ws.push(await window.Tesseract.createWorker(["kor","eng"], 1, opt));
  const idle=[...ws], wait=[];
  const take=()=>idle.length?Promise.resolve(idle.pop()):new Promise(r=>wait.push(r));
  const give=w=>{ const r=wait.shift(); r?r(w):idle.push(w); };
  OCR_POOL={ n, async run(canvas, psm){ const w=await take(); try{ await w.setParameters({tessedit_pageseg_mode:String(psm), preserve_interword_spaces:"1"}); const {data}=await w.recognize(canvas, {}, {blocks:true, text:true}); return data; } finally{ give(w); } },
    async end(){ for(const w of ws) try{ await w.terminate(); }catch(e){} OCR_POOL=null; } };
  return OCR_POOL;
}
const ocrWords = data => { const out=[]; for(const b of (data.blocks||[])) for(const p of (b.paragraphs||[])) for(const l of (p.lines||[])){ const ws=(l.words||[]).filter(w=>w.text&&w.text.trim()); if(!ws.length) continue;
    out.push({line:true, s:ws.map(w=>w.text).join(" "), x0:l.bbox.x0, y0:l.bbox.y0, x1:l.bbox.x1, y1:l.bbox.y1, words:ws.map(w=>({s:w.text, x0:w.bbox.x0, y0:w.bbox.y0, x1:w.bbox.x1, y1:w.bbox.y1, c:w.confidence}))}); } return out; };
async function pdfRender(page, scale, crop){ // crop: [fx0,fy0,fx1,fy1] (0~1)
  const vp=page.getViewport({scale}); const [a,b,c,d]=crop||[0,0,1,1];
  const cv=document.createElement("canvas"); cv.width=Math.round(vp.width*(c-a)); cv.height=Math.round(vp.height*(d-b));
  const ctx=cv.getContext("2d",{willReadFrequently:true}); ctx.fillStyle="#fff"; ctx.fillRect(0,0,cv.width,cv.height);
  await page.render({canvasContext:ctx, viewport:vp, transform:[1,0,0,1,-vp.width*a,-vp.height*b]}).promise;
  return cv; }
// ---- 표(격자) 찾기: 긴 가로선·세로선 → 표 영역·행·열
function findTables(cv){
  const W=cv.width, H=cv.height, d=cv.getContext("2d").getImageData(0,0,W,H).data;
  const dark=new Uint8Array(W*H); for(let i=0,j=0;i<W*H;i++,j+=4) dark[i]=(d[j]*0.3+d[j+1]*0.59+d[j+2]*0.11)<200?1:0;
  const runs=[]; for(let y=0;y<H;y++){ let s=-1; for(let x=0;x<=W;x++){ const v=x<W&&dark[y*W+x]; if(v&&s<0) s=x; if(!v&&s>=0){ if(x-s>W*0.12) runs.push({y,x0:s,x1:x}); s=-1; } } }
  const groups=[]; for(const r of runs){ const g=groups.find(g=>Math.abs(g.x0-r.x0)<W*0.02&&Math.abs(g.x1-r.x1)<W*0.02); if(g){ g.ys.push(r.y); g.x0=Math.min(g.x0,r.x0); g.x1=Math.max(g.x1,r.x1); } else groups.push({x0:r.x0,x1:r.x1,ys:[r.y]}); }
  const clus=a=>{ const o=[]; for(const v of a.sort((p,q)=>p-q)){ if(o.length&&v-o[o.length-1][o[o.length-1].length-1]<=3) o[o.length-1].push(v); else o.push([v]); } return o.map(g=>Math.round(g.reduce((s,v)=>s+v,0)/g.length)); };
  const tables=[];
  for(const g of groups){ const ys=clus(g.ys); if(ys.length<6) continue; const top=ys[0], bot=ys[ys.length-1];
    const xs=[]; for(let x=g.x0;x<=g.x1;x++){ let c=0; for(let y=top;y<=bot;y++) c+=dark[y*W+x]; if(c>(bot-top)*0.5) xs.push(x); }
    const cols=clus(xs); if(cols.length<5) continue;
    tables.push({x0:g.x0,x1:g.x1,ys,cols}); }
  return {tables, dark, W, H};
}
async function readTable(cv, pool, onRow){
  const {tables,dark,W}=findTables(cv); const out=[];
  for(const t of tables){
    const jobs=[];
    for(let i=0;i+1<t.ys.length;i++){ const a=t.ys[i]+4, b=t.ys[i+1]-4; if(b-a<12) continue;
      const cells=[];
      for(let k=0;k+1<t.cols.length;k++){ const x0=t.cols[k]+5, x1=t.cols[k+1]-5; if(x1-x0<8){ cells.push(Promise.resolve("")); continue; }
        let ink=0; for(let y=a;y<b;y+=2) for(let x=x0;x<x1;x+=2) ink+=dark[y*W+x]; if(ink<6){ cells.push(Promise.resolve("")); continue; }
        const S=2, cc=document.createElement("canvas"); cc.width=(x1-x0)*S+24; cc.height=(b-a)*S+24; const cx=cc.getContext("2d");
        cx.fillStyle="#fff"; cx.fillRect(0,0,cc.width,cc.height); cx.imageSmoothingQuality="high"; cx.drawImage(cv, x0, a, x1-x0, b-a, 12, 12, (x1-x0)*S, (b-a)*S);
        cells.push(pool.run(cc, 6).then(d=>String(d.text||"").replace(/\s*\n\s*/g," ").trim())); }
      jobs.push(Promise.all(cells).then(cs=>{ onRow&&onRow(); return {y:a, cells:cs}; }));
    }
    const rows=(await Promise.all(jobs)).sort((p,q)=>p.y-q.y).filter(r=>r.cells.some(Boolean));
    out.push({cols:t.cols.length-1, rows});
  }
  return out;
}
// ---- 기기일람표 행 → 시방서와 같은 형태의 기기 목록
function normOcr(s){ return String(s||"").replace(/([가-힣])\s+(?=[가-힣])/g,"$1").replace(/(\d)\s*m\s*[’'`´"]?\s*\/\s*(min|hr|h)/gi,"$1㎥/$2").replace(/m\s*[’'`´"]\s*\/?/g,"㎥/").replace(/㎥\/\s*\//g,"㎥/").replace(/\bm\s*3\s*\//g,"㎥/").replace(/kg\s*[-·.]?\s*O\s*[2₂,]?\s*\/\s*h\s*r?/gi,"kgO₂/h").replace(/\s+/g," ").trim(); }
function equipFromTables(tables, src){
  const items=[]; const qtyRows=[];
  for(const T of tables){
    let hdr=T.rows.find(r=>r.cells.some(c=>/기기\s*번호|장비\s*번호/.test(c)));
    const idx=(re,def)=>{ if(!hdr) return def; const k=hdr.cells.findIndex(c=>re.test(c)); return k<0?def:k; };
    const cTag=idx(/번\s*호/,0), cName=idx(/기기명|장비명|명\s*칭/,1), cForm=idx(/형\s*식/,2), cCap=idx(/용량|규격|사양/,3), cKw=idx(/동\s*력|kW/i,4);
    const qBase=Math.max(cKw+1, 5);
    let section="";
    for(const r of T.rows){
      const c=r.cells.map(normOcr); const joined=c.join(" ");
      const sec=joined.match(/^\s*\d\)\s*(.+)$/); if(sec && !/M\s*-\s*\d/.test(joined)){ section=sec[1]; continue; }
      const tm=(c[cTag]||"").replace(/\s+/g,"").match(/^(\d?M-?\d{3}(?:-\d{1,2})?)([A-Z](?:[\/~][A-Z])*)?/i); if(!tm) continue;
      const tag=(tm[1]+(tm[2]?" "+tm[2]:"")).toUpperCase();
      const name=(c[cName]||"").replace(/\s+/g,""), form=c[cForm]||"", capS=c[cCap]||"", kwS=(c[cKw]||"").replace(/[^\d.]/g,"");
      const e={no:tag, name:name||form, tag, src:`${src} ${tag}`, form, raw:capS, page:null, fromTable:true};
      let m;
      if((m=capS.match(/([\d,]+(?:\.\d+)?)\s*(kgO₂\/h|L\s*\/\s*s(?:ec)?|㎥\s*\/\s*min|㎥\s*\/\s*h(?:r)?|㎥\s*\/\s*(?:일|d|2))/i))) e.cap={v:parseFloat(m[1].replace(/,/g,"")), unit:/kg/.test(m[2])?"kgO₂/h":/^L/i.test(m[2])?"L/s":/min/.test(m[2])?"㎥/min":/\/\s*h/.test(m[2])?"㎥/h":"㎥/d", raw:m[0]};
      if((m=capS.match(/H\s*([\d.]+)\s*m\b/i))) e.head=+m[1];
      const wm=capS.match(/W\s*([\d,]+)/i), hm=capS.match(/H\s*([\d,]+)\s*mm|H\s*([\d,]{3,})/i), dm=capS.match(/D\s*([\d,]+)/i);
      if(wm&&dm&&hm) e.whd=`W${wm[1].replace(/,/g,"")} × D${dm[1].replace(/,/g,"")} × H${(hm[1]||hm[2]).replace(/,/g,"")}`;
      if(kwS && isFinite(+kwS) && +kwS>0 && +kwS<500) e.kw={v:+kwS, label:"동력"};
      const q=c.slice(qBase).map(v=>v.replace(/[^\d-]/g,"")).map(v=>v==="-"||v===""?0:+v);
      if(q.length>=3 && q[0]){ e.qty=q[0]; e.spare=q[1]||0; e.qtyAll=q[2]||q[0]+(q[1]||0); }
      // 설비번호(범례): M-1xx 유입·전처리, M-2xx 유량조정조, M-3xx 생물반응조, M-4xx 총인·소독, M-5xx 슬러지
      const grp=+((tag.match(/^\d?M-?(\d)\d\d/)||[])[1]||0);
      const pumpLike=e.cap&&/㎥\/(min|h)/.test(e.cap.unit)&&e.head;
      if(!e.cap && /[총종]인처리설비|가압부상/.test(name+form) && (m=capS.match(/(\d{1,3}(?:,\d{3})+|\d{3,})\d{0,3}\D{0,7}\/\s*(일|d)/))) e.cap={v:+m[1].replace(/,/g,""), unit:"㎥/d", raw:m[0], guess:true};
      if(/제어반/.test(name+form)) { e.type="panel"; }
      else if(/포기|폭기|표면\s*포기/.test(name+form) || (e.cap&&e.cap.unit==="kgO₂/h")){ e.type="aer";
        if(!e.cap && (m=capS.match(/^(\d{2,3}(?:\.\d)?)/))) e.cap={v:+(+m[1]).toFixed(1), unit:"kgO₂/h", raw:capS, guess:true}; }
      else if((/배출장치|배줄장치|디켄터|디캔터|decanter/i.test(name+form) && !/슬러지|스컴/.test(name)) || (e.cap&&e.cap.unit==="L/s"&&/생물|반응조/.test(section))) e.type="dec";
      else if(/잉여\s*슬러지/.test(name)) e.type="was";
      else if(/[총종]인.*공급펌프|처리수.*(이송|공급)펌프/.test(name) || (grp===4 && pumpLike && !/교반|약품|PAC|폴리머/.test(name))) e.type="eff";
      else if(/반응조.*(유입|공급)펌프/.test(name) || ((grp===2||(!grp&&/유량\s*조정/.test(section))) && /(유입|공급|이송)펌프/.test(name) && !/수문|배수|PAC|폴리머|약품|슬러지/.test(name)) || (grp===2 && pumpLike && /펌프/.test(name) && !/배수|수문/.test(name))) e.type="feed";
      else if(/[총종]인처리설비|[총종]인설비|가압부상시스템/.test((name+form).replace(/\s/g,"")) && e.cap && e.cap.unit==="㎥/d") e.type="tp";
      else e.type="etc";
      const LBL={feed:"반응조 유입(공급)펌프", eff:"총인 공급(처리수 이송)펌프", aer:"포기장치", dec:"배출장치", panel:"반응조 제어반", tp:"총인처리설비", was:"잉여슬러지 펌프"};
      if(LBL[e.type] && (/[A-Za-z]{2,}|[^가-힣0-9()\/·\-#]/.test(e.name) || e.name.length<3)) e.name=LBL[e.type]+"(인식)";
      items.push(e);
      if(e.qty) qtyRows.push({code:tag, name:e.name, qty:{"1":e.spare?`${e.qty+e.spare}(${e.spare})`:String(e.qty)}, stages:1});
    }
  }
  // 같은 종류가 여럿이면 이름이 분명한 것을 앞으로 (예: '반응조 유입펌프')
  const rank=e=>(e.type==="feed"&&/반응조/.test(e.name)?0:1)+(e.cap?0:0.5);
  items.sort((a,b)=>a.type===b.type?rank(a)-rank(b):0);
  return {items, qtyRows};
}
// ---- PDF 도면 전체 처리
async function ocrPdfDrawing(file, say){
  const lib=await ensurePdfLib();
  const doc=await lib.getDocument({data:new Uint8Array(await file.arrayBuffer()), isEvalSupported:false}).promise;
  const N=doc.numPages; const pool=await ocrPool(say);
  // 1) 도면명 칸(오른쪽 아래)만 빠르게 읽어 쪽 분류
  const pages=[]; let done=0;
  await Promise.all(Array.from({length:N},(_,i)=>i+1).map(async p=>{ const page=await doc.getPage(p);
    const cv=await pdfRender(page, 1.5, [0.42,0.86,1,1]); const data=await pool.run(cv, 11);
    const t=ocrWords(data).map(l=>l.s).join(" ").replace(/\s+/g," ");
    const sc=(t.match(/1\s*[:：]\s*(\d{2,3})\b/)||[])[1];
    pages[p]={p, title:t, scale:sc?+sc:null}; done++; say&&say(`PDF 도면 ${file.name} — 쪽 분류 ${done}/${N}`); }));
  const tc=pg=>pg.title.replace(/\s+/g,"");
  const isTable=pg=>/(기기|장비)(일람표|목록표)/.test(tc(pg));
  const isSec=pg=>/단면도/.test(tc(pg)) && !/맨홀|유량계실|탈취|배관지지|유입펌프장|상세/.test(tc(pg));
  let tablePages=pages.filter(Boolean).filter(isTable), secPages=pages.filter(Boolean).filter(isSec);
  secPages.sort((a,b)=>(/처리시설|반응조|SBR|생물/.test(tc(b))-/처리시설|반응조|SBR|생물/.test(tc(a)))); secPages=secPages.slice(0,6);
  const texts=[]; let equip={items:[],qtyRows:[]};
  // 2) 기기일람표: 표 칸 단위로 읽기 (약 300dpi)
  for(const pg of tablePages){ const page=await doc.getPage(pg.p); const cv=await pdfRender(page, 4.2); let k=0;
    say&&say(`PDF 도면 — ${pg.p}쪽 기기일람표 읽는 중…`);
    const tabs=await readTable(cv, pool, ()=>{ k++; if(k%5===0) say&&say(`PDF 도면 — ${pg.p}쪽 기기일람표 읽는 중… (${k}줄)`); });
    const r=equipFromTables(tabs, `도면 기기일람표 ${pg.p}쪽`); equip.items.push(...r.items); equip.qtyRows.push(...r.qtyRows); }
  // 3) 단면도: 흩어진 글자(수위·명칭) 읽기 (약 200dpi), 좌표는 축척 반영한 도면 mm로 바꿔 도면 해석기에 넣음
  let sd=0;
  await Promise.all(secPages.map(async (pg,i)=>{ const page=await doc.getPage(pg.p); const S=2.8; const cv=await pdfRender(page, S, [0,0,1,0.88]);
    const data=await pool.run(cv, 11); sd++; say&&say(`PDF 도면 — 단면도 글자 인식 ${sd}/${secPages.length}`);
    const k=(25.4/(72*S))*(pg.scale||100), ox=(pg.p)*1e8;
    for(const l of ocrWords(data)){ for(const w of [l, ...(l.words.length>1?l.words:[])]){ const s=fixOcrLevel(w.s); if(!s) continue;
        texts.push({type:"TEXT", text:s, layer:"OCR", textHeight:(w.y1-w.y0)*k, startPoint:{x:ox+w.x0*k, y:-w.y1*k}}); } } }));
  return {N, pages:pages.filter(Boolean), tablePages:tablePages.map(p=>p.p), secPages:secPages.map(p=>p.p), texts, equip};
}
// OCR 글자 다듬기: 'AEL(+)74.80' → 'EL(+)74.80', 'SBR HS #1' → 'SBR 반응조 #1'
function fixOcrLevel(s){
  s=String(s||"").replace(/[\[\]{}|\\_—–~“”"]+/g," ").replace(/\s+/g," ").trim(); if(!s) return "";
  s=s.replace(/([가-힣])\s+(?=[가-힣])/g,"$1");   // '반 응 조' → '반응조'
  // 소수점 빠진 수위: 'EL(+)7685' → 'EL(+)76.85'
  s=s.replace(/((?:W\s*\.?\s*L|E\s*\.?\s*L)\s*[\(（]?\s*[+＋4]\s*[\)）]?\s*)(\d{2,3})(\d{2})(?![\d.,])/i,"$1$2.$3");
  s=s.replace(/^[^A-Za-z0-9가-힣]+/,"");
  const m=s.match(/^(.{0,3}?)((?:H|L|D)\s*\.?\s*W\s*\.?\s*L|E\s*\.?\s*L)\s*[\(（]?\s*[+＋4]\s*[\)）]?\s*(\d{1,3}[.,]\d{2,3})/i);
  if(m && !/(BOP|COP|TOP|BOT|INV|NV|IL|CL|GL|O|P|V)\.?\s*$/i.test(m[1])) return `${m[2].replace(/\s/g,"").toUpperCase()}(+)${m[3].replace(",",".")}`;
  if(/^S?BR\b.{0,8}#\s*\d$/i.test(s)) return s.replace(/^S?BR\b.{0,8}#\s*(\d)$/i,"SBR 반응조 #$1");
  return s;
}

// 점검용 (개발자 도구에서 확인)
try{ window.SBRDBG=Object.assign(window.SBRDBG||{}, {ocrPdfDrawing, readTable, findTables, equipFromTables, fixOcrLevel, pdfRender, ocrPool, ocrWords}); }catch(e){}
