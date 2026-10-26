#!/bin/bash
# 사용: mesh.sh CASE
source /usr/share/openfoam/etc/bashrc 2>/dev/null
cd "$1" || exit 1
blockMesh > log.block 2>&1 || { echo BLOCK FAIL; tail log.block; exit 1; }
decomposePar -force > log.decomp0 2>&1
mpirun --allow-run-as-root --oversubscribe -np 2 snappyHexMesh -overwrite -parallel > log.snappy 2>&1 || { echo SNAPPY FAIL; tail -20 log.snappy; exit 1; }
reconstructParMesh -constant > log.recon 2>&1
rm -rf processor*
topoSet > log.topo 2>&1
checkMesh > log.check 2>&1
grep -E "^ *cells:|Mesh OK|Failed|\*\*\*" log.check
grep -i "cellZone\|size" log.topo | tail -2
