#!/bin/bash
# 재시작 가능: processor 폴더가 있으면 마지막 저장 시점부터 이어서 계산
source /usr/share/openfoam/etc/bashrc 2>/dev/null
cd "$(dirname "$0")"
if [ ! -d processor0 ]; then
  for d in $(ls | grep -E '^[0-9][0-9.e+-]*$'); do rm -rf $d; done
  cp -r 0.orig 0 && setFields > log.setf 2>&1
  decomposePar -force > log.decomp 2>&1
fi
mpirun --allow-run-as-root --oversubscribe -np 2 interFoam -parallel >> log.inter 2>&1
echo DONE
