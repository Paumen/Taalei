#!/usr/bin/env bash
# Contact sheets over docs/missing_matches: every match sheet scaled down, with
# its number and name above it, sixteen to a page. The numbers are the position
# in the alphabetical listing, so they stay the same as long as the set does.
#
#   tools/vind-match/overzicht.sh [dir]        (default docs/missing_matches)
set -euo pipefail

dir="${1:-docs/missing_matches}"
out="$dir/overzicht"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

mapfile -t sheets < <(cd "$dir" && ls *.png | LC_ALL=C sort)
(( ${#sheets[@]} )) || { echo "no sheets in $dir" >&2; exit 1; }

rm -rf "$out"
mkdir -p "$out"

index="$out/index.md"
{
  echo "# Numbering"
  echo
  echo "| # | sheet | page |"
  echo "|--:|-------|-----:|"
} > "$index"

n=0
for sheet in "${sheets[@]}"; do
  n=$((n + 1))
  num=$(printf '%03d' "$n")
  page=$(printf '%02d' $(( (n - 1) / 16 + 1 )))
  name="${sheet%.png}"

  convert "$dir/$sheet" -resize 448x478 \
    -background white -bordercolor '#c8c8c8' -border 1 \
    -font DejaVu-Sans-Bold -pointsize 26 -fill '#b00000' \
    label:"$num" +swap -gravity center -append \
    "$tmp/$num.png" 2>/dev/null

  convert "$tmp/$num.png" \
    -background white -font DejaVu-Sans -pointsize 13 -fill '#404040' \
    -size 448x caption:"$name" -gravity center -append \
    -bordercolor white -border 8 +set label -strip "$tmp/tile_$num.png"

  echo "| $n | \`$sheet\` | $page |" >> "$index"
done

i=0
for page in $(seq 1 $(( (n + 15) / 16 ))); do
  pnum=$(printf '%02d' "$page")
  montage $(for k in $(seq $((i + 1)) $(( i + 16 > n ? n : i + 16 )) ); do printf '%s\n' "$tmp/tile_$(printf '%03d' "$k").png"; done) \
    -tile 4x4 -geometry +0+0 -label '' -background white "$out/blad_$pnum.png"
  i=$((i + 16))
done

echo "$n sheets over $(( (n + 15) / 16 )) pages in $out"
