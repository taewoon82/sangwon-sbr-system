"""OpenFOAM v1912 MRF 케이스 생성. 사용: python3 mkcase.py CASE GEOMDIR RPM [stator 0/1]"""
import sys, os, shutil, glob
case, gdir, rpm = sys.argv[1], sys.argv[2], float(sys.argv[3])
stator = int(sys.argv[4]) if len(sys.argv) > 4 else 0
omega = rpm * 2 * 3.141592653589793 / 60
os.makedirs(f"{case}/constant/triSurface", exist_ok=True)
os.makedirs(f"{case}/system", exist_ok=True); os.makedirs(f"{case}/0", exist_ok=True)
for f in glob.glob(f"{gdir}/*.stl"):
    shutil.copy(f, f"{case}/constant/triSurface/")
names = sorted(os.path.basename(f)[:-4] for f in glob.glob(f"{gdir}/*.stl"))
imp = [n for n in names if n.startswith(("blade", "cover", "body"))]
H = "FoamFile { version 2.0; format ascii; class %s; object %s; }\n"
def w(path, cls, obj, body):
    open(f"{case}/{path}", "w").write(H % (cls, obj) + body)

w("system/blockMeshDict", "dictionary", "blockMeshDict", """
convertToMeters 1;
vertices ((0 0 0)(10.5 0 0)(10.5 10.5 0)(0 10.5 0)(0 0 3.5)(10.5 0 3.5)(10.5 10.5 3.5)(0 10.5 3.5));
blocks (hex (0 1 2 3 4 5 6 7) (70 70 24) simpleGrading (1 1 1));
boundary (
 walls { type wall; faces ((0 3 2 1)(0 1 5 4)(1 2 6 5)(2 3 7 6)(3 0 4 7)); }
 surface { type wall; faces ((4 5 6 7)); }
);
""")

geo = "\n".join(f" {n} {{ type triSurfaceMesh; file \"{n}.stl\"; }}" for n in names)
lvl = {"haunch": "(1 1)", "cross": "(2 2)", "stator": "(4 4)"}
ref = "\n".join(f"  {n} {{ level {lvl.get(n, '(4 4)')}; patchInfo {{ type wall; }} }}" for n in names)
dist = "\n".join(f"  {n} {{ mode distance; levels ((0.012 4) (0.05 3)); }}" for n in imp + (["stator"] if stator else []))
w("system/snappyHexMeshDict", "dictionary", "snappyHexMeshDict", f"""
castellatedMesh true; snap true; addLayers false;
geometry {{
{geo}
 mrf {{ type searchableCylinder; point1 (5.25 5.25 3.05); point2 (5.25 5.25 3.6); radius 0.72; }}
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
 { name rotor; type cellSet; action new; source cylinderToCell; p1 (5.25 5.25 3.05); p2 (5.25 5.25 3.6); radius 0.72; }
 { name rotor; type cellZoneSet; action new; source setToCellZone; set rotor; }
);
""")

nonrot = "(walls surface haunch cross" + (" stator" if stator else "") + ")"
w("constant/MRFProperties", "dictionary", "MRFProperties", f"""
rotor {{ cellZone rotor; active yes; nonRotatingPatches {nonrot}; origin (5.25 5.25 0); axis (0 0 1); omega {omega:.5f}; }}
""")
w("constant/transportProperties", "dictionary", "transportProperties", "transportModel Newtonian; nu 1e-06;\n")
w("constant/turbulenceProperties", "dictionary", "turbulenceProperties", "simulationType RAS; RAS { RASModel kOmegaSST; turbulence on; printCoeffs off; }\n")

impP = "(" + " ".join(imp) + ")"
w("system/controlDict", "dictionary", "controlDict", f"""
application simpleFoam; startFrom latestTime; startTime 0; stopAt endTime; endTime 3000; deltaT 1;
writeControl timeStep; writeInterval 250; purgeWrite 6; writeFormat ascii; writePrecision 7; writeCompression off;
timeFormat general; timePrecision 6; runTimeModifiable true;
functions {{}}
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

impw = "\n".join(f"  {n} {{ type %s; %s }}" for n in imp)
def bc(kind_imp, val_imp, kind_wall, val_wall, slip):
    s = "\n".join(f"  {n} {{ type {kind_imp}; {val_imp} }}" for n in imp)
    for n in ["walls", "haunch", "cross"] + (["stator"] if stator else []):
        s += f"\n  {n} {{ type {kind_wall}; {val_wall} }}"
    s += f"\n  surface {{ {slip} }}"
    return s
w("0/U", "volVectorField", "U", "dimensions [0 1 -1 0 0 0 0]; internalField uniform (0 0 0);\nboundaryField {\n"
  + bc("fixedValue", "value uniform (0 0 0);", "noSlip", "", "type slip;") + "\n}\n")
w("0/p", "volScalarField", "p", "dimensions [0 2 -2 0 0 0 0]; internalField uniform 0;\nboundaryField {\n"
  + bc("zeroGradient", "", "zeroGradient", "", "type zeroGradient;") + "\n}\n")
w("0/k", "volScalarField", "k", "dimensions [0 2 -2 0 0 0 0]; internalField uniform 1e-3;\nboundaryField {\n"
  + bc("kqRWallFunction", "value uniform 1e-3;", "kqRWallFunction", "value uniform 1e-3;", "type zeroGradient;") + "\n}\n")
w("0/omega", "volScalarField", "omega", "dimensions [0 0 -1 0 0 0 0]; internalField uniform 1;\nboundaryField {\n"
  + bc("omegaWallFunction", "value uniform 1;", "omegaWallFunction", "value uniform 1;", "type zeroGradient;") + "\n}\n")
w("0/nut", "volScalarField", "nut", "dimensions [0 2 -1 0 0 0 0]; internalField uniform 0;\nboundaryField {\n"
  + bc("nutkWallFunction", "value uniform 0;", "nutkWallFunction", "value uniform 0;", "type calculated; value uniform 0;") + "\n}\n")
print("case", case, "omega", round(omega, 4), "imp patches", len(imp))
