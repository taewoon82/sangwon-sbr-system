#!/bin/bash
# usage: fullq.sh name — q_name.json → 케이스 q_name: 2000회 → 3000회(100회마다) → 후처리용 cell 정보
cd /home/claude/cfd
./run_case.sh q_$1.json q_$1 > runq_$1.log 2>&1 || { echo FAIL >> runq_$1.log; exit 1; }
./cont.sh q_$1
echo ALLDONE >> runq_$1.log
