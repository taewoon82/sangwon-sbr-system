import json,base64,numpy as np,matplotlib,re; matplotlib.use("Agg")
import matplotlib.pyplot as plt, matplotlib.font_manager as fm
from scipy.spatial import cKDTree
for f in fm.findSystemFonts():
    if re.search(r'NotoSansCJK',f): fm.fontManager.addfont(f); plt.rcParams['font.family']=fm.FontProperties(fname=f).get_name(); break
def load(c):
    d=json.load(open(f"post{c}.json")); P=json.load(open(f"{c}/case_info.json"))
    g=np.frombuffer(base64.b64decode(d["mag"]["0.2"]),np.uint16).reshape(d["magShape"]).astype(float); m=g==65535; g=g/1000; g[m]=np.nan
    return d["res"],P,g
def rd(c,n):
    s=open(f"{c}/2000/{n}").read(); mm=re.search(r"internalField\s+nonuniform\s+List<\w+>\s*\n?(\d+)\s*\n?\(",s); k=int(mm.group(1)); b=s[mm.end():]
    return np.array(re.findall(r"\(([-\d.eE+]+) ([-\d.eE+]+) ([-\d.eE+]+)\)",b[:k*80+100])[:k],float)
def deco(a,P):
    for (x,y) in P["turbs"]: a.add_patch(plt.Circle((x,y),P["turb_R"],fill=False,ec="k",lw=1.5)); a.annotate("반시계",(x,y+P["turb_R"]+0.4),ha="center",fontsize=9,weight="bold")
    for k,items in P.get("obst",{}).items():
        for o in items:
            if o["p1"][2]-o["p0"][2]>1.0 or k!="floats": a.add_patch(plt.Circle(o["p0"][:2],o["r"],fill=k=="columns",fc="k",ec="k",lw=1,ls="--" if k=="floats" else "-"))
fig,ax=plt.subplots(3,1,figsize=(13,19.5))
for a,c,t in [(ax[0],"pp_n40","① 구조물 없음"),(ax[1],"pp_n40s","② 플로트·가이드레일·기둥 반영")]:
    r,P,g=load(c); W,L=P["W"],P["L"]
    im=a.imshow(g,extent=[0,W,0,L],cmap="RdYlBu",vmin=0,vmax=0.6)
    a.contour(np.linspace(0,W,g.shape[1]),np.linspace(L,0,g.shape[0]),np.nan_to_num(g,nan=1),levels=[0.15],colors="k",linewidths=0.8)
    for s in r["spots"][:6]: a.annotate(f"{s['area']:.1f}㎡",(s["x"],s["y"]),fontsize=10,ha="center",weight="bold")
    deco(a,P); a.set_title(f"{t} — 바닥 위 0.2 m 수평유속 · 0.15 m/s 미만 {r['floor0.2_lt_0.15']*100:.1f}% · 평균 {r['floor0.2_mean']:.2f} m/s",fontsize=13)
    plt.colorbar(im,ax=a,fraction=0.025,label="m/s")
C=rd("pp_n40s","C"); U=rd("pp_n40s","U"); tr=cKDTree(C); r,P,g=load("pp_n40s")
xs=np.arange(0.6,W,1.0); ys=np.arange(0.6,L,1.0); X,Y=np.meshgrid(xs,ys); q=np.c_[X.ravel(),Y.ravel(),np.full(X.size,2.2)]
dd,ii=tr.query(q,k=6); w=1/np.maximum(dd,1e-3)**2; w/=w.sum(1,keepdims=True); u=np.einsum("nk,nkj->nj",w,U[ii]); sp=np.hypot(u[:,0],u[:,1])
ax[2].quiver(X,Y,u[:,0].reshape(X.shape),u[:,1].reshape(X.shape),sp.reshape(X.shape),cmap="viridis",scale=9,width=0.0022); deco(ax[2],P)
ax[2].set_title("② 수심 중간(바닥 위 2.2 m) 수평 흐름 방향",fontsize=13)
for a in ax: a.set_xlim(0,W); a.set_ylim(0,L); a.set_aspect("equal"); a.set_xlabel("길이 방향 (m)"); a.set_ylabel("폭 방향 (m)")
plt.tight_layout(); plt.savefig("panpo_compare.png",dpi=105); print("ok")
