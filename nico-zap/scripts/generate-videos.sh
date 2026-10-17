#!/usr/bin/env bash
# Generate mock videos (testsrc2 pattern + burned-in label/timecode) and thumbnails.
# Output: public/videos/mockNN_240p.mp4, public/thumbnails/mockNN.jpg
# Usage: bash scripts/generate-videos.sh [parallelism]
set -euo pipefail

cd "$(dirname "$0")/.."
OUT=public/videos
THUMBS=public/thumbnails
mkdir -p "$OUT" "$THUMBS"

FONT="${FONT:-/System/Library/Fonts/Supplemental/Arial Bold.ttf}"
DURATION="${DURATION:-180}"
LIVE_IDS="${LIVE_IDS:-04 08}"
JOBS="${1:-4}"

if [ ! -f "$FONT" ]; then
  echo "Font not found: $FONT (set FONT=/path/to/font.ttf)" >&2
  exit 1
fi

encode() {
  local i="$1" q="$2"
  local w=$(((q * 16 / 9 + 1) / 2 * 2))
  local label="MOCK ${i}"
  case " $LIVE_IDS " in *" $i "*) label="LIVE ${i}" ;; esac
  local hue=$((10#$i * 36))
  local out="$OUT/mock${i}_${q}p.mp4"
  [ -f "$out" ] && return 0
  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "testsrc2=size=${w}x${q}:rate=30:duration=${DURATION}" \
    -f lavfi -i "sine=frequency=$((200 + 10#$i * 40)):duration=${DURATION}" \
    -vf "hue=h=${hue},drawtext=fontfile='${FONT}':text='${i}':fontsize=$((q / 2)):fontcolor=white@0.85:borderw=$((q / 60 + 1)):bordercolor=black:x=(w-tw)/2:y=(h-th)/2,drawtext=fontfile='${FONT}':text='${label}  %{pts\:hms}':fontsize=$((q / 10)):fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=$((q / 60 + 2)):x=10:y=10" \
    -c:v libx264 -preset veryfast -crf 28 -g 60 -pix_fmt yuv420p \
    -c:a aac -b:a 64k -shortest -movflags +faststart \
    "$out"
  echo "done $out"
}
export -f encode
export OUT FONT DURATION LIVE_IDS

for i in $(seq -w 1 10); do
  for q in 240; do
    echo "$i $q"
  done
done | xargs -P "$JOBS" -n 2 bash -c 'encode "$0" "$1"'

for i in $(seq -w 1 10); do
  ffmpeg -hide_banner -loglevel error -y -ss 5 -i "$OUT/mock${i}_240p.mp4" -frames:v 1 -q:v 4 "$THUMBS/mock${i}.jpg"
done
echo "all done"
