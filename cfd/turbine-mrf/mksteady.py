"""반응조 정상상태 단상 해석 (터빈 = 자유수면 해석값으로 맞춘 경계조건).
사용: python3 mksteady.py CASE TANKSTL BC.json
- 터빈 자리 원통(r=RC, z=ZB~수면)을 비우고
  · 바닥 원판(plug_bottom)        : 흡입 (자유수면 해석 흡입유량, 반경별 분포)
  · 옆면 하부(plug_low)           : 흡입 (토출량 - 바닥 흡입량, 벨 외측 상승류 대응)
  · 옆면 상부 띠(plug_high, 두께 h): 토출 (자유수면 해석의 물 토출량·반경 운동량·각운동량을 그대로 맞춤)
- 수면(z=ZW)은 평평한 미끄럼면. 헌치·십자구조물은 TANKSTL(단일 솔리드).
경계값은 메시 생성 후 setbc.py로 면별 값을 써 넣음(계단형 면이라 유량을 면적분으로 재보정)."""
import sys, os, json, shutil, numpy as np
case, tank, bcf = sys.argv[1], sys.argv[2], sys.argv[3]
bc = json.load(open(bcf))
CX = CY = 5.25; W = 10.5; ZW = bc["ZW"]; ZB = bc["ZB"]; RC = bc["RC"]; ZH = bc["ZH"]
os.makedirs(f"{case}/constant/triSurface", exist_ok=True); os.makedirs(f"{case}/system", exist_ok=True)
os.makedirs(f"{case}/0", exist_ok=True)
shutil.copy(tank, f"{case}/constant/triSurface/tank.stl"); shutil.copy(bcf, f"{case}/bc.json")

# 원통 플러그 STL (영역 4개)
def cyl_stl(path):
    n = 96; th = np.linspace(0, 2 * np.pi, n + 1)
    zt = ZW + 0.2
    def ring(z): return [np.array([CX + RC * np.cos(t), CY + RC * np.sin(t), z]) for t in th]
    c0, c1 = np.array([CX, CY, ZB]), np.array([CX, CY, zt])
    rb, rh, rt = ring(ZB), ring(ZH), ring(zt)
    out = []
    def solid(name, tris):
        s = [f"solid {name}"]
        for a, b, c in tris:
            nn = np.cross(b - a, c - a); nn /= np.linalg.norm(nn)
            s.append(f" facet normal {nn[0]} {nn[1]} {nn[2]}\n  outer loop")
            s += [f"   vertex {p[0]} {p[1]} {p[2]}" for p in (a, b, c)]
            s.append("  endloop\n endfacet")
        s.append(f"endsolid {name}"); out.append("\n".join(s))
    solid("bottom", [(c0, rb[i + 1], rb[i]) for i in range(n)])
    solid("low", [t for i in range(n) for t in ((rb[i], rb[i + 1], rh[i + 1]), (rb[i], rh[i + 1], rh[i]))])
    solid("high", [t for i in range(n) for t in ((rh[i], rh[i + 1], rt[i + 1]), (rh[i], rt[i + 1], rt[i]))])
    solid("top", [(c1, rt[i], rt[i + 1]) for i in range(n)])
    open(path, "w").write("\n".join(out) + "\n")
cyl_stl(f"{case}/constant/triSurface/plug.stl")

H = "FoamFile { version 2.0; format ascii; class %s; object %s; }\n"
def w(path, cls, obj, body): open(f"{case}/{path}", "w").write(H % (cls, obj) + body)
nz = int(round(ZW / 0.15))
w("system/blockMeshDict", "dictionary", "blockMeshDict", f"""
convertToMeters 1;
vertices ((0 0 0)({W} 0 0)({W} {W} 0)(0 {W} 0)(0 0 {ZW})({W} 0 {ZW})({W} {W} {ZW})(0 {W} {ZW}));
blocks (hex (0 1 2 3 4 5 6 7) (70 70 {nz}) simpleGrading (1 1 1));
boundary (
 walls {{ type wall; faces ((0 3 2 1)(0 1 5 4)(1 2 6 5)(2 3 7 6)(3 0 4 7)); }}
 surface {{ type patch; faces ((4 5 6 7)); }}
);
""")
w("system/snappyHexMeshDict", "dictionary", "snappyHexMeshDict", f"""
castellatedMesh true; snap false; addLayers false;
geometry {{
 tank.stl {{ type triSurfaceMesh; name tank; }}
 plug.stl {{ type triSurfaceMesh; name plug; }}
 near {{ type searchableCylinder; point1 ({CX} {CY} {ZB-0.4}); point2 ({CX} {CY} {ZW+0.1}); radius {RC+0.6}; }}
 floor {{ type searchableBox; min (-1 -1 -1); max (11.5 11.5 0.45); }}
}}
castellatedMeshControls {{
 maxLocalCells 3000000; maxGlobalCells 6000000; minRefinementCells 10; maxLoadUnbalance 0.1;
 nCellsBetweenLevels 2; resolveFeatureAngle 30; allowFreeStandingZoneFaces true; features ();
 refinementSurfaces {{
  tank {{ level (2 2); patchInfo {{ type wall; }} }}
  plug {{ level (3 3); patchInfo {{ type patch; }} }}
 }}
 refinementRegions {{
  near {{ mode inside; levels ((1e5 2)); }}
  floor {{ mode inside; levels ((1e5 1)); }}
 }}
 locationInMesh (2.0 2.0 2.0);
}}
snapControls {{ nSmoothPatch 3; tolerance 2.0; nSolveIter 30; nRelaxIter 5; }}
addLayersControls {{ relativeSizes true; layers {{}}; expansionRatio 1.2; finalLayerThickness 0.3; minThickness 0.1; nGrow 0; featureAngle 60; nRelaxIter 3; nSmoothSurfaceNormals 1; nSmoothNormals 3; nSmoothThickness 10; maxFaceThicknessRatio 0.5; maxThicknessToMedialRatio 0.3; minMedialAxisAngle 90; nBufferCellsNoExtrude 0; nLayerIter 50; }}
meshQualityControls {{ maxNonOrtho 65; maxBoundarySkewness 20; maxInternalSkewness 4; maxConcave 80; minVol 1e-13; minTetQuality 1e-15; minArea -1; minTwist 0.02; minDeterminant 0.001; minFaceWeight 0.05; minVolRatio 0.01; minTriangleTwist -1; nSmoothScale 4; errorReduction 0.75; }}
mergeTolerance 1e-6;
""")
w("constant/transportProperties", "dictionary", "transportProperties", "transportModel Newtonian; nu 1e-06;\n")
w("constant/turbulenceProperties", "dictionary", "turbulenceProperties", "simulationType RAS; RAS { RASModel kOmegaSST; turbulence on; printCoeffs off; }\n")
w("system/controlDict", "dictionary", "controlDict", """
application simpleFoam; startFrom latestTime; startTime 0; stopAt endTime; endTime 3000; deltaT 1;
writeControl timeStep; writeInterval 100; purgeWrite 0; writeFormat ascii; writePrecision 7; writeCompression off;
timeFormat general; timePrecision 6; runTimeModifiable true; functions {}
""")
w("system/fvSchemes", "dictionary", "fvSchemes", """
ddtSchemes { default steadyState; }
gradSchemes { default Gauss linear; grad(U) cellLimited Gauss linear 1; }
divSchemes { default none; div(phi,U) bounded Gauss linearUpwind grad(U); div(phi,k) bounded Gauss upwind; div(phi,omega) bounded Gauss upwind; div((nuEff*dev2(T(grad(U))))) Gauss linear; }
laplacianSchemes { default Gauss linear limited 0.5; }
interpolationSchemes { default linear; }
snGradSchemes { default limited 0.5; }
wallDist { method meshWave; }
""")
w("system/fvSolution", "dictionary", "fvSolution", """
solvers {
 p { solver GAMG; smoother GaussSeidel; tolerance 1e-6; relTol 0.05; }
 "(U|k|omega)" { solver smoothSolver; smoother symGaussSeidel; tolerance 1e-6; relTol 0.1; }
}
SIMPLE { nNonOrthogonalCorrectors 1; consistent yes; pRefCell 0; pRefValue 0; }
relaxationFactors { equations { U 0.7; ".*" 0.7; } fields { p 0.3; } }
""")
w("system/decomposeParDict", "dictionary", "decomposeParDict", "numberOfSubdomains 2; method simple; coeffs { n (2 1 1); }\n")
print("case", case, "ZW", ZW, "ZB", ZB, "RC", RC, "ZH", ZH)
