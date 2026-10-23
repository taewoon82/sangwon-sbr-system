// ===== 검토서 양식(xlsx) 셀 채우기 — 원본 XML 직접 수정 (서식·수식·목록·조건부서식 보존) =====
// cells: {"검토서": {"D12": 843.4, "C3": "현장명", ...}, ...}
async function xlsxFill(JSZip, tplBytes, cells){
  const zip = await JSZip.loadAsync(tplBytes);
  const wbXml = await zip.file("xl/workbook.xml").async("string");
  const rels = await zip.file("xl/_rels/workbook.xml.rels").async("string");
  const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const colNum = c => c.split("").reduce((a,ch)=>a*26+ch.charCodeAt(0)-64,0);
  const split = a => { const m=a.match(/^([A-Z]+)(\d+)$/); return {c:m[1], r:+m[2]}; };
  for(const sheetName in cells){
    const sm = wbXml.match(new RegExp(`<sheet[^>]*name="${sheetName}"[^>]*r:id="([^"]+)"`)) || wbXml.match(new RegExp(`<sheet[^>]*r:id="([^"]+)"[^>]*name="${sheetName}"`));
    if(!sm) throw new Error("시트 없음: "+sheetName);
    const tm = rels.match(new RegExp(`<Relationship[^>]*Id="${sm[1]}"[^>]*Target="([^"]+)"`)) || rels.match(new RegExp(`<Relationship[^>]*Target="([^"]+)"[^>]*Id="${sm[1]}"`));
    const path = "xl/" + tm[1].replace(/^\/?xl\//,"");
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
    zip.file(path, xml);
  }
  // 모든 시트: 수식 셀의 저장된 계산값 제거 → 엑셀·리브레오피스 모두 열 때 새로 계산
  for(const f of Object.keys(zip.files).filter(n=>/^xl\/worksheets\/sheet\d+\.xml$/.test(n))){
    let x = await zip.file(f).async("string");
    x = x.replace(/<c ([^>]*?)>(<f[^>]*?(?:\/>|>[\s\S]*?<\/f>))<v>[\s\S]*?<\/v><\/c>/g, (m,a,fm)=>`<c ${a.replace(/\s+t="(str|b|e|n)"/,"")}>${fm}</c>`);
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
