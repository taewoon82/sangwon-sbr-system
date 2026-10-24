(function(){
const D = JSON.parse(document.getElementById('data').textContent);
const G = D.geo, W=G.W, L=G.L, H=G.H;
const view = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
view.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35,1,0.05,300);
camera.up.set(0,0,1);
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping=true; controls.maxDistance=120;
scene.add(new THREE.HemisphereLight(0xffffff,0x8090a0,0.85));
const dl = new THREE.DirectionalLight(0xffffff,0.7); dl.position.set(8,-12,20); scene.add(dl);
const mat=(c,op,ds)=>new THREE.MeshStandardMaterial({color:c,metalness:.15,roughness:.7,transparent:op<1,opacity:op,depthWrite:op>=1,side:ds?THREE.DoubleSide:THREE.FrontSide});
function b64(s,T){const b=atob(s),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return new T(u.buffer)}

// ---- 구조물 ----
const gS=new THREE.Group(); scene.add(gS);
function edge(m){const e=new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry,25),new THREE.LineBasicMaterial({color:0x56606b,transparent:true,opacity:.5}));e.position.copy(m.position);e.rotation.copy(m.rotation);gS.add(e)}
function box(w,d,h,x,y,z,m){const o=new THREE.Mesh(new THREE.BoxGeometry(w,d,h),m);o.position.set(x,y,z);gS.add(o);edge(o);return o}
const t=0.3, wallM=mat(0xb9c0c6,.13,true);
box(W+2*t,t,H+0.6,W/2,-t/2,(H+0.6)/2,wallM); box(W+2*t,t,H+0.6,W/2,L+t/2,(H+0.6)/2,wallM);
box(t,L,H+0.6,-t/2,L/2,(H+0.6)/2,wallM); box(t,L,H+0.6,W+t/2,L/2,(H+0.6)/2,wallM);
const floorM=new THREE.Mesh(new THREE.PlaneGeometry(W+2*t,L+2*t),new THREE.MeshStandardMaterial({color:0x9aa0a6,roughness:.9})); floorM.position.set(W/2,L/2,-0.002); gS.add(floorM);
// 헌치 (삼각 기둥)
const hn=G.haunch, hM=mat(0xa7aeb4,.55,true);
function prism(len,rotZ,x,y){const s=new THREE.Shape();s.moveTo(0,0);s.lineTo(hn,0);s.lineTo(0,hn);s.lineTo(0,0);
  const g=new THREE.ExtrudeGeometry(s,{depth:len,bevelEnabled:false}); g.rotateX(Math.PI/2); g.translate(0,len/2,0);
  // 단면: x(벽에서 안쪽) – z(높이), 길이 방향 y
  const m=new THREE.Mesh(g,hM); m.rotation.z=rotZ; m.position.set(x,y,0); gS.add(m); return m}
if(hn>0){ prism(L,0,0,L/2); prism(L,Math.PI,W,L/2); prism(W,Math.PI/2,W/2,0); prism(W,-Math.PI/2,W/2,L); }
// 십자구조물
const cM=mat(0x8f979b,.9,false);
box(G.cross_w,G.cross_t,G.cross_h,G.turb_x,G.turb_y,G.cross_h/2,cM); box(G.cross_t,G.cross_w,G.cross_h,G.turb_x,G.turb_y,G.cross_h/2,cM);
// 수면 윤곽
const wl=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[0,0],[W,0],[W,L],[0,L]].map(p=>new THREE.Vector3(p[0],p[1],H))),new THREE.LineBasicMaterial({color:0x3d8fc7}));
scene.add(wl);
// 포기장치 (터빈 몸체 + 토출 띠 + 플로트 개략)
const gA=new THREE.Group(); scene.add(gA);
// 포기장치·배출장치·기둥 — 제작도 기준 3D 형상(형상확인_장흥과 같은 메시, mm → m). 해석에는 같은 위치의 단순 형상을 넣음
const MESH=G.mesh||null;
function mgeo(d){ const p=b64(d.p,Float32Array), ix=b64(d.i,Uint32Array); const g=new THREE.BufferGeometry(); const q=new Float32Array(p.length); for(let k=0;k<p.length;k++) q[k]=p[k]/1000;
  g.setAttribute('position',new THREE.BufferAttribute(q,3)); g.setIndex(new THREE.BufferAttribute(ix,1)); g.computeVertexNormals(); return g; }
const mcol=c=>new THREE.Color(c[0],c[1],c[2]);
if(MESH){
  for(const [k,d] of Object.entries(MESH.static)){ if(['STRUCTURE','HAUNCH','CROSS'].includes(k)) continue;
    const m=new THREE.Mesh(mgeo(d),mat(mcol(MESH.colors[k]||[.72,.72,.7]),1,true)); (k==='COLUMN'?gS:gA).add(m); }
  const piv=new THREE.Group(); piv.position.set(0,MESH.pivot[0]/1000,MESH.pivot[1]/1000); piv.rotation.x=-(G.decAngle||0)*Math.PI/180; gA.add(piv);
  for(const [k,d] of Object.entries(MESH.rot)){ const g=mgeo(d); g.translate(0,-MESH.pivot[0]/1000,-MESH.pivot[1]/1000); piv.add(new THREE.Mesh(g,mat(mcol(MESH.colors[k]||[.8,.8,.8]),k==='AIR_SHIELD'?0.45:1,true))); }
  const AE=MESH.aer; const dz=(H*1000-AE.base_water)/1000;
  for(const [k,d] of Object.entries(AE.float)){ const m=new THREE.Mesh(mgeo(d),mat(mcol(AE.colors[k]||[.7,.7,.7]),1,true)); m.position.z=dz; gA.add(m); }
  for(const [k,d] of Object.entries(AE.fixed)) gA.add(new THREE.Mesh(mgeo(d),mat(mcol(AE.colors[k]||[.6,.6,.6]),1,true)));
} else if(G.obst){ const OC={columns:0xb9bec4,rails:0x8a949e,floats:0xe3e6e8,decanter:0xc9a24a};
  for(const [g,items] of Object.entries(G.obst)){ const m=mat(OC[g]||0xaaaaaa,1,false);
    for(const it of items){
      if(it.t==="box"){ const a=it.min,b=it.max; const z0=Math.max(a[2],0), z1=Math.min(b[2],H+0.3); const o=new THREE.Mesh(new THREE.BoxGeometry(Math.min(b[0],W)-Math.max(a[0],0),Math.min(b[1],L)-Math.max(a[1],0),z1-z0),m); o.position.set((Math.min(b[0],W)+Math.max(a[0],0))/2,(Math.min(b[1],L)+Math.max(a[1],0))/2,(z0+z1)/2); gA.add(o); }
      else { const p0=new THREE.Vector3(...it.p0), p1=new THREE.Vector3(...it.p1); if(p0.z<0)p0.z=0; const len=p0.distanceTo(p1);
        const o=new THREE.Mesh(new THREE.CylinderGeometry(it.r,it.r,len,24),m); o.position.copy(p0).add(p1).multiplyScalar(0.5);
        o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), p1.clone().sub(p0).normalize()); gA.add(o); } } } }
const tb=new THREE.Mesh(new THREE.CylinderGeometry(G.turb_R,G.turb_R*0.55,G.turb_depth,48),mat(0x2f6f9f,1,false)); tb.rotation.x=Math.PI/2; tb.position.set(G.turb_x,G.turb_y,H-G.turb_depth/2); if(!MESH) gA.add(tb);
const band=new THREE.Mesh(new THREE.CylinderGeometry(G.turb_R+0.01,G.turb_R+0.01,G.band,48,1,true),new THREE.MeshBasicMaterial({color:0xeb6834,transparent:true,opacity:.55,side:THREE.DoubleSide})); band.rotation.x=Math.PI/2; band.position.set(G.turb_x,G.turb_y,H-G.band/2); gA.add(band);
const mot=new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.2,0.6,24),mat(0x3b6e4f,1,false)); mot.rotation.x=Math.PI/2; mot.position.set(G.turb_x,G.turb_y,H+0.45); if(!MESH) gA.add(mot);
if(!G.obst)for(let j=0;j<3;j++){const a=Math.PI/2+j*2*Math.PI/3, r=1.25*(G.turb_R/0.675); const f=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.22,1.3,20),mat(0xe3e6e8,1,false)); f.position.set(G.turb_x+r*Math.cos(a),G.turb_y+r*Math.sin(a),H+0.04); f.rotation.z=a; gA.add(f)}
// 회전 방향 표시
{const pts=[];for(let i=0;i<=40;i++){const a=i/40*Math.PI*1.5;pts.push(new THREE.Vector3(G.turb_x+(G.turb_R+0.35)*Math.cos(a),G.turb_y+(G.turb_R+0.35)*Math.sin(a),H+0.05))}
 gA.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0xeb6834})));
 const tip=pts[pts.length-1], cone=new THREE.Mesh(new THREE.ConeGeometry(0.12,0.3,16),new THREE.MeshBasicMaterial({color:0xeb6834})); cone.position.copy(tip); cone.rotation.z=Math.PI*1.5; gA.add(cone)}

// ---- 바닥 유속도 (바닥·헌치 경사면을 따라감) ----
const [NR,NC]=D.magShape;
const fg=new THREE.PlaneGeometry(W,L,NC-1,NR-1);
const bedZ=new Float32Array(fg.attributes.position.count);
for(let i=0;i<bedZ.length;i++){const x=fg.attributes.position.getX(i)+W/2,y=fg.attributes.position.getY(i)+L/2;const d=Math.min(x,W-x,y,L-y);bedZ[i]=Math.max(0,hn-d)}
const cv=document.createElement('canvas'); cv.width=NC; cv.height=NR;
const ctx=cv.getContext('2d'); const ctex=new THREE.CanvasTexture(cv); ctex.magFilter=THREE.NearestFilter;
const floorTex=new THREE.Mesh(fg,new THREE.MeshBasicMaterial({map:ctex,transparent:true,side:THREE.DoubleSide,depthWrite:false}));
floorTex.position.set(W/2,L/2,0); scene.add(floorTex);
function setBed(h){const a=fg.attributes.position;for(let i=0;i<bedZ.length;i++)a.setZ(i,bedZ[i]+h);a.needsUpdate=true}
const GR={};
function grid(key,h){const k=key+'|'+h;if(!GR[k])GR[k]=b64(D.cases[key].mag[h],Uint16Array);return GR[k]}
const LUT=D.cols.map(c=>[parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)]);
function lvl(v){let i=0;while(i<D.levels.length-2&&v>=D.levels[i+1])i++;return i}
function paint(g){const im=ctx.createImageData(NC,NR);for(let i=0;i<g.length;i++){const v=g[i];if(v===65535){im.data[4*i+3]=0;continue}const c=LUT[lvl(v/1000)];im.data[4*i]=c[0];im.data[4*i+1]=c[1];im.data[4*i+2]=c[2];im.data[4*i+3]=235}ctx.putImageData(im,0,0);ctex.needsUpdate=true}
// ---- 유선 + 입자 ----
const gL=new THREE.Group(); gL.visible=false; scene.add(gL);
const LV=D.levels, LC=D.cols.map(c=>new THREE.Color(c));
function colOf(s){let i=0;while(i<LV.length-2&&s>=LV[i+1])i++;return LC[i]}
let particles=null, plines=[];
const PN=4;
function buildLines(C){
  gL.clear(); plines=[];
  if(particles){scene.remove(particles);particles.geometry.dispose()}
  for(const Ln of C.lines){
    const n=Ln.s.length, pos=new Float32Array(Ln.p), col=new Float32Array(n*3), cum=new Float32Array(n);
    for(let i=0;i<n;i++){const c=colOf(Ln.s[i]);col.set([c.r,c.g,c.b],3*i); if(i)cum[i]=cum[i-1]+Math.hypot(pos[3*i]-pos[3*i-3],pos[3*i+1]-pos[3*i-2],pos[3*i+2]-pos[3*i-1]);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('color',new THREE.BufferAttribute(col,3));
    gL.add(new THREE.Line(g,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.4})));
    plines.push({pos,cum,s:Ln.s,t:[...Array(PN)].map((_,j)=>cum[n-1]*j/PN)});
  }
  const pg=new THREE.BufferGeometry(); pg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(plines.length*PN*3),3));
  particles=new THREE.Points(pg,new THREE.PointsMaterial({color:0x0b3a5c,size:0.11,sizeAttenuation:true}));
  particles.visible=document.getElementById('cP').checked; scene.add(particles);
}
function stepParticles(dt){
  if(!particles||!particles.visible)return;
  const a=particles.geometry.attributes.position.array; let k=0; const SP=3; // 표시 배속 3x
  for(const Ln of plines){
    const n=Ln.s.length, tot=Ln.cum[n-1];
    for(let j=0;j<PN;j++){
      let tt=Ln.t[j]; let i=0; while(i<n-2&&Ln.cum[i+1]<tt)i++;
      const f=Math.min(1,Math.max(0,(tt-Ln.cum[i])/Math.max(1e-6,Ln.cum[i+1]-Ln.cum[i])));
      const sp=Ln.s[i]*(1-f)+Ln.s[i+1]*f;
      a[k++]=Ln.pos[3*i]+(Ln.pos[3*i+3]-Ln.pos[3*i])*f; a[k++]=Ln.pos[3*i+1]+(Ln.pos[3*i+4]-Ln.pos[3*i+1])*f; a[k++]=Ln.pos[3*i+2]+(Ln.pos[3*i+5]-Ln.pos[3*i+2])*f;
      tt+=Math.max(sp,0.01)*SP*dt; if(tt>tot)tt-=tot; Ln.t[j]=tt;
    }
  }
  particles.geometry.attributes.position.needsUpdate=true;
}

// ---- UI ----
const KEYS=Object.keys(D.cases);
let cur=D.default||KEYS[0], hsel='0.2';
const cbox=document.getElementById('cases');
for(const k of KEYS){const b=document.createElement('button');b.type='button';b.textContent=D.cases[k].label;b.dataset.k=k;b.onclick=()=>{cur=k;apply()};cbox.appendChild(b)}
document.getElementById('h02').onclick=()=>{hsel='0.2';apply()};
document.getElementById('h05').onclick=()=>{hsel='0.5';apply()};
const pct=x=>(x*100).toFixed(1)+'%';
function where(x,y){const dc=Math.hypot(x-G.turb_x,y-G.turb_y);
  if(dc<G.cross_w/2+0.4)return '십자구조물 주변';
  const ns=y>L*0.7?'북':(y<L*0.3?'남':''),ew=x>W*0.7?'동':(x<W*0.3?'서':'');let s=(ns+ew)||'중앙';if(ns&&ew)s+=' 모서리';else if(ns||ew)s+='측 벽';return s}
let lastLines=null;
function apply(){
  const C=D.cases[cur], R=C.res;
  for(const b of cbox.children)b.setAttribute('aria-pressed',b.dataset.k===cur);
  document.getElementById('h02').setAttribute('aria-pressed',hsel==='0.2');
  document.getElementById('h05').setAttribute('aria-pressed',hsel==='0.5');
  paint(grid(cur,hsel)); setBed(parseFloat(hsel));
  if(lastLines!==cur){buildLines(C);lastLines=cur}
  document.getElementById('hud').innerHTML='<b>'+C.label+' ('+R.rpm.toFixed(1)+' rpm)</b> · 바닥 위 '+hsel+' m 수평유속 (m/s)<div class="legend">'+D.cols.map(c=>'<span style="background:'+c+'"></span>').join('')+'</div><div class="legend-t">'+D.levels.slice(0,-1).map(v=>'<span>'+v+'</span>').join('')+'</div>';
  const rows=[['항목','0.2 m','0.5 m'],
    ['0.10 m/s 미만 면적',pct(R['floor0.2_lt_0.1']),pct(R['floor0.5_lt_0.1'])],
    ['0.15 m/s 미만 면적',pct(R['floor0.2_lt_0.15']),pct(R['floor0.5_lt_0.15'])],
    ['0.30 m/s 미만 면적',pct(R['floor0.2_lt_0.3']),pct(R['floor0.5_lt_0.3'])],
    ['평균 수평유속 (m/s)',R['floor0.2_mean'].toFixed(2),R['floor0.5_mean'].toFixed(2)],
    ['하위 10% 유속 (m/s)',R['floor0.2_p10'].toFixed(2),R['floor0.5_p10'].toFixed(2)]];
  if(R.band){const b=R.band; rows.push(['순간값 범위 (0.2 m, 11개)','<0.15: '+pct(b.lt15[0])+'~'+pct(b.lt15[1]),'평균 '+b.mean[0].toFixed(2)+'~'+b.mean[1].toFixed(2)]);}
  document.getElementById('sumlab').textContent='결과 요약 ('+C.label+')';
  document.getElementById('tbl').innerHTML=rows.map((r,i)=>'<tr>'+r.map(c=>i?'<td>'+c+'</td>':'<th>'+c+'</th>').join('')+'</tr>').join('');
  document.getElementById('spotlab').textContent='정체 지점 ('+C.label+', 바닥 위 0.2 m, 0.15 m/s 미만 · 면적순)';
  document.getElementById('spots').innerHTML='<tr><th>위치</th><th>X, Y (m)</th><th>면적 m²</th><th>수직 m/s</th></tr>'+(R.spots||[]).slice(0,10).map(s=>'<tr><td>'+where(s.x,s.y)+'</td><td>'+s.x.toFixed(1)+', '+s.y.toFixed(1)+'</td><td>'+s.area.toFixed(1)+'</td><td>'+(s.vz!=null?(s.vz>=0?'↑':'↓')+Math.abs(s.vz).toFixed(2):'–')+'</td></tr>').join('')||'<tr><td colspan=4>없음</td></tr>';
  document.getElementById('cond').innerHTML=[['격자',R.cells.toLocaleString()+' 셀'],['터빈 회전수',R.rpm.toFixed(1)+' rpm'],['축동력 (가정)',(R.P_shaft/1000).toFixed(2)+' kW'],['순환량 Q',R.Q.toFixed(3)+' m³/s'],['토출 반경 / 접선 속도',R.Vr.toFixed(2)+' / '+R.Vt.toFixed(2)+' m/s'],['수체 평균유속',R.Umean.toFixed(3)+' m/s'],['수체적',R.vol.toFixed(0)+' m³'],['결과 기준',R.avg||(R.time.toFixed(0)+'회')]].map(r=>'<dt>'+r[0]+'</dt><dd>'+r[1]+'</dd>').join('');
  chart();
}
const SV='http://www.w3.org/2000/svg';
function chart(){
  const svg=document.getElementById('hzc'); svg.innerHTML='';
  const hzKeys=KEYS.filter(k=>D.cases[k].hz!=null&&!D.cases[k].aux).sort((a,b)=>D.cases[a].hz-D.cases[b].hz);
  if(hzKeys.length<2){svg.style.display='none';return}
  const L0=34,Rr=262,T0=10,Bt=140, X=f=>L0+(f-15)/45*(Rr-L0), Y=p=>Bt-p*(Bt-T0);
  const el=(t,a,txt)=>{const e=document.createElementNS(SV,t);for(const k in a)e.setAttribute(k,a[k]);if(txt!=null)e.textContent=txt;svg.appendChild(e);return e};
  for(const p of [0,.25,.5,.75,1]){el('line',{x1:L0,x2:Rr,y1:Y(p),y2:Y(p),stroke:'var(--grid)','stroke-width':1});el('text',{x:L0-4,y:Y(p)+3,'text-anchor':'end'},(p*100)+'%')}
  for(const f of [15,30,45,60])el('text',{x:X(f),y:Bt+13,'text-anchor':'middle'},f+' Hz');
  const col={lt15:'var(--s2)',lt30:'var(--s1)'}, lab={lt15:'0.15 m/s 미만',lt30:'0.30 m/s 미만'};
  for(const k of ['lt30','lt15']){
    const pts=hzKeys.map(h=>[D.cases[h].hz,D.cases[h].res[k==='lt15'?'floor0.2_lt_0.15':'floor0.2_lt_0.3']]);
    el('polyline',{points:pts.map(([f,v])=>X(f)+','+Y(v)).join(' '),fill:'none',stroke:col[k],'stroke-width':2});
    pts.forEach(([f,v])=>el('circle',{cx:X(f),cy:Y(v),r:4,fill:col[k],stroke:'var(--sheet)','stroke-width':2}));
    el('text',{x:Rr+4,y:Y(pts[pts.length-1][1])+3},lab[k]);
  }
  const ch=D.cases[cur]; if(ch.hz!=null) el('line',{x1:X(ch.hz),x2:X(ch.hz),y1:T0,y2:Bt,stroke:'var(--fg)','stroke-width':1,'stroke-dasharray':'3 3'});
}
const tog=(id,o)=>{document.getElementById(id).onchange=e=>{o.visible=e.target.checked}};
tog('cF',floorTex);tog('cL',gL);tog('cS',gS);tog('cA',gA);
document.getElementById('cP').onchange=e=>{if(particles)particles.visible=e.target.checked};
function cam(p,tg){camera.position.set(...p);controls.target.set(...tg);controls.update()}
document.getElementById('vIso').onclick=()=>cam([-W*0.55,-L*1.15,H*4.2],[W/2,L/2,0.4]);
document.getElementById('vTop').onclick=()=>cam([W/2,L/2-0.001,Math.max(W,L)*2.3],[W/2,L/2,0]);
document.getElementById('vSide').onclick=()=>cam([W/2,-L*1.9,H*0.55],[W/2,L/2,H*0.5]);
function resize(){const w=view.clientWidth,h=view.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}
window.addEventListener('resize',resize); resize();
document.getElementById('vIso').onclick(); apply();
let last=performance.now();
(function loop(now){now=now||performance.now();const dt=Math.min(.05,(now-last)/1000);last=now;stepParticles(dt);controls.update();renderer.render(scene,camera);requestAnimationFrame(loop)})();
})();
