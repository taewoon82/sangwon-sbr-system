#!/bin/bash
# 사용: run.sh CASE  (해석 → 재구성 → 셀 중심/부피 출력)
source /usr/share/openfoam/etc/bashrc 2>/dev/null
cd "$1" || exit 1
rm -rf processor*
decomposePar -force > log.decomp 2>&1
mpirun --allow-run-as-root --oversubscribe -np 2 simpleFoam -parallel > log.simple 2>&1
reconstructPar > log.recon2 2>&1
rm -rf processor*
echo DONE
