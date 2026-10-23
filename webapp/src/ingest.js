// ===== v12: 자료 한꺼번에 불러오기 — 압축파일(zip·rar·7z·tar) 풀기 · 파일 종류별 자동 분류 · 여러 장 처리 =====
const ARC_CDN = {
  lib:    "https://cdn.jsdelivr.net/npm/libarchive.js@2.0.2/dist/libarchive.js",
  worker: "https://cdn.jsdelivr.net/npm/libarchive.js@2.0.2/dist/worker-bundle.js",
};
const extOf = n => (String(n).toLowerCase().match(/\.([a-z0-9]+)$/)||[])[1]||"";
const ARCH_EXT = /^(zip|rar|7z|tar|tgz|gz|egg|alz)$/;
async function sniff(file){ const b=new Uint8Array(await file.slice(0,8).arrayBuffer()); const s=String.fromCharCode(...b);
  if(s.startsWith("PK\x03\x04")||s.startsWith("PK\x05\x06")) return "zip";
  if(s.startsWith("Rar!")) return "rar";
  if(b[0]===0x37&&b[1]===0x7A&&b[2]===0xBC&&b[3]===0xAF) return "7z";
  if(s.startsWith("EGGA")) return "egg";
  if(s.startsWith("ALZ\x01")) return "alz";
  if(b[0]===0x1F&&b[1]===0x8B) return "gz";
  return extOf(file.name); }
function decodeName(bytes){ const u=bytes instanceof Uint8Array?bytes:Uint8Array.from(typeof bytes==="string"?[...bytes].map(c=>c.charCodeAt(0)):bytes);
  try{ return new TextDecoder("utf-8",{fatal:true}).decode(u); }catch(e){ try{ return new TextDecoder("euc-kr").decode(u); }catch(_){ return String.fromCharCode(...u); } } }
async function ensureJSZip(){ if(window.JSZip) return; await new Promise((ok,ng)=>{ const s=document.createElement("script"); s.src=CDN.jszip; s.onload=ok; s.onerror=()=>ng(new Error("압축 해제 모듈(JSZip)을 불러오지 못했습니다 (인터넷 연결 확인)")); document.head.appendChild(s); }); }
let ARC_LIB=null;
async function ensureLibarchive(){
  if(ARC_LIB) return ARC_LIB;
  const mod=await import(ARC_CDN.lib);
  const wu=new URL(ARC_CDN.worker, location.href);
  let workerUrl=wu.href;
  if(wu.origin!==location.origin){ workerUrl=URL.createObjectURL(new Blob([`import "${wu.href}";`],{type:"text/javascript"})); }
  mod.Archive.init({workerUrl});
  return ARC_LIB=mod.Archive;
}
// 압축파일 → [{name, file}] (압축 안의 압축도 한 단계 더 풂)
async function expandArchive(file, depth=0){
  const kind=await sniff(file);
  if(kind==="egg"||kind==="alz") throw new Error(`${file.name}: ${kind.toUpperCase()}는 알집 전용 형식이라 열 수 없습니다 — 알집·반디집에서 ZIP으로 다시 압축해서 올려주세요`);
  let out=[];
  if(kind==="zip"){
    await ensureJSZip();
    const z=await window.JSZip.loadAsync(await file.arrayBuffer(),{decodeFileName:decodeName});
    for(const [path,ent] of Object.entries(z.files)){ if(ent.dir) continue; const nm=path.split("/").pop(); if(!nm||/^(\.|__MACOSX)/.test(nm)||/__MACOSX\//.test(path)) continue;
      out.push({name:nm, path, file:new File([await ent.async("blob")], nm)}); }
  } else {
    let A; try{ A=await ensureLibarchive(); }catch(e){ throw new Error(`${file.name}: ${kind.toUpperCase()} 해제 모듈을 불러오지 못했습니다${location.protocol==="file:"?" (이 HTML 파일에서는 ZIP만 풀 수 있습니다 — 폰 링크나 PC 프로그램을 쓰거나 ZIP으로 다시 압축해 주세요)":""}`); }
    const race=(p,ms,msg)=>Promise.race([p,new Promise((_,ng)=>setTimeout(()=>ng(new Error(msg)),ms))]);
    const arc=await race(A.open(file),60000,`${file.name}: 압축 해제 모듈이 응답하지 않습니다 — ZIP으로 다시 압축해 올려주세요`);
    if(await arc.hasEncryptedData?.()) throw new Error(`${file.name}: 암호가 걸린 압축파일은 열 수 없습니다`);
    const tree=await race(arc.extractFiles(),180000,`${file.name}: 압축 해제가 너무 오래 걸립니다`);
    const walk=(o,pre)=>{ for(const [k,v] of Object.entries(o)){ if(v instanceof File||v instanceof Blob){ if(!/^(\.|__MACOSX)/.test(k)) out.push({name:k, path:pre+k, file:v instanceof File?v:new File([v],k)}); } else if(v&&typeof v==="object") walk(v,pre+k+"/"); } };
    walk(tree,"");
    let k=0; for(const it of out){ k++; if(/[\ufffe\ufffd]|\u0000/.test(it.name)){ const ex=extOf(it.name); const nn=`${file.name.replace(/\.[^.]+$/,"")}_${k}${ex?"."+ex:""}`; it.name=nn; it.path=nn; it.file=new File([it.file],nn); it.renamed=true; } }
  }
  if(depth<1){ const more=[]; for(const it of out){ if(ARCH_EXT.test(extOf(it.name))){ try{ const sub=await expandArchive(it.file, depth+1); sub.forEach(s=>s.path=it.name+"/"+s.path); more.push(...sub); it.used="압축"; }catch(e){ it.err=String(e.message||e); } } } out=out.filter(it=>it.used!=="압축").concat(more); }
  return out;
}
// 파일 목록(압축 포함) → 종류별로 나눠서 각 칸에 넣음
async function ingestFiles(list, hint){
  const st=$("v9stat"); const files=[...list]; const all=[]; const notes=[];
  try{
    for(const f of files){
      const k=await sniff(f);
      if(ARCH_EXT.test(k)||ARCH_EXT.test(extOf(f.name))){ st.innerHTML=`<b>${h(f.name)}</b> — 압축 푸는 중…`; await tick();
        try{ const ex=await expandArchive(f); notes.push(`${f.name}: ${ex.length}개 파일`); ex.forEach(e=>all.push({...e, from:f.name})); }
        catch(e){ notes.push(`<span class="miss">${h(e.message||e)}</span>`); } }
      else all.push({name:f.name, path:f.name, file:f});
    }
    const xls=all.filter(a=>/^(xls|xlsx|xlsm)$/.test(extOf(a.name)));
    const dwg=all.filter(a=>/^(dwg|dxf)$/.test(extOf(a.name)));
    const pdf=all.filter(a=>extOf(a.name)==="pdf");
    const other=all.filter(a=>!xls.includes(a)&&!dwg.includes(a)&&!pdf.includes(a));
    // 용량계산서: 이름에 '용량'·'계산'이 있는 엑셀 우선
    const cap=xls.sort((a,b)=>(/용량|계산/.test(b.name)-/용량|계산/.test(a.name)))[0];
    // PDF: 시방서인지 용량계산서인지 내용으로 판별
    const specPdfs=[]; let capPdf=null;
    for(const p of pdf){ try{ const {pages}=await readPdf(new Uint8Array(await p.file.arrayBuffer())); const lines=specLinesFromPages(pages); const R=specParse(lines);
        const txt=lines.slice(0,400).map(l=>l.s).join(" ");
        if(R.items.length) specPdfs.push({...p, R, n:pages.length});
        else if(!cap && !capPdf && /용량\s*계산서|물질\s*수지/.test(txt)) capPdf=p;
        else p.skip="시방서 항목(포기·폭기장치·배출장치·공법제어반)을 찾지 못함"; }catch(e){ p.skip="PDF를 읽지 못함"; } }
    const summary=[];
    if(cap||capPdf){ const c=cap||capPdf; st.innerHTML=`<b>${h(c.name)}</b> — 용량계산서 읽는 중…`; await tick(); await window.importPdf(c.file); summary.push(`용량계산서 <b>${h(c.name)}</b>`); }
    if(dwg.length){ await loadDwgs(dwg.map(d=>d.file)); const n=(V9.dwgNames||[]).length; summary.push(`설계도면 ${n}장${V9.dwgBad&&V9.dwgBad.length?` <span class="miss">(못 읽음: ${V9.dwgBad.map(h).join(" / ")})</span>`:""}`); }
    if(specPdfs.length){ applySpecs(specPdfs); summary.push(`시방서 ${specPdfs.length}개`); }
    const unused=[...xls.filter(x=>x!==cap).map(x=>x.name+" (엑셀 — 용량계산서 1개만 사용)"), ...pdf.filter(p=>p.skip&&p!==capPdf).map(p=>`${p.name} (${p.skip})`), ...other.map(o=>o.name)];
    if(files.some(f=>ARCH_EXT.test(extOf(f.name)))||files.length>1){
      st.innerHTML=`자료 ${all.length}개를 확인했습니다${notes.length?` (${notes.join(" · ")})`:""}. 사용: ${summary.join(" · ")||"없음"}.`+
        (unused.length?`<br><small>사용 안 함 ${unused.length}개: ${unused.slice(0,12).map(h).join(", ")}${unused.length>12?" 외":""}</small>`:"");
    }
    renderCmp9();
  }catch(e){ st.innerHTML=`<span class="miss">자료를 불러오지 못했습니다: ${h(e.message||e)}</span>`; }
}
function applySpecs(list){
  const items=[], facts={}; for(const s of list){ items.push(...s.R.items); for(const [k,v] of Object.entries(s.R.facts||{})) if(!facts[k]) facts[k]=v; }
  const pick=t=>items.find(e=>e.type===t&&(e.cap||e.kw||e.whd||e.mat))||items.find(e=>e.type===t)||null;
  V9.spec={items, facts, aer:pick("aer"), dec:pick("dec"), panel:pick("panel"), feed:pick("feed"), eff:pick("eff"), tp:pick("tp")};
  V9.specName=list.length>1?`${list[0].name} 외 ${list.length-1}개`:list[0].name; ATT.specErr=""; updAtt();
}
