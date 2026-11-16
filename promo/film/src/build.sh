#!/usr/bin/env bash
# Build the pDAI Names launch film (1080 x 1080, 51.1 s) from scratch.
#   PROMO_MUSIC=/path/to/track.mp3 promo/film/src/build.sh [WORK] [OUT.mp4]
# PROMO_MUSIC is the bought track, Skeler's remix of "Clubbed to Death" (kept out of the repo, as for S0). Needs ffmpeg,
# ImageMagick, Python 3, Node with Playwright, npm, this repo and pdai-research on consolidated-research with the S0
# montage's sources checked out (PDAI_NAMES, PDAI_REPO).
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"; WORK="${1:-$(mktemp -d)}"; mkdir -p "$WORK"; WORK="$(cd "$WORK" && pwd)"; OUT="${2:-$WORK/pdai-names-promo-1x1.mp4}"
: "${PROMO_MUSIC:?set PROMO_MUSIC to the track}"
export PDAI_NAMES="${PDAI_NAMES:-/home/user/pdai-names}" PDAI_REPO="${PDAI_REPO:-/home/user/pdai-research}" PROMO_ASSETS="$WORK/assets"
GIF="$PDAI_REPO/video/assets/tweets/x-media/1955656233643577809_rh-pulsechain-train.mp4"; A="$WORK/assets"
mkdir -p "$A/gif" "$A/fonts" "$WORK"/{montage,audio,scenes,frames,tmpgif}

# tools: Python with OpenCV for the trace; Space Grotesk, the site's own font package
[ -x "$WORK/venv/bin/python" ] || { python3 -m venv "$WORK/venv"; "$WORK/venv/bin/pip" install -q opencv-python-headless numpy pillow; }
[ -f "$A/fonts/space-grotesk-latin-wght-normal.woff2" ] || (cd "$WORK" && npm pack -q @fontsource-variable/space-grotesk@5.3.0 >/dev/null \
  && tar xzf fontsource-variable-space-grotesk-5.3.0.tgz && cp package/files/space-grotesk-latin-wght-normal.woff2 "$A/fonts/")

# the PulseChain Train GIF: the 3/4 view (frames 0-13), the first take's approach (27-33, mirrored), the freeze (33), the
# empty tunnel (0.80 s, for the montage's bar 11), and the trace of the freeze frame
ffmpeg -v error -y -i "$GIF" -vsync 0 "$WORK/tmpgif/g_%03d.png"
ffmpeg -v error -y -ss 0.80 -i "$GIF" -frames:v 1 "$A/tunnel_0.80.png"
"$WORK/venv/bin/python" -I - "$WORK" <<'PY'
import sys
from PIL import Image, ImageFilter
w = sys.argv[1]; src = w + "/tmpgif/g_%03d.png"; out = w + "/assets/gif"
Image.open(src % 34).convert("RGB").transpose(Image.FLIP_LEFT_RIGHT).save(w + "/assets/freeze_m33.png")
for i in range(14):
    Image.open(src % (i + 1)).convert("RGB").crop((200, 109, 691, 600)).resize((1080, 1080), Image.LANCZOS).filter(ImageFilter.UnsharpMask(2, 60, 2)).save(f"{out}/q{i:02d}.jpg", quality=92)
for j, i in enumerate(range(27, 34)):
    Image.open(src % (i + 1)).convert("RGB").transpose(Image.FLIP_LEFT_RIGHT).crop((286, 125, 736, 575)).resize((1080, 1080), Image.LANCZOS).filter(ImageFilter.UnsharpMask(2, 60, 2)).save(f"{out}/s{j:02d}.jpg", quality=92)
PY
"$WORK/venv/bin/python" -I "$SRC/trace_freeze.py" "$A/freeze_m33.png" "$A/trace33.json" "$A/trace33_check.png"

# the montage (bars 3-11), the music and the effects, then the scenes and their frames
python3 -I "$SRC/promo_montage.py" "$WORK/montage"
python3 -I "$SRC/music.py" "$WORK/audio/music.wav"
"$WORK/venv/bin/python" -I "$SRC/sfx.py" "$WORK/audio/sfx.wav"
python3 -I "$SRC/scenes.py" "$A" "$WORK/scenes/scenes.html"
H="$WORK/scenes/scenes.html"; F="$WORK/frames"
node "$SRC/render_frames.cjs" "$H" "$F" 0 152 & node "$SRC/render_frames.cjs" "$H" "$F" 835 1067 &
node "$SRC/render_frames.cjs" "$H" "$F" 1068 1300 & node "$SRC/render_frames.cjs" "$H" "$F" 1301 1532 & wait
"$SRC/assemble.sh" "$WORK" "$OUT"
