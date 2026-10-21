#!/bin/sh
# run regression tests ONE AT A TIME in the background: sh tests/regress.sh car npc e2e save
# logs: /data/hinode_shots/<name>.log ; summary: /data/hinode_shots/regress.log
mkdir -p /tmp/ghp /data/hinode_shots && ln -sfn /data/hinode /tmp/ghp/hinode
cd /data/hinode || exit 1
R=/data/hinode_shots/regress.log
: > "$R"
(
  for t in "$@"; do
    L="/data/hinode_shots/$t.log"; S=$(date +%s)
    timeout 400 node "tests/$t.mjs" > "$L" 2>&1; rc=$?
    echo "$t rc=$rc secs=$(( $(date +%s) - S )) $(grep -e 'passed' "$L" | tail -1)" >> "$R"
  done
  echo ALLDONE >> "$R"
) > /dev/null 2>&1 &
echo started regress "$@"
