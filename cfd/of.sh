#!/bin/bash
export FOAM_INST_DIR=/usr/share/openfoam; export WM_PROJECT_DIR=/usr/share/openfoam
source /usr/share/openfoam/etc/bashrc >/dev/null 2>&1
export WM_PROJECT_DIR=/usr/share/openfoam FOAM_ETC=/usr/share/openfoam/etc
"$@"
