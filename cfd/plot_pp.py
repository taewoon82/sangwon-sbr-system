import json,base64,numpy as np,matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt, matplotlib.font_manager as fm, sys, re, os
from scipy.spatial import cKDTree
for f in fm.findSystemFonts():
    if re.search(r'NotoSansCJK|NanumGothic|NotoSansKR',f): fm.fontManager.addfont(f); plt.rcParams['font.family']=fm.FontProperties(fname=f).get_name(); break
d=json.load(open("postpp_n40.json")); r=d["res"]; P=json.load(open("pp_n40/case_info.json"))
W,L,H=P["W"],P["L"],P["H"]; sh=d["magShape"]
g=np.frombuffer(base64.b64decode(d["mag"]["0.2"]),np.uint16).reshape(sh).astype(float)
m=g==65535; g=g/1000; g[m]=np.nan
def rd(n,vec):
    s=open(f"pp_n40/2000/{n}").read(); mm=re.search(r"internalField\s+nonuniform\s+List<\w+>\s*\n?(\d+)\s*\n?\(",s); k=int(mm.group(1)); b=s[mm.end():]
    return np.array(re.findall(r"\(([-\d.eE+]+) ([-\d.eE+]+) ([-\d.eE+]+)\)",b[:k*80+100])[:k],float) if vec else None
C=rd("C",1); U=rd("U",1); tr=cKDTree(C)
fig,ax=plt.subplots(2,1,figsize=(13,13.5))
cm=plt.get_cmap("RdYlBu")
im=ax[0].imshow(g,extent=[0,W,0,L],cmap=cm,vmin=0,vmax=0.6)
ax[0].contour(np.linspace(0,W,g.shape[1]),np.linspace(L,0,g.shape[0]),np.nan_to_num(g,nan=1),levels=[0.15],colors="k",linewidths=0.8)
for k,s in enumerate(r["spots"][:6]): ax[0].annotate(f"{s['area']:.1f}㎡",(s["x"],s["y"]),fontsize=10,ha="center",color="k",weight="bold")
for (x,y) in P["turbs"]:
    for a in ax: a.add_patch(plt.Circle((x,y),P["turb_R"],fill=False,ec="k",lw=1.5)); a.annotate("반시계",(x,y+P["turb_R"]+0.5),ha="center",fontsize=10,weight="bold")
ax[0].set_title(f"바닥 위 0.2 m 수평유속 (검은 선 = 0.15 m/s) — 0.15 m/s 미만 {r['floor0.2_lt_0.15']*100:.1f}%, 평균 {r['floor0.2_mean']:.2f} m/s",fontsize=13)
plt.colorbar(im,ax=ax[0],fraction=0.025,label="m/s")
for k,(z,lab) in enumerate([(2.2,"수심 중간 (바닥 위 2.2 m)")]):
    xs=np.arange(0.6,W,1.0); ys=np.arange(0.6,L,1.0); X,Y=np.meshgrid(xs,ys); q=np.c_[X.ravel(),Y.ravel(),np.full(X.size,z)]
    dd,ii=tr.query(q,k=6); w=1/np.maximum(dd,1e-3)**2; w/=w.sum(1,keepdims=True); u=np.einsum("nk,nkj->nj",w,U[ii])
    sp=np.hypot(u[:,0],u[:,1]).reshape(X.shape)
    ax[1].quiver(X,Y,u[:,0].reshape(X.shape),u[:,1].reshape(X.shape),sp,cmap="viridis",scale=9,width=0.0022)
    ax[1].set_title(f"{lab} 수평 흐름 방향",fontsize=13)
for a in ax: a.set_xlim(0,W); a.set_ylim(0,L); a.set_aspect("equal"); a.set_xlabel("길이 방향 (m)"); a.set_ylabel("폭 방향 (m)")
plt.tight_layout(); plt.savefig("panpo_floor.png",dpi=110); print("ok")
