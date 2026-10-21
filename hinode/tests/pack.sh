#!/bin/sh
# sh tests/pack.sh <ZipName>  -> /data/release/<ZipName>.zip + md5
cd /data && mkdir -p release && rm -f "release/$1.zip" && zip -r -q "release/$1.zip" hinode -x '*/node_modules/*' && md5sum "release/$1.zip" && stat -c %s "release/$1.zip"
