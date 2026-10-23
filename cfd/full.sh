#!/bin/bash
# usage: full.sh hz — 새 케이스: 2000회(최종만 저장) → 3000회(100회마다)
cd "$(dirname "$0")"
./run_case.sh cases/p$1.json c$1 > run$1.log 2>&1 || true
./cont.sh c$1
