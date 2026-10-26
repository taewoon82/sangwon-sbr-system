#!/bin/bash
# usage: run_case.sh params.json casedir
set -e
cd /home/claude/cfd
rm -rf "$2"; python3 gen_case_multi.py "$1" "$2"; cd "$2"
../of.sh blockMesh > log.blockMesh 2>&1
../of.sh surfaceFeatureExtract > log.sfe 2>&1
../of.sh snappyHexMesh -overwrite > log.snappy 2>&1
../of.sh checkMesh > log.check 2>&1
../of.sh decomposePar -force > log.decomp 2>&1
../of.sh mpirun --allow-run-as-root --oversubscribe -np 2 simpleFoam -parallel > log.simpleFoam 2>&1
../of.sh reconstructPar -latestTime > log.recon 2>&1
python3 ../cellgeom.py . $(ls -d [0-9]* | sort -n | tail -1) > log.cc 2>&1
echo DONE > done.flag
