#!/bin/bash
# usage: cont.sh case  — 현재 최종 반복에서 3000회까지, 100회마다 저장
cd "$(dirname "$0")/$1"
sed -i -E 's/endTime [0-9]+;/endTime 3000;/; s/writeInterval [0-9]+;/writeInterval 100;/; s/purgeWrite [0-9]+;/purgeWrite 0;/' system/controlDict
../of.sh mpirun --allow-run-as-root --oversubscribe -np 2 simpleFoam -parallel > log.cont3 2>&1
../of.sh reconstructPar > log.recon3 2>&1
rm -rf processor*/[0-9]*[0-9]
for t in $(ls -d [0-9]* | sort -n); do [ "$t" -gt 2000 ] && rm -f $t/phi $t/nut 2>/dev/null; done
echo OK > cont.flag
