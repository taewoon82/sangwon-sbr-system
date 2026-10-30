#!/bin/bash
# 사용: runsteady.sh CASE  (끊기면 다시 실행하면 이어서 계산)
source /usr/share/openfoam/etc/bashrc 2>/dev/null
cd "$1" || exit 1
[ -d processor0 ] || decomposePar -force > log.decomp 2>&1
mpirun --allow-run-as-root --oversubscribe -np 2 simpleFoam -parallel >> log.simple 2>&1
reconstructPar > log.recon 2>&1
echo DONE
