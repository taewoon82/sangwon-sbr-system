#!/bin/bash
# 사용: runvof.sh CASE   (메시 → 초기수위 → interFoam 병렬)
source /usr/share/openfoam/etc/bashrc 2>/dev/null
cd "$1" || exit 1
blockMesh > log.block 2>&1 || { echo BLOCK FAIL; exit 1; }
decomposePar -force > log.decomp0 2>&1
mpirun --allow-run-as-root --oversubscribe -np 2 snappyHexMesh -overwrite -parallel > log.snappy 2>&1 || { echo SNAPPY FAIL; exit 1; }
reconstructParMesh -constant > log.recon 2>&1
rm -rf processor*
topoSet > log.topo 2>&1
checkMesh > log.check 2>&1; grep -E "^ *cells:|Mesh OK|\*\*\*" log.check
rm -rf 0 && cp -r 0.orig 0
setFields > log.setf 2>&1
decomposePar -force > log.decomp 2>&1
mpirun --allow-run-as-root --oversubscribe -np 2 interFoam -parallel > log.inter 2>&1
reconstructPar > log.recon2 2>&1
rm -rf processor*
echo DONE
