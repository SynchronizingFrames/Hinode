#!/bin/sh
# run one test: sh tests/run1.sh car
mkdir -p /tmp/ghp && ln -sfn /data/hinode /tmp/ghp/hinode
cd /data/hinode || exit 1
timeout 170 node "tests/$1.mjs" 2>&1 | grep -v -i -e reparsing -e MODULE_TYPELESS -e trace-warnings | tail -${2:-6}
echo "exit=$?"
