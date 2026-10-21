#!/bin/sh
# pixel stats for car showroom shots (centre crop = where the car sits)
mkdir -p /tmp/ghp && ln -sfn /data/hinode /tmp/ghp/hinode
cd /data/hinode_shots || exit 1
for f in car_front car_side car_rear car_wheel car_night; do
  [ -f "$f.png" ] || continue
  A=$(magick "$f.png" -colorspace gray -format '%[fx:mean*255] %[fx:standard_deviation*255]' info:)
  B=$(magick "$f.png" -gravity center -crop 40%x40%+0+0 +repage -colorspace gray -format '%[fx:mean*255] %[fx:standard_deviation*255] %[fx:maxima*255]' info:)
  echo "$f  full(mean sd)=$A  centre(mean sd max)=$B"
done
