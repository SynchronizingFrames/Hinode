#!/bin/sh
cd /data/hinode_shots || exit 1
ls rain_*.png
magick montage rain_dry_day.png rain_wet_day.png rain_dry_night.png rain_wet_night.png -tile 2x2 -geometry +4+4 -background '#111' /tmp/rm.png && magick /tmp/rm.png -resize 1500x -quality 85 /data/release/Hinode-rain.jpg && ls -la /data/release/Hinode-rain.jpg
