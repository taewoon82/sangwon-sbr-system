// ===== 검토서 양식(xlsx) 셀 채우기 — 원본 XML 직접 수정 (서식·수식·목록·조건부서식 보존) =====
// cells: {"검토서": {"D12": 843.4, "C3": "현장명", ...}, ...}
async function xlsxFill(JSZip, tplBytes, cells, cache){ cache=cache||{};
  const zip = await JSZip.loadAsync(tplBytes);
  const wbXml = await zip.file("xl/workbook.xml").async("string");
  const rels = await zip.file("xl/_rels/workbook.xml.rels").async("string");
  const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const colNum = c => c.split("").reduce((a,ch)=>a*26+ch.charCodeAt(0)-64,0);
  const split = a => { const m=a.match(/^([A-Z]+)(\d+)$/); return {c:m[1], r:+m[2]}; };
  const SHEET_PATHS={};
  for(const sn of Object.keys(cache)) if(!(sn in cells)) cells[sn]={};
  for(const sheetName in cells){
    const sm = wbXml.match(new RegExp(`<sheet[^>]*name="${sheetName}"[^>]*r:id="([^"]+)"`)) || wbXml.match(new RegExp(`<sheet[^>]*r:id="([^"]+)"[^>]*name="${sheetName}"`));
    if(!sm) throw new Error("시트 없음: "+sheetName);
    const tm = rels.match(new RegExp(`<Relationship[^>]*Id="${sm[1]}"[^>]*Target="([^"]+)"`)) || rels.match(new RegExp(`<Relationship[^>]*Target="([^"]+)"[^>]*Id="${sm[1]}"`));
    const path = "xl/" + tm[1].replace(/^\/?xl\//,""); SHEET_PATHS[sheetName]=path;
    let xml = await zip.file(path).async("string");
    for(const addr in cells[sheetName]){
      const v = cells[sheetName][addr];
      const {c, r} = split(addr);
      const isNum = typeof v==="number" && isFinite(v);
      const body = v==null||v==="" ? "" : isNum ? `<v>${v}</v>` : `<is><t xml:space="preserve">${esc(v)}</t></is>`;
      const tAttr = v==null||v==="" ? "" : isNum ? "" : ` t="inlineStr"`;
      const cellRe = new RegExp(`<c r="${addr}"(?=[\\s>/])([^>]*?)(/>|>[\\s\\S]*?</c>)`);
      const m = xml.match(cellRe);
      if(m){
        const attrs = m[1].replace(/\s+t="[^"]*"/,"");
        xml = xml.replace(cellRe, `<c r="${addr}"${attrs}${tAttr}>${body}</c>`);
      } else {
        const rowRe = new RegExp(`<row r="${r}"([^>]*?)(/>|>([\\s\\S]*?)</row>)`);
        const rm = xml.match(rowRe);
        const newCell = `<c r="${addr}"${tAttr}>${body}</c>`;
        if(rm){
          const inner = rm[3]||"";
          const parts = inner.match(/<c r="[A-Z]+\d+"[\s\S]*?(?:\/>|<\/c>)/g)||[];
          let placed=false; const out=[];
          for(const p of parts){ const pc=p.match(/<c r="([A-Z]+)\d+"/)[1]; if(!placed && colNum(pc)>colNum(c)){ out.push(newCell); placed=true; } out.push(p); }
          if(!placed) out.push(newCell);
          xml = xml.replace(rowRe, `<row r="${r}"${rm[1]}>${out.join("")}</row>`);
        } else throw new Error("행 없음: "+sheetName+"!"+addr);
      }
    }
    // 글이 긴 칸은 행 높이를 늘림 (엑셀은 높이가 고정된 행을 자동으로 맞추지 않음)
    if(sheetName==="검토서"){
      const W={C:46,G:46,H:22}; const cw=s=>[...String(s)].reduce((a,ch)=>a+(/[ㄱ-힣]/.test(ch)?1.85:/[A-Z0-9]/.test(ch)?1.1:1.0),0);
      const all={...cells[sheetName], ...(cache[sheetName]||{})}; const need={};
      for(const [addr,v] of Object.entries(all)){ if(v==null||v==="") continue; const {c,r}=split(addr); let w=W[c]; if(r>=109&&r<=116&&c==="C") w=80; if(!w) continue;
        const lines=String(v).split("\n").reduce((a,seg)=>a+Math.max(1,Math.ceil(cw(seg)/(w*0.92))),0); need[r]=Math.max(need[r]||0, lines); }
      for(const [r,n] of Object.entries(need)){ if(n<2) continue; const ht=Math.round(n*15.5+6);
        xml=xml.replace(new RegExp(`<row r="${r}"([^>]*)>`), (m,a)=>{ const cur=+((a.match(/\sht="([\d.]+)"/)||[])[1]||15); if(cur>=ht) return m; a=a.replace(/\s(ht|customHeight)="[^"]*"/g,""); return `<row r="${r}"${a} ht="${ht}" customHeight="true">`; }); }
    }
    zip.file(path, xml);
  }
  // 모든 시트: 수식 셀의 저장된 계산값 제거 → 엑셀·리브레오피스 모두 열 때 새로 계산
  for(const f of Object.keys(zip.files).filter(n=>/^xl\/worksheets\/sheet\d+\.xml$/.test(n))){
    let x = await zip.file(f).async("string");
    x = x.replace(/<c ([^>]*?)>(<f[^>]*?(?:\/>|>[\s\S]*?<\/f>))<v>[\s\S]*?<\/v><\/c>/g, (m,a,fm)=>`<c ${a.replace(/\s+t="(str|b|e|n)"/,"")}>${fm}</c>`);
    // 우리가 계산한 수식 결과를 저장값으로 넣음 (수식은 그대로 — 엑셀은 열 때 다시 계산)
    const sheetOf = Object.entries(SHEET_PATHS).find(([n,p])=>p===f);
    const cv = sheetOf && cache[sheetOf[0]];
    if(cv) x = x.replace(/<c r="([A-Z]+\d+)"([^>]*?)>(<f[^>]*?(?:\/>|>[\s\S]*?<\/f>))<\/c>/g, (m,addr,a,fm)=>{ if(!(addr in cv)) return m; const v=cv[addr];
      const at=a.replace(/\s+t="[^"]*"/,""); if(typeof v==="number"&&isFinite(v)) return `<c r="${addr}"${at}>${fm}<v>${v}</v></c>`;
      return `<c r="${addr}"${at} t="str">${fm}<v>${esc(v??"")}</v></c>`; });
    zip.file(f, x);
  }
  // 열 때 전체 재계산 + 저장된 계산값 체인 제거
  let wb2 = wbXml;
  if(/<calcPr[^>]*\/>/.test(wb2)) wb2 = wb2.replace(/<calcPr([^>]*)\/>/, (m,a)=>`<calcPr${a.replace(/\s*fullCalcOnLoad="[^"]*"/,"")} fullCalcOnLoad="1"/>`);
  else wb2 = wb2.replace("</workbook>", `<calcPr fullCalcOnLoad="1"/></workbook>`);
  zip.file("xl/workbook.xml", wb2);
  if(zip.file("xl/calcChain.xml")){ zip.remove("xl/calcChain.xml");
    let ct = await zip.file("[Content_Types].xml").async("string"); ct = ct.replace(/<Override[^>]*calcChain[^>]*\/>/,""); zip.file("[Content_Types].xml", ct);
    zip.file("xl/_rels/workbook.xml.rels", rels.replace(/<Relationship[^>]*calcChain[^>]*\/>/,"")); }
  return zip.generateAsync({type:"uint8array", compression:"DEFLATE"});
}
if(typeof module!=="undefined") module.exports={xlsxFill};
