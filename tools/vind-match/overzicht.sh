#!/usr/bin/env bash
# Contact sheets over docs/missing_matches: every match sheet scaled down, with
# its number and name above it, sixteen to a page. The numbers are the position
# in the alphabetical listing, so they stay the same as long as the set does.
#
#   bash tools/vind-match/overzicht.sh [dir] [numbers]
#
# With a second argument the named sheets are marked for removal — a red frame,
# a red number and a REMOVE band — so a selection can be looked over before
# anything is deleted. The numbers are separated by commas or spaces:
#
#   bash tools/vind-match/overzicht.sh docs/missing_matches 15,25,26,34
#
# Every tile has the same geometry either way, so the marked ones stand out
# without shifting the grid.
set -euo pipefail

dir="${1:-docs/missing_matches}"
marked="${2:-}"
out="$dir/overzicht"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

W=448 FRAME=5 TILE=$((448 + 2 * 5))   # sheet width, frame width, tile width

mapfile -t sheets < <(cd "$dir" && ls *.png | LC_ALL=C sort)
(( ${#sheets[@]} )) || { echo "no sheets in $dir" >&2; exit 1; }

declare -A mark=()
for m in ${marked//,/ }; do
  [[ $m =~ ^[0-9]+$ ]] || { echo "not a number: $m" >&2; exit 1; }
  (( m >= 1 && m <= ${#sheets[@]} )) || { echo "out of range 1-${#sheets[@]}: $m" >&2; exit 1; }
  mark[$m]=1
done

rm -rf "$out"
mkdir -p "$out"

index="$out/index.md"
{
  echo "# Numbering"
  echo
  if (( ${#mark[@]} )); then
    echo "${#mark[@]} of ${#sheets[@]} sheets are marked for removal."
    echo
  fi
  echo "| # | sheet | page | marked |"
  echo "|--:|-------|-----:|:------:|"
} > "$index"

n=0
for sheet in "${sheets[@]}"; do
  n=$((n + 1))
  num=$(printf '%03d' "$n")
  page=$(printf '%02d' $(( (n - 1) / 16 + 1 )))
  name="${sheet%.png}"

  if [[ -n ${mark[$n]:-} ]]; then
    frame='#c00000'; ink='#c00000'; bandbg='#c00000'; bandink='white'; bandtext='REMOVE'; flag='×'
  else
    frame='#c8c8c8'; ink='#303030'; bandbg='white';   bandink='white'; bandtext='';       flag=''
  fi

  convert -size "${TILE}x36" xc:white -gravity center \
    -font DejaVu-Sans-Bold -pointsize 26 -fill "$ink" -annotate 0 "$num" "$tmp/a.png"
  convert "$dir/$sheet" -resize "${W}x" -bordercolor "$frame" -border "$FRAME" "$tmp/b.png"
  convert -size "${TILE}x26" xc:"$bandbg" -gravity center \
    -font DejaVu-Sans-Bold -pointsize 15 -fill "$bandink" -annotate 0 "$bandtext" "$tmp/c.png"
  convert -background white -fill "$ink" -font DejaVu-Sans -pointsize 13 \
    -size "${TILE}x" caption:"$name" -gravity center -extent "${TILE}x34" "$tmp/d.png"

  convert "$tmp/a.png" "$tmp/b.png" "$tmp/c.png" "$tmp/d.png" -append \
    -bordercolor white -border 8 +set label -strip "$tmp/tile_$num.png"

  echo "| $n | \`$sheet\` | $page | $flag |" >> "$index"
done

pages=$(( (n + 15) / 16 ))
i=0
for page in $(seq 1 "$pages"); do
  pnum=$(printf '%02d' "$page")
  last=$(( i + 16 > n ? n : i + 16 ))
  montage $(for k in $(seq $((i + 1)) "$last"); do printf '%s\n' "$tmp/tile_$(printf '%03d' "$k").png"; done) \
    -tile 4x4 -geometry +0+0 -label '' -background white "$out/blad_$pnum.png"
  i=$last
done

echo "$n sheets over $pages pages in $out${marked:+, ${#mark[@]} marked for removal}"
