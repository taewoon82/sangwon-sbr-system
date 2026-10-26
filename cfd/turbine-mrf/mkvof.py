"""자유수면(VOF) + MRF 케이스. 사용: python3 mkvof.py CASE GEOMDIR RPM LEVEL ENDTIME
LEVEL: 카탈로그 침수깊이 기준  +1 = 날개 상단(z=3.50), 0 = 플랜지 상면(3.42), -1 = 플랜지 아래 80 mm(3.34)
공기층은 수면 위 1.2 m (카탈로그 비산높이 1.05 m)."""
import sys, os, shutil, glob
case, gdir, rpm, lev, tend = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5])
omega = rpm * 2 * 3.141592653589793 / 60
ZW = 3.42 + 0.08 * lev           # 정지 수위
ZT = 4.70                        # 해석영역 상단(대기)
os.makedirs(f"{case}/constant/triSurface", exist_ok=True)
os.makedirs(f"{case}/system", exist_ok=True); os.makedirs(f"{case}/0.orig", exist_ok=True)
for f in glob.glob(f"{gdir}/*.stl"):
    shutil.copy(f, f"{case}/constant/triSurface/")
names = sorted(os.path.basename(f)[:-4] for f in glob.glob(f"{gdir}/*.stl"))
imp = [n for n in names if n.startswith(("blade", "cover", "body"))]
fixed = ["walls", "haunch", "cross"] + [n for n in names if n == "stator"]
H = "FoamFile { version 2.0; format ascii; class %s; object %s; }\n"
def w(path, cls, obj, body):
    open(f"{case}/{path}", "w").write(H % (cls, obj) + body)

w("system/blockMeshDict", "dictionary", "blockMeshDict", f"""
convertToMeters 1;
vertices ((0 0 0)(10.5 0 0)(10.5 10.5 0)(0 10.5 0)(0 0 {ZT})(10.5 0 {ZT})(10.5 10.5 {ZT})(0 10.5 {ZT}));
blocks (hex (0 1 2 3 4 5 6 7) (70 70 32) simpleGrading (1 1 1));
boundary (
 walls {{ type wall; faces ((0 3 2 1)(0 1 5 4)(1 2 6 5)(2 3 7 6)(3 0 4 7)); }}
 atmosphere {{ type patch; faces ((4 5 6 7)); }}
);
""")
geo = "\n".join(f" {n} {{ type triSurfaceMesh; file \"{n}.stl\"; }}" for n in names)
lvl = {"haunch": "(1 1)", "cross": "(2 2)", "stator": "(4 4)"}
ref = "\n".join(f"  {n} {{ level {lvl.get(n, '(4 4)')}; patchInfo {{ type wall; }} }}" for n in names)
dist = "\n".join(f"  {n} {{ mode distance; levels ((0.012 4) (0.05 3)); }}" for n in imp)
w("system/snappyHexMeshDict", "dictionary", "snappyHexMeshDict", f"""
castellatedMesh true; snap true; addLayers false;
geometry {{
{geo}
 mrf {{ type searchableCylinder; point1 (5.25 5.25 3.05); point2 (5.25 5.25 3.62); radius 0.72; }}
 spray {{ type searchableCylinder; point1 (5.25 5.25 3.0); point2 (5.25 5.25 4.2); radius 2.2; }}
 fs {{ type searchableBox; min (-1 -1 {ZW-0.15}); max (11.5 11.5 {ZW+0.15}); }}
}}
castellatedMeshControls {{
 maxLocalCells 3000000; maxGlobalCells 6000000; minRefinementCells 10; maxLoadUnbalance 0.1;
 nCellsBetweenLevels 2; resolveFeatureAngle 30; allowFreeStandingZoneFaces true;
 features ();
 refinementSurfaces {{
{ref}
 }}
 refinementRegions {{
  mrf {{ mode inside; levels ((1e5 2)); }}
  spray {{ mode inside; levels ((1e5 1)); }}
  fs {{ mode inside; levels ((1e5 1)); }}
{dist}
 }}
 locationInMesh (2.0 2.0 2.0);
}}
snapControls {{ nSmoothPatch 3; tolerance 2.0; nSolveIter 50; nRelaxIter 5; nFeatureSnapIter 0; implicitFeatureSnap false; explicitFeatureSnap false; }}
addLayersControls {{ relativeSizes true; layers {{}}; expansionRatio 1.2; finalLayerThickness 0.3; minThickness 0.1; nGrow 0; featureAngle 60; nRelaxIter 3; nSmoothSurfaceNormals 1; nSmoothNormals 3; nSmoothThickness 10; maxFaceThicknessRatio 0.5; maxThicknessToMedialRatio 0.3; minMedialAxisAngle 90; nBufferCellsNoExtrude 0; nLayerIter 50; }}
meshQualityControls {{ maxNonOrtho 65; maxBoundarySkewness 20; maxInternalSkewness 4; maxConcave 80; minVol 1e-13; minTetQuality 1e-15; minArea -1; minTwist 0.02; minDeterminant 0.001; minFaceWeight 0.05; minVolRatio 0.01; minTriangleTwist -1; nSmoothScale 4; errorReduction 0.75; relaxed {{ maxNonOrtho 75; }} }}
mergeTolerance 1e-6;
""")
w("system/topoSetDict", "dictionary", "topoSetDict", """
actions (
 { name rotor; type cellSet; action new; source cylinderToCell; p1 (5.25 5.25 3.05); p2 (5.25 5.25 3.62); radius 0.72; }
 { name rotor; type cellZoneSet; action new; source setToCellZone; set rotor; }
);
""")
w("system/setFieldsDict", "dictionary", "setFieldsDict", f"""
defaultFieldValues ( volScalarFieldValue alpha.water 0 );
regions ( boxToCell {{ box (-1 -1 -1) (11.5 11.5 {ZW}); fieldValues ( volScalarFieldValue alpha.water 1 ); }} );
""")
nonrot = "(" + " ".join(fixed + ["atmosphere"]) + ")"
w("constant/MRFProperties", "dictionary", "MRFProperties", f"""
rotor {{ cellZone rotor; active yes; nonRotatingPatches {nonrot}; origin (5.25 5.25 0); axis (0 0 1); omega {omega:.5f}; }}
""")
w("constant/transportProperties", "dictionary", "transportProperties", """
phases (water air);
water { transportModel Newtonian; nu 1e-06; rho 1000; }
air { transportModel Newtonian; nu 1.48e-05; rho 1.2; }
sigma 0.07;
""")
w("constant/g", "uniformDimensionedVectorField", "g", "dimensions [0 1 -2 0 0 0 0]; value (0 0 -9.81);\n")
w("constant/turbulenceProperties", "dictionary", "turbulenceProperties", "simulationType RAS; RAS { RASModel kOmegaSST; turbulence on; printCoeffs off; }\n")
w("system/controlDict", "dictionary", "controlDict", f"""
application interFoam; startFrom latestTime; startTime 0; stopAt endTime; endTime {tend};
deltaT 0.0005; writeControl adjustableRunTime; writeInterval 0.5; purgeWrite 0;
writeFormat ascii; writePrecision 7; writeCompression off; timeFormat general; timePrecision 6;
runTimeModifiable true; adjustTimeStep yes; maxCo 1.5; maxAlphaCo 1.0; maxDeltaT 0.01;
functions {{}}
""")
w("system/fvSchemes", "dictionary", "fvSchemes", """
ddtSchemes { default Euler; }
gradSchemes { default Gauss linear; grad(U) cellLimited Gauss linear 1; }
divSchemes {
 div(rhoPhi,U) Gauss linearUpwind grad(U);
 div(phi,alpha) Gauss vanLeer; div(phirb,alpha) Gauss linear;
 div(phi,k) Gauss upwind; div(phi,omega) Gauss upwind;
 div(((rho*nuEff)*dev2(T(grad(U))))) Gauss linear;
}
laplacianSchemes { default Gauss linear limited 0.5; }
interpolationSchemes { default linear; }
snGradSchemes { default limited 0.5; }
wallDist { method meshWave; }
""")
w("system/fvSolution", "dictionary", "fvSolution", """
solvers {
 "alpha.water.*" { nAlphaCorr 2; nAlphaSubCycles 1; cAlpha 1; MULESCorr yes; nLimiterIter 3; solver smoothSolver; smoother symGaussSeidel; tolerance 1e-8; relTol 0; }
 "pcorr.*" { solver PCG; preconditioner DIC; tolerance 1e-5; relTol 0; }
 p_rgh { solver GAMG; smoother DIC; tolerance 1e-6; relTol 0.05; }
 p_rghFinal { $p_rgh; relTol 0; tolerance 1e-6; }
 "(U|k|omega).*" { solver smoothSolver; smoother symGaussSeidel; tolerance 1e-6; relTol 0; }
}
PIMPLE { momentumPredictor no; nOuterCorrectors 1; nCorrectors 2; nNonOrthogonalCorrectors 1; }
relaxationFactors { equations { ".*" 1; } }
""")
w("system/decomposeParDict", "dictionary", "decomposeParDict", "numberOfSubdomains 2; method simple; coeffs { n (2 1 1); }\n")

def bc(imp_s, fixed_s, atm_s):
    s = "\n".join(f"  {n} {{ {imp_s} }}" for n in imp)
    s += "\n" + "\n".join(f"  {n} {{ {fixed_s} }}" for n in fixed)
    return s + f"\n  atmosphere {{ {atm_s} }}"
def fld(name, cls, dim, init, b):
    w(f"0.orig/{name}", cls, name, f"dimensions {dim}; internalField uniform {init};\nboundaryField {{\n{b}\n}}\n")
fld("U", "volVectorField", "[0 1 -1 0 0 0 0]", "(0 0 0)",
    bc("type fixedValue; value uniform (0 0 0);", "type noSlip;", "type pressureInletOutletVelocity; value uniform (0 0 0);"))
fld("p_rgh", "volScalarField", "[1 -1 -2 0 0 0 0]", "0",
    bc("type fixedFluxPressure; value uniform 0;", "type fixedFluxPressure; value uniform 0;", "type totalPressure; p0 uniform 0; value uniform 0;"))
fld("alpha.water", "volScalarField", "[0 0 0 0 0 0 0]", "0",
    bc("type zeroGradient;", "type zeroGradient;", "type inletOutlet; inletValue uniform 0; value uniform 0;"))
fld("k", "volScalarField", "[0 2 -2 0 0 0 0]", "1e-4",
    bc("type kqRWallFunction; value uniform 1e-4;", "type kqRWallFunction; value uniform 1e-4;", "type inletOutlet; inletValue uniform 1e-4; value uniform 1e-4;"))
fld("omega", "volScalarField", "[0 0 -1 0 0 0 0]", "1",
    bc("type omegaWallFunction; value uniform 1;", "type omegaWallFunction; value uniform 1;", "type inletOutlet; inletValue uniform 1; value uniform 1;"))
fld("nut", "volScalarField", "[0 2 -1 0 0 0 0]", "0",
    bc("type nutkWallFunction; value uniform 0;", "type nutkWallFunction; value uniform 0;", "type calculated; value uniform 0;"))
print("case", case, "omega", round(omega, 4), "water level", ZW)
