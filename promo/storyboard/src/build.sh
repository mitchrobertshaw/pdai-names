#!/usr/bin/env bash
# Rebuild the promo storyboard: frames from the real assets, the 14 style frames, and the review page.
#   promo/storyboard/src/build.sh [WORK]          -> WORK/site (storyboard.html, panels/, anim/)
# Needs ffmpeg, ImageMagick, Python 3, Node with Playwright, and both repos checked out:
#   PDAI_NAMES (default /home/user/pdai-names) and PDAI_REPO (default /home/user/pdai-research, branch
#   consolidated-research, with video/film/S0_Somebody.mp4, the PulseChain Train GIF, the pDAI Conference art
#   and "token logos/" present).
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
WORK="${1:-$(mktemp -d)}"; mkdir -p "$WORK"; WORK="$(cd "$WORK" && pwd)"
export PDAI_NAMES="${PDAI_NAMES:-/home/user/pdai-names}" PDAI_REPO="${PDAI_REPO:-/home/user/pdai-research}"
V="$PDAI_REPO/video"; GIF="$V/assets/tweets/x-media/1955656233643577809_rh-pulsechain-train.mp4"; FILM="$V/film/S0_Somebody.mp4"
mkdir -p "$WORK"/{train,montage,fonts,panels_out,site/panels,site/anim}

# Python with OpenCV for the trace; Space Grotesk for the frames (the site's own font package)
[ -x "$WORK/venv/bin/python" ] || { python3 -m venv "$WORK/venv"; "$WORK/venv/bin/pip" install -q opencv-python-headless numpy pillow; }
[ -f "$WORK/fonts/package/files/space-grotesk-latin-wght-normal.woff2" ] || (cd "$WORK/fonts" && npm pack -q @fontsource-variable/space-grotesk@5.3.0 >/dev/null && tar xzf fontsource-variable-space-grotesk-5.3.0.tgz)

# The GIF: the 3/4 view, the empty tunnel, and the second approach; mirrored so the train runs left to right
for t in 0.20 0.80 3.60 3.80 4.00; do ffmpeg -v error -y -ss $t -i "$GIF" -frames:v 1 "$WORK/train/f_$t.png"; done
"$WORK/venv/bin/python" -I -c "
from PIL import Image; w='$WORK'
Image.open(w+'/train/f_4.00.png').transpose(Image.FLIP_LEFT_RIGHT).save(w+'/train/m_4.00.png')
im=Image.open(w+'/train/f_0.20.png').convert('RGB').crop((0,0,800,450)).resize((1280,720),Image.LANCZOS); im.save(w+'/site/anim/a_34.jpg',quality=84)
for t,n in (('3.60','s1'),('3.80','s2'),('4.00','s3')):
    Image.open(w+'/train/f_'+t+'.png').convert('RGB').transpose(Image.FLIP_LEFT_RIGHT).crop((0,125,800,575)).resize((1280,720),Image.LANCZOS).save(w+'/site/anim/a_'+n+'.jpg',quality=84)"
"$WORK/venv/bin/python" -I "$SRC/trace.py" "$WORK/train/m_4.00.png" "$WORK/train/trace.json" "$WORK/train/trace_check.png"

# The montage: one frame per shot from S0 (shot middles, from ext_montage.py's edit), the strobe, and two new beats
i=0
for spec in "riskdiode 6.37" "sommi 8.90" "meme 12.40" "wordsearch 14.95" "ams18 15.85" "astronaut 17.10" "stickers 19.90" \
            "storyteller 20.58" "screen1 21.21" "fosdem20 21.85" "train 22.48" "zurich1 23.11" "mati 23.74" "binance 24.37" "ams24 25.00" "enigma 25.60"; do
  set -- $spec; i=$((i+1)); ffmpeg -v error -y -ss "$2" -i "$FILM" -frames:v 1 -vf scale=640:360 -q:v 3 "$WORK/montage/$(printf %02d $i)_$1.jpg"
done
ffmpeg -v error -y -ss 25.60 -i "$FILM" -frames:v 1 -q:v 2 "$WORK/montage/enigma_25.60.jpg"
"$WORK/venv/bin/python" -I "$SRC/montage_beat.py" "$V/assets/community/pdai-conference/conference-cyber-city.jpg" "$WORK/montage/swap_conference" 8 down "" 1
"$WORK/venv/bin/python" -I "$SRC/montage_beat.py" "$WORK/train/f_0.80.png" "$WORK/montage/strobe_tunnel" 16 breath punch 1 "crop=800:450:0:100"
for f in swap_conference strobe_tunnel; do convert "$WORK/montage/$f.jpg" -resize 640x360 "$WORK/montage/${f}_t.jpg"; done

# The 14 style frames, then the page
python3 -I "$SRC/panels.py" "$WORK" "$WORK/panels.html"
node "$SRC/render_panels.cjs" "$WORK/panels.html" "$WORK/panels_out"
for f in "$WORK"/panels_out/p*.png; do convert "$f" -resize 1600x900 -quality 84 "$WORK/site/panels/$(basename "${f%.png}").jpg"; done
python3 -I "$SRC/build_storyboard.py" "$WORK" "$WORK/site/storyboard.html"
echo "done: $WORK/site"
