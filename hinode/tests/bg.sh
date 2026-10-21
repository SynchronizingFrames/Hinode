#!/bin/sh
# run a test in the background: sh tests/bg.sh e2e  -> log in /data/hinode_shots/<name>.log
mkdir -p /tmp/ghp /data/hinode_shots && ln -sfn /data/hinode /tmp/ghp/hinode
cd /data/hinode || exit 1
L="/data/hinode_shots/$1.log"
( S=$(date +%s); timeout ${2:-400} node "tests/$1.mjs" > "$L" 2>&1; echo "DONE rc=$? secs=$(( $(date +%s) - S ))" >> "$L" ) > /dev/null 2>&1 &
echo started $1
