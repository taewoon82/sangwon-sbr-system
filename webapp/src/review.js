// ===== v12.2: 검토서 판정·검토의견 자동 작성 + 양식 수식 계산값 저장 =====
// 판정: 확인(자료 일치·기준 충족) / 검토(한쪽 자료만 있거나 사람이 볼 항목) / 부적합(불일치·기준 미달)
const TPL_META = __TPL_META__;
const fx = {
  f2: v => (Math.round(v*100)/100).toFixed(2),
  f1: v => (Math.round(v*10)/10).toFixed(1),
  c1: v => (Math.round(v*10)/10).toLocaleString("en-US",{minimumFractionDigits:1,maximumFractionDigits:1}),
  pct: v => { const p=Math.round(v*1000)/10; return (p>0?"+":p<0?"-":"")+Math.abs(p).toFixed(1)+"%"; },
  f0x: v => { const s=(Math.round(v*100)/100).toFixed(2); return s.endsWith("0")?(Math.round(v*10)/10).toFixed(1):s; },   // "0.0#"
  i0: v => String(Math.round(v)),
};
const isNum = v => typeof v==="number" && isFinite(v);
const blank = v => v==null || v==="";
const n2s = v => isNum(v)? String(Math.round(+v*100)/100) : String(v??"");

// ---- 1) 항목별 판정·검토의견 (값이 있는 행만; 이미 넣은 칸은 유지)
function reviewJudge(c, ctx){
  const {rows, X, SP, D} = ctx; const V1=tplEval(c); const val=a=> a in c ? c[a] : V1[a];
  const R = k => rows.find(r=>r.key===k) || {};
  const put = (r, f, g) => { if(f!=null && blank(c["F"+r])) c["F"+r]=f; if(g && blank(c["G"+r])) c["G"+r]=g; };
  const has = a => !blank(val(a));
  const cmp = (r, key, label) => { const x=R(key); if(!has("D"+r)) return;
    if(x.st==="일치") put(r,"확인",`용량계산서 = 도면 (${n2s(x.xls)}${x.unit?" "+x.unit:""})`);
    else if(x.st==="단계") put(r,"확인",x.dnote||"도면은 전체 단계, 금회 기준 일치");
    else if(x.st==="불일치") put(r,"부적합",`용량계산서 ${n2s(x.xls)} / 도면 ${n2s(x.dwg)}${x.unit?" "+x.unit:""} — 불일치`);
    else if(x.st==="계산서만") put(r,"검토",`용량계산서 값 — 도면에서 대조할 값을 찾지 못함`);
    else if(x.st==="도면만") put(r,"검토",`도면 값 — 용량계산서에 없음`);
  };
  // 1. 설계 기본 사양 (용량계산서 = 설계 기준값)
  for(const r of [11,12,14,16,17]) if(has("D"+r)) put(r,"확인","용량계산서 기준값");
  if(has("D13")){ const x=R("N"); if(x.st==="단계") put(13,"확인",x.dnote); else if(x.st==="일치") put(13,"확인",`용량계산서 = 도면 (${x.xls}지)`); else if(x.st==="불일치") put(13,"부적합",`용량계산서 ${x.xls}지 / 도면 ${x.dwg}지`); else put(13,"확인","용량계산서 기준값"); }
  put(18,"확인","설계 지침 (사이클당 유입시간 기준)");
  if(has("D15")) put(15,"확인","설계유량 ÷ SET ÷ 사이클 수");
  // 2. 유량조정조
  cmp(22,"eqW","가로"); cmp(23,"eqL","세로"); cmp(24,"eqHe","수심"); cmp(25,"eqN","지수");
  if(isNum(val("D26"))) put(26,"확인", X.eqVe?`계산서 유효용량 ${n2s(X.eqVe.v)}㎥`:"가로 × 세로 × 수심 × 지수");
  if(isNum(val("D27"))){ const T=X.eqT&&X.eqT.v; if(T) put(27, val("D27")>=T*0.999?"확인":"부적합", `기준 ${T}hr 이상 (용량계산서) — ${fx.f1(val("D27"))}hr`); else put(27,"검토","체류시간 기준값이 계산서에 없음"); }
  if(has("G28")) put(28, /맞지 않음|LWL 표기 없음/.test(c.G28)?"검토":"확인");
  if(has("D29")) put(29, /추정/.test(c.H29||"")?"검토":"확인", /추정/.test(c.H29||"")?"도면 배관 표기로 추정한 값 — 장비일람표 구경과 대조 필요":"장비 사양 값");
  else if(has("H29")) put(29,null,"구경 자료 없음 — 장비일람표·시방서 필요");
  if(has("D30")) put(30,"확인","장비 사양 값 (펌프 1대 용량)"); else put(30,null, has("H30")?"용량 자료 없음 — 장비일람표·시방서 필요":null);
  if(has("D31")) put(31,"확인","장비 사양 값");
  if(has("G33")) put(33,"검토");
  // 3. 생물반응조
  cmp(37,"W","가로"); cmp(38,"L","세로"); cmp(40,"He","HWL 수심");
  if(has("D39")){ const lv=X.vfvt; const He=val("D40"); if(lv&&isNum(He)&&isNum(val("D39"))){ const minL=He-He*lv.min; put(39, val("D39")>=minL-0.005?"확인":"부적합", `도면 LWL ${fx.f2(val("D39"))}m ≥ 계산서 VF/VT ${lv.min} 기준 하한 ${fx.f2(minL)}m${val("D39")>=minL-0.005?"":" — 미달"}`); } else put(39,"확인","도면 값"); }
  else if(has("G39")) put(39,"검토");
  if(has("D41")) put(41,"확인", c.G41||"도면 값");
  if(isNum(val("D43"))&&isNum(val("D16"))){ const d=val("D43")/val("D16")-1; put(43, Math.abs(d)<=0.05?"확인":"검토"); }
  if(has("G44")) put(44,"확인");
  if(has("G45")) put(45,"검토");
  if(has("G47")) put(47,"검토"); if(has("G48")) put(48,"검토");
  if(has("D49")){ const o=R("sAerO2"); put(49, o.st==="부족"?"부적합":"확인", null); }
  if(has("D50") && blank(c.F50)) put(50,"확인","용량계산서 (최대 케이스)");
  const dk=ctx.designKW;
  if(isNum(val("D51"))) put(51, val("D51")>=dk*0.995?"확인":"검토", `도면 ${fx.f0x(val("D51"))}kW ${val("D51")>=dk*0.995?"≥":"<"} 웹앱 설계 소요동력 ${fx.f0x(dk)}kW${val("D51")>=dk*0.995?"":" — 동력 부족 가능, 제작사 확인"}`);
  if(isNum(val("D52"))) put(52, val("D52")>=dk*0.995?"확인":"검토", `시방서 ${fx.f0x(val("D52"))}kW ${val("D52")>=dk*0.995?"≥":"<"} 웹앱 설계 소요동력 ${fx.f0x(dk)}kW${val("D52")>=dk*0.995?"":" — 동력 부족 가능, 제작사 확인"}`);
  if(has("G54")) put(54,"검토");
  if(has("D58") && blank(c.F58)) put(58,"확인","용량계산서 QIN");
  if(has("D59")){ const x=R("dsz"); if(x.st==="일치") put(59,"확인",`용량계산서 = 도면 (${x.xls}A)`); else if(x.st==="불일치") put(59,"부적합",`용량계산서 ${x.xls}A / 도면 ${x.dwg}A`); else put(59,"검토", x.dwg!=null?"도면 처리수 배관 표기로 추정 — 장비일람표 확인":"용량계산서 값"); }
  if(has("D60")) put(60,"확인","장비 사양 값");
  if(has("D61")) put(61,"확인","용량계산서 배출시간"); if(has("D62")) put(62,"확인","용량계산서 배출장치 설계유입량");
  // 4. 전기·제어
  for(const r of [68,69,72,79,80]) if(has("G"+r)) put(r,"확인");
  if(has("G70") && blank(c.F70)) put(70,"확인"); if(has("G71")) put(71,"검토");
  // 5. 처리수조·총인
  cmp(85,"efW","가로"); cmp(86,"efL","세로"); cmp(87,"efHe","수심"); cmp(88,"efN","지수");
  if(isNum(val("D89"))){ const Vm=X.efVm&&X.efVm.v; if(Vm) put(89, val("D89")>=Vm*0.999?"확인":"부적합", `필요용량 ${n2s(Vm)}㎥ 이상 (용량계산서) — ${fx.f1(val("D89"))}㎥`); else put(89,"확인"); }
  if(isNum(val("D90"))) put(90,"확인", `처리수 체류시간 ${fx.f1(val("D90"))}hr`);
  if(has("G92")) put(92,"확인"); if(has("G93")) put(93,"확인");
  if(has("D94")) put(94,"확인","장비 사양 값 (펌프 1대 용량)");
  if(has("D95")) put(95, /기준$|표기/.test(c.H95||"")?"검토":"확인", /표기/.test(c.H95||"")?"도면 배관 표기 기준 — 장비일람표 확인":null);
  if(has("G96")) put(96,"검토");
  if(has("D97")) put(97,"검토",`총인 공급펌프 1대 기준 사이클당 ${fx.f1(val("D97"))}분 — 운전 방식(연속/회분) 확인`);
  if(has("D56") && blank(c.G56)) put(56,null, c.D56==="있음"?null:"도면에서 반응조 상부 호이스트를 찾지 못함 — 유지관리 계획 확인");
  // 시방서·전원 자료가 비어 수식이 판정을 못 내는 칸
  if(blank(V1.D53) && isNum(val("D51"))) put(53,"검토",`시방서 동력 값 없음 — 도면 ${fx.f0x(val("D51"))}kW만 확인됨, 시방서 대조 필요`);
  if(blank(V1.D53) && !isNum(val("D51")) && isNum(val("D52"))) put(53,"검토",`도면에 동력 표기 없음 — 시방서 ${fx.f0x(val("D52"))}kW만 확인됨, 기기일람표 대조 필요`);
  if(blank(V1.D75) && isNum(val("D52")) && isNum(val("D60")) && isNum(val("D13"))){ const ld=(val("D52")+val("D60"))*val("D13"), cap=val("D74");
    if(isNum(cap)) put(75, cap>=ld?"확인":"부적합", `도면 동력 없음 — 시방서 기준 (${fx.f0x(val("D52"))}+${fx.f0x(val("D60"))})×${val("D13")} = ${fx.f0x(ld)}kW ${cap>=ld?"≤":">"} 1차 전원 ${fx.f1(cap)}kW`);
    else put(75,"검토",`도면 동력 없음 — 시방서 기준 (${fx.f0x(val("D52"))}+${fx.f0x(val("D60"))})×${val("D13")} = ${fx.f0x(ld)}kW, 1차 전원 용량 확인`); }
  if(isNum(V1.D75) && blank(V1.F75) && !isNum(val("D74"))) put(75,"검토",`동력부하 ${fx.f0x(V1.D75)}kW — 도면에서 1차 전원 용량을 찾지 못함, 전기 도면 확인`);
  if(has("H69") && blank(c.G69)) put(69,null,`${c.H69} — 인버터·PLC 이중화·LOP 면수는 시방서·제어반 도면 확인`);
  // 자동 판정이 불가능한 항목: 판정은 비워 두고(=담당자 확인) 확인할 내용을 적어 둠
  const MAN={44:"구조 도면에서 벽체·바닥 두께와 레벨 확인",45:"평면·단면도에서 기둥·보·벽체·배출장치·핸드레일·호이스트와 간섭 확인",
    46:"반응조 덮개 형식과 점검구 위치 확인",47:"배출장치 슬리브 구경·BOP 레벨 확인",48:"슬리브 시공 주체(토목/기계) 확인",
    55:"전동윈치 설치 위치와 주변 구조물 간섭 확인",57:"포기장치·제어반 반입구와 양중 경로 확인",68:"전기실·현장 제어반 설치 위치 확인",
    70:"감시제어반(RCS) 공급 범위 확인",71:"MCC반 공급 범위 확인",73:"제어반 베이스 규격·시공 주체 확인",74:"전기 도면에서 1차 전원(변압기·분전반) 용량 확인",
    78:"제어반~기기 배선 구간 길이 합계 × 여유율 확인",79:"제어·통신 방식(PLC·HMI·통신 프로토콜) 확인",80:"계측기 설치 위치·브라켓 확인",
    84:"처리수조 PIT 유무 확인",92:"총인설비 약품·배관·전기·제어 공급 범위 확인",93:"총인설비 PAD 규격·시공 주체 확인"};
  for(const [r,t] of Object.entries(MAN)) if(blank(c["F"+r]) && blank(c["G"+r]) && blank(V1["F"+r])) c["G"+r]="담당자 확인 — "+t;
}

// ---- 2) 양식 수식의 계산값 (엑셀이 다시 계산하기 전에도 보이게)
function tplEval(c){
  const V={}; const g=a=> a in V ? V[a] : (a in c ? c[a] : (TPL_META[+a.slice(1)]&&TPL_META[+a.slice(1)][a[0]]&&!TPL_META[+a.slice(1)][a[0]].startsWith("=")?TPL_META[+a.slice(1)][a[0]]:""));
  const num=a=>{ const v=g(a); return isNum(v)?v:(typeof v==="string"&&v!==""&&isFinite(+v)?+v:null); };
  const isF=(a)=>{ const m=TPL_META[+a.slice(1)]; return !!(m&&m[a[0]]&&m[a[0]].startsWith("=")); };
  const set=(a,v)=>{ if(isF(a) && !(a in c)) V[a]=v; };
  // 계산 칸
  const D12=num("D12"),D13=num("D13"),D14=num("D14");
  set("D15", D12!=null&&D13&&D14? D12/D13/D14 : "");
  const q=["D22","D23","D24","D25"].map(num); set("D26", q.every(v=>v!=null)? q[0]*q[1]*q[2]*q[3] : "");
  set("D27", isNum(V.D26)&&D12? V.D26/(D12/24) : "");
  const D15=V.D15, D30=num("D30"), D18=num("D18");
  set("D32", D30&&isNum(D15)? D15/D30 : ""); set("F32", isNum(V.D32)? (V.D32<=D18?"확인":"부적합") : ""); set("G32", isNum(V.D32)? `기준 ${D18}분 ${V.D32<=D18?"이내":"초과"}` : "");
  const D37=num("D37"),D38=num("D38"),D39=num("D39"),D40=num("D40");
  set("D42", D37!=null&&D38!=null&&D40!=null? D37*D38*D40 : ""); set("G42", D39!=null&&D40!=null? `배출수위(He) ${fx.f2(D40-D39)}m` : "");
  set("D43", isNum(V.D42)&&D12&&D13? V.D42*D13/(D12/24) : ""); const D16=num("D16"); set("G43", isNum(V.D43)&&D16? `목표 HRT ${fx.f1(D16)}hr 대비 ${fx.pct(V.D43/D16-1)}` : "");
  const D51=num("D51"),D52=num("D52"); set("D53", D51!=null&&D52!=null? (D51===D52?"일치":"불일치") : ""); set("F53", V.D53? (V.D53==="일치"?"확인":"부적합") : ""); set("G53", V.D53? `시방서 ${fx.f0x(D52)}kW / 도면 ${fx.f0x(D51)}kW` : "");
  set("D63", D37!=null&&D38!=null&&D40!=null&&D39!=null? D37*D38*(D40-D39) : ""); set("F63", isNum(V.D63)&&isNum(D15)? (V.D63>=D15?"확인":"부적합") : ""); set("G63", isNum(V.D63)&&isNum(D15)? `Q/Cycle ${fx.c1(D15)}㎥ 대비 ${fx.pct(V.D63/D15-1)}` : "");
  const D58=num("D58"),D61=num("D61"),D62=num("D62"); const tgt = D62!=null? D62/D13/D14 : D15;
  set("D64", isNum(D15)&&D58? tgt/(D58*3.6) : ""); const need = isNum(V.D64)&&D61? Math.round(tgt/(D61*3600)*1000)/1000 : null;
  set("F64", need!=null? (need<=D58/1000?"확인":"부적합") : ""); set("G64", need!=null? `배출 대상 ${fx.f1(tgt)}㎥/cycle · 필요 배출유량 ${fx.i0(need*1000)}L/s (계산서 방식 ROUND 3자리) / 배출단계 ${fx.f2(D61)}hr` : "");
  const D60=num("D60"),D74=num("D74"); set("D75", D51!=null&&D60!=null&&D13? (D51+D60)*D13 : ""); set("F75", isNum(V.D75)&&D74!=null? (D74>=V.D75?"확인":"부적합") : ""); set("G75", isNum(V.D75)? `1차 전원 ${D74==null?"-":fx.f1(D74)+"kW "+(D74>=V.D75?"(충족)":"(부족)")}` : "");
  const D76=num("D76"),D77=num("D77"); set("D78", D76!=null&&D77!=null? D76*D77 : "");
  const e=["D85","D86","D87","D88"].map(num); set("D89", e.every(v=>v!=null)? e[0]*e[1]*e[2]*e[3] : ""); set("D90", isNum(V.D89)&&D12? V.D89/(D12/24) : "");
  const D94=num("D94"); set("D97", D94&&isNum(D15)? D15/D94 : "");
  // 번호(A) · 집계(K) · 요약(I·J)
  const starts=[11,22,37,68,84,101];
  for(let r=1;r<=105;r++){ const m=TPL_META[r]; if(!m) continue;
    const C=g("C"+r);
    if(isF("A"+r)&&r>=11){ const s=starts.filter(x=>x<=r).pop(); let n=0; for(let k=s;k<=r;k++) if(!blank(g("C"+k))) n++; V["A"+r]=blank(C)?"":n; }
    if(isF("K"+r)) V["K"+r]=blank(C)?0:1;
  }
  let iMax=0;
  for(let r=1;r<=105;r++){ if(!isF("I"+r)) continue; const F=g("F"+r); if(F==="부적합"||F==="검토"){ iMax++; V["I"+r]=iMax; } else V["I"+r]="";
    const C=String(g("C"+r)||""), D=g("D"+r), G=String(g("G"+r)||""), E=String(g("E"+r)||"");
    const head=C.split(" (")[0]; const Dt= blank(D)?"": n2s(D)+(isNum(D)&&E?" "+E:"");
    V["J"+r]= head + ((blank(D)||G==="")? (!blank(D)?": "+Dt : (G!==""?": "+G:"")) : ": "+Dt+" / "+G); }
  const C3=g("C3"); V.A1 = blank(C3)? "설계성과품 검토서" : C3+" 설계성과품 검토서";
  let tot=0, ok=0, rv=0, ng=0; for(let r=1;r<=105;r++){ const k=V["K"+r]; if(isNum(k)) tot+=k; const F=isNum(k)&&k>0?g("F"+r):""; if(F==="확인") ok++; else if(F==="검토") rv++; else if(F==="부적합") ng++; }
  V.C7=`전체 ${tot}건  ·  확인 ${ok}  ·  검토 ${rv}  ·  부적합 ${ng}  ·  미작성 ${tot-ok-rv-ng}`;
  const byI=n=>{ for(let r=1;r<=105;r++) if(V["I"+r]===n) return r; return null; };
  for(let n=1;n<=7;n++){ const r=byI(n); V["A"+(108+n)]= r? `${g("F"+r)} · ${g("B"+r)}` : ""; V["C"+(108+n)]= r? V["J"+r] : ""; }
  if(iMax>8){ V.A116=""; V.C116=`외 ${iMax-7}건은 위 점검표에서 확인`; } else { const r=byI(8); V.A116= r? `${g("F"+r)} · ${g("B"+r)}` : ""; V.C116= r? V["J"+r] : ""; }
  return V;
}
