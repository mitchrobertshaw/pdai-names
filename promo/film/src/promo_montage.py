# The promo's montage: S0's bars 3-11, re-rendered for a 1080x1080 frame. Adapted from pdai-research
# video/film/src/S0/ext_montage.py: the same 16 shots, start times, beats and screen treatment (pixel grid, angled
# screens, glow, grain, vignette, white-flash entries). Two changes: each screen is 4:3 instead of 16:9, so the shots
# fill a square, and bar 11's strobe on Heart's diamond video flickers with the empty tunnel from the PulseChain Train
# GIF and lands on it. usage: promo_montage.py OUTDIR -> OUTDIR/montage.mp4 (bar 3 to the drop, 682 frames)
import math, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image

OUT = os.path.abspath(sys.argv[1]); SEG = f"{OUT}/seg"; os.makedirs(SEG, exist_ok=True)
V = os.path.join(os.environ.get("PDAI_REPO", "/home/user/pdai-research"), "video"); C, X, FL = f"{V}/clips", f"{V}/assets", f"{V}/film"
BAR = 4 * 60 / 95.0; B1 = 27.845 - 11 * BAR; BEAT = BAR / 4; FPS = 30
bar = lambda k: B1 + (k - 1) * BAR; F = lambda t: int(round(t * FPS))
T0 = F(bar(12)) / FPS                                   # the drop
S = 1080; CW, CH = 1440, 1080                           # the square frame; each screen's picture is 4:3
K = S / 1920                                            # S0's sizes scaled to this frame
STICKERS = f"{X}/tweets/rendered/2005678052647555377_rh-stickers-screwdriver.png"
MEME = f"{X}/community/memes/meme_dai-on-pulsechain_nineironcapital-is-typing.mp4"
GIF = f"{X}/tweets/x-media/1955656233643577809_rh-pulsechain-train.mp4"
SRC = {   # name: (path, crop before the screen) -- S0's crops, re-cut where 4:3 needs more height
    "riskdiode": (f"{C}/clip14_rh_risk-diode_7m20-7m57.mp4", "crop=iw*0.7:ih*0.7:iw*0.18:ih*0.05"),
    "sommi": (f"{C}/clip15_sommi_no-accident_12m07-12m42.mp4", None),
    "wordsearch": (f"{FL}/inserts/S32_Connect_the_Dots.mp4", None),
    "astronaut": (f"{X}/tweets/x-media/1862347098056008000_sommi-pdai-2-9-cents-astronaut.mp4", "crop=iw*0.72:ih*0.72:0:0"),
    "meme": (f"{SEG}/meme_dai.mp4", None),
    "ams18": (f"{C}/clip18_maria_amsterdam_burned-lp_10m24-11m04.mp4", None),
    "train": (GIF, "crop=600:450:100:100"),
    "stickers": (f"{SEG}/stickers_pullback.mp4", None),
    "storyteller": (f"{X}/tweets/rendered/1903243485974573273_storyteller-exposing-pdai-exploiter.png", "crop=1056:792:20:420"),
    "screen1": (f"{X}/evidence/5996-screen-recordings/rh_video_1_2025-01-25_1544-UTC7.mp4", "crop=740:416:0:60"),
    "fosdem20": (f"{C}/clip20_maria_fosdem2018_my-name_4m03-4m27.mp4", "crop=iw*0.62:ih*0.62:0:ih*0.02"),
    "zurich1": (f"{C}/clip1_maria_maker_1m42-2m25.mp4", None),
    "mati": (f"{C}/clip17_mati_reads-rh-airdrop-post_2h16m06-2h16m44.mp4", "crop=iw*0.62:ih*0.62:iw*0.16:ih*0.06"),
    "binance": (f"{X}/tweets/x-media/1864264858989920287_binance-pulse-pegged.mp4", "crop=960:720:0:120"),
    "ams24": (f"{C}/clip24_maria_amsterdam_not-talked-to-heart_1h21m15-1h21m45.mp4", None),
    "enigma": (f"{X}/tweets/x-media/1491429313803030531_rh-enigma-diamond-video.mp4", "crop=720:540:0:150"),
    "tunnel": (os.path.join(os.environ.get("PROMO_ASSETS", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets")), "tunnel_0.80.png"),
               "crop=600:450:0:100")}   # the GIF at 0.80 s, held
STILL = {"storyteller", "tunnel"}; DATA = {"wordsearch"}; SPEED = {"wordsearch": 1.55}
PADDED = {"wordsearch": "0x0b0b10"}                     # shown whole inside its screen, as S0 shows the meme
SHOTS = [("riskdiode", 15.4, 4, "punch"), ("sommi", 24.0, 4, "punch"),                                       # bars 3-4
         ("meme", 0, 4, "fit"), ("wordsearch", 14.35, 4, "fit"), ("ams18", 3.3, 2, ""), ("astronaut", 0.5, 2, "punch"),   # bars 5-8
         ("stickers", 0, 4, "fit"),
         ("storyteller", 0, 1, ""), ("screen1", 13.6, 1, ""), ("fosdem20", 2.0, 1, ""), ("train", 4.0, 1, ""),  # bars 9-10
         ("zurich1", 17.9, 1, "punch"), ("mati", 15.8, 1, ""), ("binance", 1.0, 1, ""), ("ams24", 9.0, 1, "")]
shots, t = [], bar(3)
for s, a, beats, look in SHOTS:
    d = beats * BEAT; down = abs((t - B1) / BAR - round((t - B1) / BAR)) < 1e-6
    shots.append((t, t + d, s, a, "down" if down else "cut", look)); t += d
assert abs(t - bar(11)) < 1e-6

def stickers_pullback(n):   # S0's pull-back from the post's text to the whole post, framed 4:3
    im = Image.open(STICKERS).convert("RGB"); w, h = im.size; tmp = f"{SEG}/stickers_frames"; os.makedirs(tmp, exist_ok=True)
    r0 = (0.0, 0.0, float(w), w * 3 / 4)
    H1 = h + 70; W1 = H1 * 4 / 3; r1 = (w / 2 - W1 / 2, h / 2 - H1 / 2, w / 2 + W1 / 2, h / 2 + H1 / 2)
    for i in range(n):
        u = min(1.0, max(0.0, (i / (n - 1) - .38) / .47)); u = u * u * (3 - 2 * u)
        s = math.exp(math.log(r0[2] - r0[0]) + (math.log(r1[2] - r1[0]) - math.log(r0[2] - r0[0])) * u)
        cx = r0[0] + (r0[2] - r0[0]) / 2 + ((r1[0] + r1[2]) / 2 - (r0[0] + r0[2]) / 2) * u
        cy = r0[1] + (r0[3] - r0[1]) / 2 + ((r1[1] + r1[3]) / 2 - (r0[1] + r0[3]) / 2) * u
        box = (cx - s / 2, cy - s * 3 / 8, cx + s / 2, cy + s * 3 / 8)
        im.transform((CW, CH), Image.EXTENT, box, resample=Image.BICUBIC, fillcolor=(11, 12, 16)).save(f"{tmp}/f_{i:04d}.png", compress_level=1)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", "30", "-i", f"{tmp}/f_%04d.png", "-c:v", "libx264", "-preset", "veryfast", "-crf", "12",
                    "-pix_fmt", "yuv420p", "-r", "30", SRC["stickers"][0]], check=True)

PX = 5
MASK = f"{OUT}/mask_{PX}_{CW}x{CH}.png"
if not os.path.exists(MASK):   # the screen's RGB pixel grid, at the picture's own size
    sub = (PX - 1) // 3; cols = [(255, 70, 70)] * sub + [(70, 255, 70)] * sub + [(70, 70, 255)] * sub
    cols += [(30, 30, 30)] * (PX - len(cols)); row = np.array([cols[x % PX] for x in range(CW)], np.float32)
    img = np.repeat(row[None], CH, 0); img[(np.arange(CH) % PX) == PX - 1] *= .35
    Image.fromarray(img.astype(np.uint8)).save(MASK)
PIXELS = (f"scale={CW // PX}:{CH // PX}:flags=area,scale={CW}:{CH}:flags=neighbor,format=gbrp[s];[1:v]format=gbrp[m];"
          "[s][m]blend=all_mode=multiply,lutrgb=r='clip(val*2.2,0,255)':g='clip(val*2.2,0,255)':b='clip(val*2.2,0,255)'")

def quad(yaw, pitch, scale, cx=S / 2, cy=S / 2, D=2600.0 * K):   # S0's camera, scaled to the square frame
    w, h = S * scale, S * scale; ya, pa = math.radians(yaw), math.radians(pitch); out = []
    for sx, sy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        x, y = sx * w / 2, sy * h / 2; x, z = x * math.cos(ya), x * math.sin(ya)
        y, z = y * math.cos(pa) - z * math.sin(pa), y * math.sin(pa) + z * math.cos(pa); k = D / (D + z); out.append((cx + x * k, cy + y * k))
    return out

def plane(k, n, kind, look):   # S0's angled screen, drifting; punch-ins overflow the frame; "fit" pulls back
    d = -1 if k % 2 else 1
    if look == "punch": a, b = (14 * d, 2 * d, 1.16), (7 * d, 1 * d, 1.36)
    elif look == "fit": a, b = (7 * d, 1, 0.99), (4 * d, .5, 0.87)
    elif kind == "down": a, b = (30 * d, 4, 0.76), (14 * d, 1, 0.86)
    else: a, b = (22 * d, 3 * d, 0.80), (15 * d, 1.5 * d, 0.85)
    q0 = quad(*a, cx=S / 2 + (8 if look == "fit" else 25) * K * d)
    q1 = quad(*b, cx=S / 2 + (4 if look == "fit" else 10) * K * d)
    ex = [f"{q0[i][j]:.1f}+({q1[i][j] - q0[i][j]:.1f})*on/{max(1, n - 1)}" for i in range(4) for j in range(2)]
    pw, ph = S - 32, round((S - 32) * 3 / 4)          # the 4:3 picture inside a square plane, 16 px border
    return (f"scale={pw}:{ph},pad={S}:{S}:16:{(S - ph) // 2}:black,perspective="
            + ":".join(f"{nm}='{e}'" for nm, e in zip(["x0", "y0", "x1", "y1", "x2", "y2", "x3", "y3"], ex))
            + ":sense=destination:eval=frame:interpolation=cubic")

FOOT = "eq=contrast=1.2:brightness=-0.03:saturation=0.7,colorbalance=rs=-0.04:gs=0.05:bs=-0.02:rm=-0.03:gm=0.04:bm=-0.02"

def render(k, s0, s1, src, a, kind, look, fx=None, out=None):
    path, crop = SRC[src]; still = src in STILL; n = F(s1) - F(s0); out = out or f"{SEG}/{k:03d}.mp4"
    speed = [f"setpts=(PTS-STARTPTS)/{SPEED[src]}"] if src in SPEED else []
    if src in PADDED:
        fit = [f"scale={CW}:{CH}:force_original_aspect_ratio=decrease", f"pad={CW}:{CH}:(ow-iw)/2:(oh-ih)/2:color={PADDED[src]}"]
    else:
        fit = [f"scale={CW}:{CH}:force_original_aspect_ratio=increase", f"crop={CW}:{CH}"]
    pre = ([crop] if crop else []) + speed + fit + ["setsar=1", "fps=30", FOOT if src not in DATA else "eq=contrast=1.1"]
    if fx is None:
        fx = [f"rgbashift=rh=-14:bh=14:gh=0:enable='lt(n,{3 if kind == 'down' else 2})'", f"fade=t=in:st=0:d={0.17 if kind == 'down' else 0.1}:color=white"]
    fc = ("[0:v]" + ",".join(pre) + "," + PIXELS + "," + plane(k, n, kind, look) + ",split[p1][p2];[p2]gblur=sigma=" + f"{50 * K:.0f}"
          + ",colorlevels=romax=0.55:gomax=0.55:bomax=0.55[g];[g][p1]blend=all_mode=lighten," + ",".join(fx + ["noise=alls=8:allf=t+u", f"vignette=PI/5", "format=yuv420p"]) + "[v]")
    inp = (["-loop", "1", "-framerate", "30", "-i", path] if still else ["-ss", str(a), "-i", path])
    subprocess.run(["ffmpeg", "-v", "error", "-y"] + inp + ["-i", MASK, "-frames:v", str(n), "-an", "-filter_complex", fc, "-map", "[v]",
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "14", "-r", "30", out], check=True)
    return out

def breath(k, s0, s1):
    """Bar 11: S0's strobe hold on Heart's diamond video, now flickering with the empty tunnel (two frames each) for
    its first second, then holding on the tunnel, with S0's RGB split and its fade before the drop."""
    n = F(s1) - F(s0)
    a = render(k, s0, s1, "enigma", 18.8, "breath", "punch", fx=[], out=f"{SEG}/breath_a.mp4")
    b = render(k, s0, s1, "tunnel", 0.8, "breath", "punch", fx=[], out=f"{SEG}/breath_b.mp4")
    out = f"{SEG}/{k:03d}.mp4"
    fc = ("[0:v][1:v]blend=all_expr='if(lt(N,30),if(lt(mod(N,4),2),A,B),B)',"
          f"rgbashift=rh=-10:bh=10:enable='between(n,30,60)',fade=t=out:st={(n - 19) / FPS:.3f}:d={19 / FPS:.3f},format=yuv420p[v]")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", a, "-i", b, "-frames:v", str(n), "-filter_complex", fc, "-map", "[v]",
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "14", "-r", "30", out], check=True)
    return out

st = next(s for s in shots if s[2] == "stickers"); stickers_pullback(F(st[1]) - F(st[0]))
# the meme: S0's 4:3 window on the supplied clip (his eyes, the cigarette, the phone), its last frame held to be read
subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "0.5", "-t", "2.0", "-i", MEME, "-vf",
                f"crop=720:540:0:150,scale={CW}:{CH}:flags=lanczos,fps=30,tpad=stop_mode=clone:stop_duration=1.5",
                "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "12", "-pix_fmt", "yuv420p", SRC["meme"][0]], check=True)
with ThreadPoolExecutor(4) as ex:
    segs = list(ex.map(lambda p: render(*p), [(k + 1, *s) for k, s in enumerate(shots)]))
segs.append(breath(len(shots) + 1, bar(11), T0))
open(f"{OUT}/segs.txt", "w").write("".join(f"file '{p}'\n" for p in segs))
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", f"{OUT}/segs.txt", "-c", "copy", f"{OUT}/montage.mp4"], check=True)
nf = subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0",
                     f"{OUT}/montage.mp4"], capture_output=True, text=True).stdout.strip()
print("montage frames", nf, "expected", F(T0) - F(bar(3)), "from frame", F(bar(3)))
