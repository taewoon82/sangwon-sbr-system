// ===== SBR 반응조 · 포기장치 · 배출장치 형상 (제작도 기준, z-up, m) — 3D 뷰어·유동해석 공용 사양 =====
// S: jh_geometry.json 형식. level: 현재 수위(바닥 기준 m). 반환: {tank, aer, dec} 그룹
function addSBRGeometry(THREE, root, S, opt){
  opt=opt||{}; const lev=opt.level!=null?opt.level:S.H, clip=opt.clip||[];
  const W=S.W, L=S.L, top=S.top, t=0.3;
  const M=(c,o)=>{o=o||{}; return new THREE.MeshStandardMaterial({color:c,metalness:o.m||0.1,roughness:o.r||0.75,transparent:!!o.op,opacity:o.op||1,depthWrite:!o.op,side:o.ds?THREE.DoubleSide:THREE.FrontSide,clippingPlanes:o.noclip?[]:clip});};
  const conc=M(0xbfc4c2,{op:opt.wallOp||0.18,ds:1}), concS=M(0xa9aeab), sts=M(0xc8d0d6,{m:.55,r:.35}), frp=M(0x2f6f9f,{r:.5}), green=M(0x3b6e4f), floatM=M(0xdfe4e8,{m:.4,r:.4}), yel=M(0xe0b000);
  const G={tank:new THREE.Group(), aer:new THREE.Group(), dec:new THREE.Group()}; Object.values(G).forEach(g=>root.add(g));
  const add=(g,geo,mat,pos,rot)=>{const m=new THREE.Mesh(geo,mat); if(pos)m.position.set(...pos); if(rot)m.rotation.set(...rot); g.add(m); return m;};
  const box=(g,w,d,h,x,y,z,mat)=>add(g,new THREE.BoxGeometry(w,d,h),mat,[x,y,z]);
  const vcyl=(g,r,h,x,y,z0,mat,seg)=>add(g,new THREE.CylinderGeometry(r,r,h,seg||24),mat,[x,y,z0+h/2],[Math.PI/2,0,0]);
  const pipe=(g,a,b,r,mat)=>{const va=new THREE.Vector3(...a), vb=new THREE.Vector3(...b), d=vb.clone().sub(va), len=d.length(); const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,len,16),mat); m.position.copy(va.clone().add(vb).multiplyScalar(.5)); m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()); g.add(m); return m;};
  // --- 반응조: 벽(반투명) · 바닥 · 헌치 · 기둥 · 십자구조물 ---
  const T=G.tank;
  box(T,W+2*t,t,top,W/2,-t/2,top/2,conc); box(T,W+2*t,t,top,W/2,L+t/2,top/2,conc);
  box(T,t,L,top,-t/2,L/2,top/2,conc); box(T,t,L,top,W+t/2,L/2,top/2,conc);
  box(T,W+2*t,L+2*t,0.3,W/2,L/2,-0.15,M(0x9aa0a6,{noclip:1}));
  const hn=S.haunch; if(hn>0){ const sh=new THREE.Shape(); sh.moveTo(0,0); sh.lineTo(hn,0); sh.lineTo(0,hn); sh.lineTo(0,0);
    const pr=(len,rz,x,y)=>{const g=new THREE.ExtrudeGeometry(sh,{depth:len,bevelEnabled:false}); g.rotateX(Math.PI/2); g.translate(0,len/2,0); add(T,g,concS,[x,y,0],[0,0,rz]);};
    pr(L,0,0,L/2); pr(L,Math.PI,W,L/2); pr(W,Math.PI/2,W/2,0); pr(W,-Math.PI/2,W/2,L); }
  for(const c of S.columns) vcyl(T,c.d/2,top,c.x,c.y,0,concS,28);
  const tb=S.turbine, cr=S.cross;
  box(T,cr.w,cr.t,cr.h,tb.x,tb.y,cr.h/2,concS); box(T,cr.t,cr.w,cr.h,tb.x,tb.y,cr.h/2,concS);
  // --- 포기장치 (부유식, 수위 lev 를 따라 움직임) ---
  const A=G.aer; A.position.z=lev-S.H;
  const k=tb.D_max/1.35, zW=S.H;   // 터빈 형상: 카탈로그 Ø1250 (최대 Ø1350, 흡입 Ø832, 콘 높이 320, 수로 80)
  const prof=[[tb.D_suction/2,zW-tb.depth],[0.47*k,zW-0.28*k],[0.60*k,zW-0.10*k],[0.675*k,zW-0.04*k],[0.675*k,zW+0.04*k],[0.11,zW+0.06]].map(p=>new THREE.Vector2(p[0],p[1]));
  const lathe=new THREE.LatheGeometry(prof,48); lathe.rotateX(Math.PI/2); const rot=add(A,lathe,frp,[tb.x,tb.y,0]); rot.userData.rotor=true;
  for(let i=0;i<12;i++){ const a=i/12*Math.PI*2; const v=new THREE.Mesh(new THREE.BoxGeometry(0.16*k,0.02,0.08),frp); v.position.set(tb.x+Math.cos(a)*0.6*k,tb.y+Math.sin(a)*0.6*k,zW); v.rotation.z=a+0.5; A.add(v); }
  pipe(A,[tb.x,tb.y,zW],[tb.x,tb.y,zW+0.93],0.055,sts);            // 축 (JH-MS-007, 930)
  // 베이스 플레이트(삼각 프레임) · 감속기
  const BP=zW+0.75; box(A,1.08,1.08,0.03,tb.x,tb.y,BP,sts);
  box(A,0.5,0.5,0.32,tb.x,tb.y,BP+0.18,green); vcyl(A,0.19,0.5,tb.x,tb.y,BP+0.34,green);
  const fp=S.floats.map(f=>{const a=f.ang*Math.PI/180; return [tb.x+f.r*Math.cos(a),tb.y+f.r*Math.sin(a)];});
  for(const [i,f] of S.floats.entries()){
    const [fx,fy]=fp[i];
    vcyl(A,f.d/2,f.top-f.bottom,fx,fy,zW+f.bottom,floatM,32);       // 플로트 Φ1200 (수직)
    pipe(A,[fx,fy,zW+f.bottom],[fx,fy,zW+f.bottom-f.leg_len],f.leg_d/2,sts); // 하부 노즐·다리 150A
    pipe(A,[tb.x,tb.y,BP],[fx,fy,zW+f.top-0.1],0.084,sts);          // 플로트 암 150A
  }
  for(let i=0;i<3;i++){ const a=fp[i], b=fp[(i+1)%3]; pipe(A,[a[0],a[1],zW+S.floats[i].bottom+0.05],[b[0],b[1],zW+S.floats[(i+1)%3].bottom+0.05],0.012,sts); pipe(A,[a[0],a[1],zW+S.floats[i].top-0.1],[b[0],b[1],zW+S.floats[(i+1)%3].top-0.1],0.012,sts); } // 텐션볼트
  // 핸드레일(베이스 둘레 개략)
  for(let i=0;i<6;i++){ const a0=i/6*Math.PI*2, a1=(i+1)/6*Math.PI*2, r=0.9; pipe(A,[tb.x+r*Math.cos(a0),tb.y+r*Math.sin(a0),BP+1.0],[tb.x+r*Math.cos(a1),tb.y+r*Math.sin(a1),BP+1.0],0.02,sts); pipe(A,[tb.x+r*Math.cos(a0),tb.y+r*Math.sin(a0),BP],[tb.x+r*Math.cos(a0),tb.y+r*Math.sin(a0),BP+1.0],0.02,sts); }
  // 가이드레일 (바닥~상부 고정, 수위와 무관) + 슬라이더
  for(const [i,r] of S.rails.entries()){ pipe(G.tank,[r.x,r.y,0],[r.x,r.y,top],r.d/2,sts); const j=i===0?0:2; const s=add(A,new THREE.CylinderGeometry(0.11,0.11,0.25,20),M(0x2a2a2a),[r.x,r.y,zW+0.2],[Math.PI/2,0,0]); pipe(A,[fp[j][0],fp[j][1],zW+0.35],[r.x,r.y,zW+0.25],0.06,sts); }
  // --- 배출장치 (북쪽 벽 피벗 + 연결관 200A + 유입 헤더) ---
  const D=S.decanter, Dg=G.dec, yW=L-D.pivot_off, pz=D.pivot_z;
  const hz=lev-D.inlet_below, hy=L-D.inlet_off;
  box(Dg,0.5,0.25,0.5,D.x,L-0.12,pz,M(0x8a99a6,{m:.5}));
  pipe(Dg,[D.x,yW,pz],[D.x,hy,hz],D.pipe_d/2,sts);
  pipe(Dg,[D.x-D.header_len/2,hy,hz],[D.x+D.header_len/2,hy,hz],D.pipe_d/2,sts);
  pipe(Dg,[D.x-D.header_len/2,hy+0.05,hz+0.3],[D.x+D.header_len/2,hy+0.05,hz+0.3],D.float_d/2,floatM);
  box(Dg,D.header_len,0.04,0.3,D.x,hy-0.16,hz+0.05,M(0x6b7780));   // 공기차단막
  pipe(Dg,[D.x+D.header_len*0.3,hy,hz],[D.x+0.4,yW,top+0.6],0.06,M(0x55606a));  // 와이어(개략)
  box(Dg,0.5,0.4,0.35,D.x+0.4,L+0.1,top+0.5,yel);                 // 전동윈치
  return G;
}
if(typeof module!=="undefined") module.exports={addSBRGeometry};
