# Render one still as a montage beat with S0's own screen treatment (copied from film/src/S0/ext_montage.py: pixel grid,
# angled screen, glow, grain, vignette, white-flash entry) -> an mp4 segment and its middle frame.
# usage: montage_beat.py STILL OUT_PREFIX K KIND LOOK BEATS [crop]
import math, os, subprocess, sys
import numpy as np
from PIL import Image
still, outp, k, kind, look, beats = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4], sys.argv[5], float(sys.argv[6])
crop = sys.argv[7] if len(sys.argv) > 7 else None
FPS = 30; BEAT = 60 / 95.0; n = int(round(beats * BEAT * FPS)); PX = 5
mask = f"{os.path.dirname(outp)}/mask_{PX}.png"
if not os.path.exists(mask):
    sub = (PX - 1) // 3; cols = [(255, 70, 70)] * sub + [(70, 255, 70)] * sub + [(70, 70, 255)] * sub
    cols += [(30, 30, 30)] * (PX - len(cols)); row = np.array([cols[x % PX] for x in range(1920)], np.float32)
    img = np.repeat(row[None], 1080, 0); gap = (np.arange(1080) % PX) == PX - 1; img[gap] *= .35
    Image.fromarray(img.astype(np.uint8)).save(mask)
PIXELS = (f"scale={1920 // PX}:{1080 // PX}:flags=area,scale=1920:1080:flags=neighbor,format=gbrp[s];[1:v]format=gbrp[m];"
          "[s][m]blend=all_mode=multiply,lutrgb=r='clip(val*2.2,0,255)':g='clip(val*2.2,0,255)':b='clip(val*2.2,0,255)'")
def quad(yaw, pitch, scale, cx=960.0, cy=540.0, D=2600.0):
    w, h = 1920 * scale, 1080 * scale; ya, pa = math.radians(yaw), math.radians(pitch); out = []
    for sx, sy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        x, y = sx * w / 2, sy * h / 2; x, z = x * math.cos(ya), x * math.sin(ya)
        y, z = y * math.cos(pa) - z * math.sin(pa), y * math.sin(pa) + z * math.cos(pa); kk = D / (D + z); out.append((cx + x * kk, cy + y * kk))
    return out
def plane(k, n, kind, look):
    d = -1 if k % 2 else 1
    if look == "punch": a, b = (14 * d, 2 * d, 1.16), (7 * d, 1 * d, 1.36)
    elif look == "fit": a, b = (7 * d, 1, 0.99), (4 * d, .5, 0.87)
    elif kind == "down": a, b = (30 * d, 4, 0.76), (14 * d, 1, 0.86)
    else: a, b = (22 * d, 3 * d, 0.80), (15 * d, 1.5 * d, 0.85)
    q0, q1 = quad(*a, cx=960 + (8 if look == "fit" else 25) * d), quad(*b, cx=960 + (4 if look == "fit" else 10) * d)
    ex = [f"{q0[i][j]:.1f}+({q1[i][j] - q0[i][j]:.1f})*on/{max(1, n - 1)}" for i in range(4) for j in range(2)]
    return "scale=1888:1048,pad=1920:1080:16:16:black,perspective=" + ":".join(f"{nm}='{e}'" for nm, e in zip(["x0", "y0", "x1", "y1", "x2", "y2", "x3", "y3"], ex)) + ":sense=destination:eval=frame:interpolation=cubic"
FOOT = "eq=contrast=1.2:brightness=-0.03:saturation=0.7,colorbalance=rs=-0.04:gs=0.05:bs=-0.02:rm=-0.03:gm=0.04:bm=-0.02"
pre = ([crop] if crop else []) + ["scale=1920:1080:force_original_aspect_ratio=increase", "crop=1920:1080", "setsar=1", "fps=30", FOOT]
fx = [f"rgbashift=rh=-14:bh=14:gh=0:enable='lt(n,{3 if kind == 'down' else 2})'", f"fade=t=in:st=0:d={0.17 if kind == 'down' else 0.1}:color=white"]
fc = ("[0:v]" + ",".join(pre) + "," + PIXELS + "," + plane(k, n, kind, look) + ",split[p1][p2];[p2]gblur=sigma=50,colorlevels=romax=0.55:gomax=0.55:bomax=0.55[g];"
      "[g][p1]blend=all_mode=lighten," + ",".join(fx + ["noise=alls=8:allf=t+u", "vignette=PI/5", "format=yuv420p"]) + "[v]")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-framerate", "30", "-i", still, "-i", mask, "-frames:v", str(n), "-an",
                "-filter_complex", fc, "-map", "[v]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-r", "30", outp + ".mp4"], check=True)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{n / 2 / FPS:.3f}", "-i", outp + ".mp4", "-frames:v", "1", "-q:v", "2", outp + ".jpg"], check=True)
print("ok", outp, n, "frames")
