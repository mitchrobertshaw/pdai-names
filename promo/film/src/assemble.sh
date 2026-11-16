#!/usr/bin/env bash
# Mix the music and effects to -16 LUFS (true peak -1.5 dBTP, two-pass loudnorm, as the film measures), join the open,
# the montage and the scenes into one 1080x1080 picture (1533 frames, 51.1 s) and mux.  usage: assemble.sh WORK OUT.mp4
set -euo pipefail
W="$1"; OUT="$2"; A="$W/audio"
ffmpeg -v error -y -i "$A/music.wav" -i "$A/sfx.wav" -filter_complex "[1:a]volume=-9dB[s];[0:a][s]amix=inputs=2:normalize=0:duration=first[a]" \
  -map "[a]" -c:a pcm_s24le "$A/premix.wav"
M=$(ffmpeg -hide_banner -nostats -i "$A/premix.wav" -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/{/,/}/p')
val() { echo "$M" | python3 -c "import json,sys; print(json.load(sys.stdin)['$1'])"; }
ffmpeg -v error -y -i "$A/premix.wav" -af "loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=$(val input_i):measured_TP=$(val input_tp):measured_LRA=$(val input_lra):measured_thresh=$(val input_thresh):offset=$(val target_offset):linear=true,aresample=48000" \
  -c:a pcm_s24le "$A/mix.wav"
ffmpeg -v error -y -framerate 30 -start_number 0 -i "$W/frames/f_%05d.png" \
  -i "$W/montage/montage.mp4" \
  -framerate 30 -start_number 835 -i "$W/frames/f_%05d.png" \
  -i "$A/mix.wav" \
  -filter_complex "[0:v]trim=end_frame=153,setpts=PTS-STARTPTS,format=yuv420p[a];[1:v]setpts=PTS-STARTPTS,format=yuv420p[b];[2:v]trim=end_frame=698,setpts=PTS-STARTPTS,format=yuv420p[c];[a][b][c]concat=n=3:v=1:a=0,fps=30[v]" \
  -map "[v]" -map 3:a -c:v libx264 -preset slow -crf "${CRF:-21}" -x264-params aq-mode=3 -pix_fmt yuv420p -profile:v high -c:a aac -b:a 192k -ar 48000 \
  -movflags +faststart -t 51.1 "$OUT"
echo "assembled $OUT"
