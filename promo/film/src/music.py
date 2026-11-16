# The promo's music: the track from its first note to the downbeat of bar 20 (48.06 s), then the drop's own first hit
# (bar 12's downbeat) played again on that downbeat and echoed out, to 51.1 s. The track lines up with S0's music to
# within 5 ms, so S0's bar grid holds: bar 1 at 0.0555 s, the drop at 27.845 s, 95 bpm.
# usage: PROMO_MUSIC=/path/to/track.mp3 music.py OUT.wav
import os, subprocess, sys
TRACK = os.environ["PROMO_MUSIC"]; OUT = sys.argv[1]
BAR = 240 / 95; BEAT = BAR / 4; DROP = 27.845; END20 = DROP + 8 * BAR; TOTAL = 51.1
hit0, hit1 = DROP - 0.005, DROP + BEAT                       # one beat of the drop, from its first transient
delays = "|".join(str(round(BEAT * 1000 * k / 2)) for k in (1, 2, 3, 4, 6))   # half-beat echoes
fc = (f"[0:a]aresample=48000,asplit=2[m][h];"
      f"[m]atrim=0:{END20:.4f},afade=t=out:st={END20 - 0.012:.4f}:d=0.012[main];"
      f"[h]atrim={hit0:.4f}:{hit1:.4f},asetpts=PTS-STARTPTS,afade=t=out:st={hit1 - hit0 - 0.06:.4f}:d=0.06,apad=pad_dur=3.2,"
      f"aecho=0.9:0.85:{delays}:0.55|0.40|0.28|0.18|0.10,lowpass=f=9000,volume=-4dB,afade=t=out:st=1.3:d={TOTAL - END20 - 1.3:.3f},"
      f"adelay={round(END20 * 1000)}|{round(END20 * 1000)}[tail];"
      f"[main][tail]amix=inputs=2:normalize=0:duration=longest,atrim=0:{TOTAL},asetpts=PTS-STARTPTS[a]")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", TRACK, "-filter_complex", fc, "-map", "[a]", "-c:a", "pcm_s24le", OUT], check=True)
print("music", OUT, f"bar 20 at {END20:.3f} s, ends {TOTAL} s")
