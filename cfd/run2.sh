#!/bin/bash
cd "$(dirname "$0")"
for hz in "$@"; do ./run_case.sh cases/p$hz.json c$hz > run$hz.log 2>&1; done
