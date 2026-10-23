#!/usr/bin/env python3
"""SBR 반응조 표면포기기 유동해석 케이스 생성 (OpenFOAM v1912, simpleFoam + realizable k-ε)
입력: params.json  /  출력: 케이스 폴더
좌표: 반응조 내부 모서리 원점, x=가로 W, y=세로 L, z=바닥(0)~HWL 수심(H), 단위 m
터빈 모델(월정과 동일 개념): 터빈 몸체를 원통 장애물로 두고, 하부 중앙 원판 = 흡입, 수면 아래 띠(band) = 반경·접선 토출
"""
import json, math, os, sys, shutil
import numpy as np

P = json.load(open(sys.argv[1])); CASE = sys.argv[2]
W, L, H = P["W"], P["L"], P["H"]
xc, yc = P["turb_x"], P["turb_y"]
Rb, depth, band = P["turb_R"], P["turb_depth"], P["band"]
Rs = P["suction_R"]
hn = P["haunch"]
cw, ch, ct = P["cross_w"], P["cross_h"], P["cross_t"]
Q, Vt_target = P["Q"], P["Vt"]
cell = P.get("cell", 0.12); lvl = P.get("refine", 1)
os.makedirs(CASE, exist_ok=True)
for d in ["0", "constant/triSurface", "system"]:
    os.makedirs(os.path.join(CASE, d), exist_ok=True)

# ---------------- STL ----------------
def stl(name, tris):
    with open(os.path.join(CASE, "constant/triSurface", name + ".stl"), "w") as f:
        f.write(f"solid {name}\n")
        for a, b, c in tris:
            n = np.cross(np.subtract(b, a), np.subtract(c, a)); nn = np.linalg.norm(n); n = n / nn if nn > 0 else n
            f.write(f" facet normal {n[0]:.6e} {n[1]:.6e} {n[2]:.6e}\n  outer loop\n")
            for v in (a, b, c): f.write(f"   vertex {v[0]:.6f} {v[1]:.6f} {v[2]:.6f}\n")
            f.write("  endloop\n endfacet\n")
        f.write(f"endsolid {name}\n")

def box(x0, x1, y0, y1, z0, z1):
    v = [(x0,y0,z0),(x1,y0,z0),(x1,y1,z0),(x0,y1,z0),(x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1)]
    q = [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
    t = []
    for a,b,c,d in q: t += [(v[a],v[b],v[c]),(v[a],v[c],v[d])]
    return t

def prism(p0, p1, p2, axis_vec):
    """삼각형 단면(p0,p1,p2) 을 axis_vec 만큼 압출"""
    a = [np.array(p) for p in (p0,p1,p2)]; b = [p + np.array(axis_vec) for p in a]
    t = [(a[0],a[2],a[1]), (b[0],b[1],b[2])]
    for i in range(3):
        j = (i+1)%3; t += [(a[i],a[j],b[j]), (a[i],b[j],b[i])]
    return t

E = 0.3  # 헌치·십자구조물을 벽·바닥 밖으로 조금 연장 (snappy 교차 안정)
haunch = []
if hn > 0:
    haunch += prism((-E,-E,-E),(hn,-E,-E),(-E,-E,hn), (0, L+2*E, 0))          # x=0 벽
    haunch += prism((W+E,-E,-E),(W+E,-E,hn),(W-hn,-E,-E), (0, L+2*E, 0))     # x=W 벽
    haunch += prism((-E,-E,-E),(-E,-E,hn),(-E,hn,-E), (W+2*E, 0, 0))         # y=0 벽
    haunch += prism((-E,L+E,-E),(-E,L-hn,-E),(-E,L+E,hn), (W+2*E, 0, 0))     # y=L 벽
cross = box(xc-cw/2, xc+cw/2, yc-ct/2, yc+ct/2, -E, ch) + box(xc-ct/2, xc+ct/2, yc-cw/2, yc+cw/2, -E, ch)
stl("haunch", haunch); stl("cross", cross)

# 터빈 원통: 하부 원판(흡입 원 + 링), 옆면(하단 벽 + 상단 토출 띠), 상부 원판은 수면 위
N = 72; zb = H - depth; zt = H + 0.25; zband = H - band
ang = [2*math.pi*i/N for i in range(N)]
ring = lambda r, z: [(xc + r*math.cos(a), yc + r*math.sin(a), z) for a in ang]
bot_s, bot_r, side_w, side_b, top = [], [], [], [], []
cs, cr, cb_lo, cb_hi, ctop = ring(Rs, zb), ring(Rb, zb), ring(Rb, zb), ring(Rb, zband), ring(Rb, zt)
c0 = (xc, yc, zb)
for i in range(N):
    j = (i+1) % N
    bot_s.append((c0, cs[j], cs[i]))
    bot_r += [(cs[i], cs[j], cr[j]), (cs[i], cr[j], cr[i])]
    side_w += [(cb_lo[i], cb_lo[j], cb_hi[j]), (cb_lo[i], cb_hi[j], cb_hi[i])]
    side_b += [(cb_hi[i], cb_hi[j], ctop[j]), (cb_hi[i], ctop[j], ctop[i])]
    top.append(((xc, yc, zt), ctop[i], ctop[j]))
# 바닥면 법선이 아래(유체 쪽)를 보도록 정렬
bot_s = [(a, c, b) for a, b, c in bot_s]; bot_r = [(a, c, b) for a, b, c in bot_r]
stl("turb_suction", bot_s); stl("turb_wall", bot_r + side_w + top); stl("turb_band", side_b)

# ---------------- 사전(dictionary) ----------------
HDR = lambda cls, obj, loc="": f"""FoamFile
{{
    version 2.0; format ascii; class {cls};{(' location "'+loc+'";') if loc else ''} object {obj};
}}
"""
def w(path, cls, obj, body, loc=""):
    with open(os.path.join(CASE, path), "w") as f: f.write(HDR(cls, obj, loc) + body)

nx, ny, nz = math.ceil(W/cell), math.ceil(L/cell), math.ceil(H/cell)
w("system/blockMeshDict", "dictionary", "blockMeshDict", f"""
convertToMeters 1;
vertices ( (0 0 0) ({W} 0 0) ({W} {L} 0) (0 {L} 0) (0 0 {H}) ({W} 0 {H}) ({W} {L} {H}) (0 {L} {H}) );
blocks ( hex (0 1 2 3 4 5 6 7) ({nx} {ny} {nz}) simpleGrading (1 1 1) );
boundary (
  walls  {{ type wall;  faces ( (0 4 7 3) (1 2 6 5) (0 1 5 4) (3 7 6 2) ); }}
  floor  {{ type wall;  faces ( (0 3 2 1) ); }}
  surface {{ type patch; faces ( (4 5 6 7) ); }}
);
""")
w("system/surfaceFeatureExtractDict", "dictionary", "surfaceFeatureExtractDict", "".join(f"""
{n}.stl {{ extractionMethod extractFromSurface; extractFromSurfaceCoeffs {{ includedAngle 150; }} writeObj no; }}
""" for n in ["haunch","cross","turb_suction","turb_wall","turb_band"]))
inX, inY = W*0.27, L*0.31
w("system/snappyHexMeshDict", "dictionary", "snappyHexMeshDict", f"""
castellatedMesh true; snap true; addLayers false;
geometry {{
  haunch.stl {{ type triSurfaceMesh; name haunch; }}
  cross.stl  {{ type triSurfaceMesh; name cross; }}
  turb_suction.stl {{ type triSurfaceMesh; name turb_suction; }}
  turb_wall.stl {{ type triSurfaceMesh; name turb_wall; }}
  turb_band.stl {{ type triSurfaceMesh; name turb_band; }}
  turbZone {{ type searchableCylinder; point1 ({xc} {yc} {zb-0.6}); point2 ({xc} {yc} {H}); radius {Rb+0.6}; }}
  crossZone {{ type searchableBox; min ({xc-cw/2-0.3} {yc-cw/2-0.3} 0); max ({xc+cw/2+0.3} {yc+cw/2+0.3} {ch+0.3}); }}
}};
castellatedMeshControls {{
  maxLocalCells 2000000; maxGlobalCells 4000000; minRefinementCells 0; nCellsBetweenLevels 2; maxLoadUnbalance 0.1;
  features (
    {{ file "haunch.eMesh"; level 0; }} {{ file "cross.eMesh"; level {lvl}; }}
    {{ file "turb_suction.eMesh"; level {lvl+1}; }} {{ file "turb_wall.eMesh"; level {lvl+1}; }} {{ file "turb_band.eMesh"; level {lvl+1}; }}
  );
  refinementSurfaces {{
    haunch {{ level (0 1); patchInfo {{ type wall; }} }}
    cross  {{ level ({lvl} {lvl}); patchInfo {{ type wall; }} }}
    turb_suction {{ level ({lvl+1} {lvl+1}); patchInfo {{ type patch; }} }}
    turb_wall {{ level ({lvl+1} {lvl+1}); patchInfo {{ type wall; }} }}
    turb_band {{ level ({lvl+1} {lvl+1}); patchInfo {{ type patch; }} }}
  }};
  resolveFeatureAngle 30;
  refinementRegions {{ turbZone {{ mode inside; levels ((1E15 {lvl})); }} crossZone {{ mode inside; levels ((1E15 {lvl})); }} }};
  locationInMesh ({inX} {inY} {H*0.37});
  allowFreeStandingZoneFaces true;
}};
snapControls {{ nSmoothPatch 3; tolerance 2.0; nSolveIter 50; nRelaxIter 5; nFeatureSnapIter 10; implicitFeatureSnap false; explicitFeatureSnap true; multiRegionFeatureSnap false; }};
addLayersControls {{ relativeSizes true; layers {{}}; expansionRatio 1.0; finalLayerThickness 0.3; minThickness 0.1; nGrow 0; featureAngle 60; nRelaxIter 3; nSmoothSurfaceNormals 1; nSmoothNormals 3; nSmoothThickness 10; maxFaceThicknessRatio 0.5; maxThicknessToMedialRatio 0.3; minMedialAxisAngle 90; nBufferCellsNoExtrude 0; nLayerIter 50; }};
meshQualityControls {{ maxNonOrtho 65; maxBoundarySkewness 20; maxInternalSkewness 4; maxConcave 80; minVol 1e-13; minTetQuality 1e-15; minArea -1; minTwist 0.02; minDeterminant 0.001; minFaceWeight 0.05; minVolRatio 0.01; minTriangleTwist -1; nSmoothScale 4; errorReduction 0.75; relaxed {{ maxNonOrtho 75; }} }};
mergeTolerance 1e-6;
""")
iters = P.get("iters", 2000)
w("system/controlDict", "dictionary", "controlDict", f"""
application simpleFoam; startFrom latestTime; startTime 0; stopAt endTime; endTime {iters}; deltaT 1;
writeControl timeStep; writeInterval {iters}; purgeWrite 1; writeFormat ascii; writePrecision 7; writeCompression off;
timeFormat general; timePrecision 6; runTimeModifiable true;
""")
w("system/fvSchemes", "dictionary", "fvSchemes", """
ddtSchemes { default steadyState; }
gradSchemes { default Gauss linear; grad(U) cellLimited Gauss linear 1; }
divSchemes { default none; div(phi,U) bounded Gauss linearUpwind grad(U); div(phi,k) bounded Gauss upwind; div(phi,epsilon) bounded Gauss upwind;
             div((nuEff*dev2(T(grad(U))))) Gauss linear; }
laplacianSchemes { default Gauss linear limited 0.5; }
interpolationSchemes { default linear; }
snGradSchemes { default limited 0.5; }
wallDist { method meshWave; }
""")
w("system/fvSolution", "dictionary", "fvSolution", """
solvers {
  p { solver GAMG; smoother GaussSeidel; tolerance 1e-7; relTol 0.05; }
  "(U|k|epsilon)" { solver smoothSolver; smoother symGaussSeidel; tolerance 1e-7; relTol 0.1; }
}
SIMPLE { nNonOrthogonalCorrectors 1; consistent yes; residualControl { p 1e-4; U 1e-5; "(k|epsilon)" 1e-5; } }
relaxationFactors { equations { U 0.7; ".*" 0.6; } fields { p 0.5; } }
""")
w("system/decomposeParDict", "dictionary", "decomposeParDict", "numberOfSubdomains 2; method simple; coeffs { n (2 1 1); }\n")
w("constant/transportProperties", "dictionary", "transportProperties", "transportModel Newtonian; nu 1.3e-06;\n")
w("constant/turbulenceProperties", "dictionary", "turbulenceProperties", "simulationType RAS; RAS { RASModel realizableKE; turbulence on; printCoeffs on; }\n")

# 토출 띠: 반경 Vr (Q 일치), 접선 Vt (토크 일치) — cylindricalInletVelocity 의 rpm 으로 접선속도 부여
A_band = 2*math.pi*Rb*band
Vr = Q / A_band
rpm_eq = Vt_target / Rb * 60 / (2*math.pi) * (1 if P.get("ccw", True) else -1)
k_in = 1.5*(0.1*math.hypot(Vr, Vt_target))**2
eps_in = 0.09**0.75 * k_in**1.5 / (0.07*band)
walls = "walls|floor|haunch|cross|turb_wall"
w("0/U", "volVectorField", "U", f"""
dimensions [0 1 -1 0 0 0 0]; internalField uniform (0 0 0);
boundaryField {{
  "({walls})" {{ type noSlip; }}
  surface {{ type slip; }}
  turb_band {{ type cylindricalInletVelocity; origin ({xc} {yc} 0); axis (0 0 1); axialVelocity constant 0; radialVelocity constant {Vr:.6f}; rpm constant {rpm_eq:.6f}; value uniform (0 0 0); }}
  turb_suction {{ type pressureInletOutletVelocity; value uniform (0 0 0); }}
}}
""")
w("0/p", "volScalarField", "p", f"""
dimensions [0 2 -2 0 0 0 0]; internalField uniform 0;
boundaryField {{ "({walls}|turb_band)" {{ type zeroGradient; }} surface {{ type zeroGradient; }} turb_suction {{ type fixedValue; value uniform 0; }} }}
""")
w("0/k", "volScalarField", "k", f"""
dimensions [0 2 -2 0 0 0 0]; internalField uniform {k_in*0.1:.6e};
boundaryField {{ "({walls})" {{ type kqRWallFunction; value $internalField; }} surface {{ type zeroGradient; }}
  turb_band {{ type fixedValue; value uniform {k_in:.6e}; }} turb_suction {{ type inletOutlet; inletValue $internalField; value $internalField; }} }}
""")
w("0/epsilon", "volScalarField", "epsilon", f"""
dimensions [0 2 -3 0 0 0 0]; internalField uniform {eps_in*0.01:.6e};
boundaryField {{ "({walls})" {{ type epsilonWallFunction; value $internalField; }} surface {{ type zeroGradient; }}
  turb_band {{ type fixedValue; value uniform {eps_in:.6e}; }} turb_suction {{ type inletOutlet; inletValue $internalField; value $internalField; }} }}
""")
w("0/nut", "volScalarField", "nut", f"""
dimensions [0 2 -1 0 0 0 0]; internalField uniform 0;
boundaryField {{ "({walls})" {{ type nutkWallFunction; value uniform 0; }} surface {{ type calculated; value uniform 0; }}
  turb_band {{ type calculated; value uniform 0; }} turb_suction {{ type calculated; value uniform 0; }} }}
""")
json.dump({**P, "Vr": Vr, "rpm_eq": rpm_eq, "A_band": A_band, "nxyz": [nx, ny, nz]}, open(os.path.join(CASE, "case_info.json"), "w"), ensure_ascii=False, indent=1)
print(f"case {CASE}: Vr={Vr:.3f} m/s, Vt={Vt_target:.3f} m/s (rpm_eq {rpm_eq:.2f}), Q={Q:.3f} m3/s, background {nx}x{ny}x{nz}")
