# Storyboard style frames for the pDAI Names launch film -> panels.html (one 1920x1080 <section> per frame).
# usage: panels.py SCRATCH OUT_HTML
# Brand: navy #08071A, pDAI's five-stop gradient, Space Grotesk; amber text and dashed arrows are direction notes,
# never on screen.
import itertools, json, math, os, re, sys

SP, OUT = sys.argv[1], sys.argv[2]
NAMES = os.environ.get("PDAI_NAMES", "/home/user/pdai-names")
RES = os.environ.get("PDAI_REPO", "/home/user/pdai-research")
TR = json.load(open(f"{SP}/train/trace.json"))
url = lambda p: "file://" + p.replace(" ", "%20")

STOPS = [("0", "#00EAFF"), ("0.2525", "#0080FF"), ("0.4974", "#8000FF"), ("0.7499", "#E619E6"), ("0.9991", "#FF0000")]
def grad(id_, x1=46.69, y1=10.13, x2=17.25, y2=53.88, units="userSpaceOnUse"):
    st = "".join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in STOPS)
    return f'<linearGradient id="{id_}" gradientUnits="{units}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">{st}</linearGradient>'
MARK = ("M22.45 9.9H34.268A22.1 22.1 0 0 1 34.268 54.1H22.45A3 3 0 0 1 22.45 48.1H34.268A16.1 16.1 0 0 0 34.268 15.9H22.45A3 3 0 0 1 "
        "22.45 9.9ZM10.632 23.114H34.268A8.886 8.886 0 0 1 34.268 40.886H10.632A3 3 0 0 1 10.632 34.886H34.268A2.886 2.886 0 0 0 "
        "34.268 29.114H10.632A3 3 0 0 1 10.632 23.114Z")
BOWL = "M22.45 12.9H34.268A19.1 19.1 0 0 1 34.268 51.1H22.45"          # centre lines, 6 thick with round ends = MARK
LOOP = "M10.632 26.114H34.268A5.886 5.886 0 0 1 34.268 37.886H10.632"
_tok = open(f"{NAMES}/web/src/assets/tokens/pdai.svg").read()
DAI_D = next(re.search(r'\sd="([^"]+)"', m).group(1) for m in re.findall(r"<path\b[^>]*>", _tok) if "#FEFEFD" in m)

_uid = itertools.count()
def svg_logo(path):  # inline an SVG file's markup, its ids made unique so several logos can share a page
    s = open(path).read(); s = s[s.index("<svg"):]; k = f"u{next(_uid)}_"
    s = re.sub(r'id="([^"]+)"', lambda m: f'id="{k}{m.group(1)}"', s)
    return s.replace("url(#", f"url(#{k}").replace('href="#', f'href="#{k}')

FONT = f"""
@font-face {{ font-family: "SG"; src: url("{url(SP + '/fonts/package/files/space-grotesk-latin-wght-normal.woff2')}") format("woff2");
  font-weight: 300 700; }}
"""
CSS = FONT + """
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #000; }
.panel { position: relative; width: 1920px; height: 1080px; overflow: hidden; background: #08071A; color: #fff;
  font-family: "SG", "Inter", sans-serif; }
.full { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.grain { position: absolute; inset: 0; pointer-events: none; opacity: .07; mix-blend-mode: screen;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='240' height='240' filter='url(%23n)'/></svg>"); }
.aurora { position: absolute; left: -10%; right: -10%; bottom: -380px; height: 640px; filter: blur(90px); opacity: .55;
  background: radial-gradient(28% 60% at 18% 50%, #00EAFF 0%, transparent 70%), radial-gradient(26% 60% at 38% 55%, #0080FF 0%, transparent 70%),
  radial-gradient(26% 60% at 56% 50%, #8000FF 0%, transparent 70%), radial-gradient(24% 60% at 74% 55%, #E619E6 0%, transparent 70%),
  radial-gradient(22% 60% at 90% 50%, #FF0000 0%, transparent 70%); }
.aurora.top { bottom: auto; top: -420px; opacity: .25; }
.aurora.faint { opacity: .28; }
.ticks { position: absolute; inset: 44px; pointer-events: none; }
.ticks i { position: absolute; width: 26px; height: 26px; border: 0 solid rgba(255,255,255,.28); }
.ticks i:nth-child(1) { left: 0; top: 0; border-left-width: 1px; border-top-width: 1px; }
.ticks i:nth-child(2) { right: 0; top: 0; border-right-width: 1px; border-top-width: 1px; }
.ticks i:nth-child(3) { left: 0; bottom: 0; border-left-width: 1px; border-bottom-width: 1px; }
.ticks i:nth-child(4) { right: 0; bottom: 0; border-right-width: 1px; border-bottom-width: 1px; }
.grad { background: linear-gradient(90deg, #00EAFF, #0080FF, #8000FF, #E619E6, #FF0000); -webkit-background-clip: text;
  background-clip: text; color: transparent; }
.soft { color: #C9C5E8; }
.label { font-family: "Inter", sans-serif; font-weight: 400; font-size: 26px; color: #C9C5E8; letter-spacing: .01em; }
.note { position: absolute; font-family: "JetBrains Mono", monospace; font-weight: 600; font-size: 21px; line-height: 1.35;
  color: #FFC94A; background: rgba(8,7,26,.72); padding: 8px 12px; border: 1px dashed rgba(255,201,74,.7); border-radius: 6px; }
.center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.glass { position: absolute; background: rgba(18,17,49,.78); border: 1px solid rgba(255,255,255,.12); border-radius: 30px;
  box-shadow: 0 50px 120px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.08); backdrop-filter: blur(18px); }
.btn { display: inline-flex; align-items: center; justify-content: center; background: #fff; color: #08071A; border-radius: 999px;
  font-weight: 650; box-shadow: 0 12px 36px -14px rgba(255,255,255,.6); }
.pill { position: absolute; display: inline-flex; align-items: center; gap: 14px; padding: 10px 22px 10px 10px; border-radius: 999px;
  background: rgba(18,17,49,.72); border: 1px solid rgba(255,255,255,.10); font-size: 30px; font-weight: 650; color: #F5F3FF;
  box-shadow: 0 18px 40px rgba(0,0,0,.45); white-space: nowrap; }
.pill img { width: 52px; height: 52px; border-radius: 50%; box-shadow: 0 0 0 3px #121131; }
.coin { position: absolute; filter: drop-shadow(0 18px 30px rgba(0,0,0,.55)); }
.coin svg { width: 100%; height: 100%; }
"""

def ticks(): return '<div class="ticks"><i></i><i></i><i></i><i></i></div>'
def chrome(aurora="", tick=True):
    return (f'<div class="aurora {aurora}"></div>' if aurora is not None else "") + '<div class="grain"></div>' + (ticks() if tick else "")

def stage(unit, cx=960, cy=540):     # mark units -> px: the 64-unit grid centred on (cx, cy)
    return f"translate({cx - 32 * unit} {cy - 32 * unit}) scale({unit})"

panels = []
def P(pid, html): panels.append(f'<section class="panel" id="{pid}">{html}</section>')

# --- P01 · bars 1-2 · the open -------------------------------------------------------------------------------------
P("p01", chrome("faint") + """
<div class="center" style="gap:26px">
  <div style="font-size:150px;font-weight:600;letter-spacing:-.025em;line-height:1">Pulse believers,</div>
  <div class="soft" style="font-size:78px;font-weight:500;letter-spacing:-.01em;opacity:.9">you were here for all of it.</div>
</div>""")

# --- P02 · bars 3-11 · the montage sheet ---------------------------------------------------------------------------
M = f"{SP}/montage"
beats = [("01_riskdiode", "bar 3", "Heart, “risk diode”"), ("02_sommi", "bar 4", "SOMMI, “no accident”"),
         ("03_meme", "bar 5", "“DAI on PulseChain”"), ("04_wordsearch", "bar 6", "word search → HEART COIN"),
         ("05_ams18", "bar 7 · 2 beats", "Maria, Amsterdam"), ("06_astronaut", "bar 7 · 2 beats", "SOMMI’s astronaut"),
         ("07_stickers", "bar 8", "Heart’s stickers post"), ("swap_conference_t", "bar 9 · beat 1", "pDAI Conference (swapped in)"),
         ("09_screen1", "bar 9 · beat 2", "Heart’s screen recording"), ("10_fosdem20", "bar 9 · beat 3", "FOSDEM 2018"),
         ("11_train", "bar 9 · beat 4", "the PulseChain Train"), ("12_zurich1", "bar 10 · beat 1", "Maria, Zürich"),
         ("13_mati", "bar 10 · beat 2", "Mati reads Heart’s post"), ("14_binance", "bar 10 · beat 3", "Binance’s post"),
         ("15_ams24", "bar 10 · beat 4", "Amsterdam"), ("strobe_tunnel_t", "bar 11 · strobe", "Heart’s diamond ↔ the tunnel")]
cells = []
for i, (f, when, what) in enumerate(beats):
    x, y = 60 + (i % 4) * 456, 150 + (i // 4) * 226
    hl = ""
    if f.startswith("swap"): hl = "outline:3px solid #FFC94A;outline-offset:3px;"
    if f == "11_train": hl = "outline:3px solid #E619E6;outline-offset:3px;"
    if f.startswith("strobe"): hl = "outline:3px solid #FFC94A;outline-offset:3px;"
    cells.append(f'<div style="position:absolute;left:{x}px;top:{y}px;width:436px">'
                 f'<img src="{url(M + "/" + f + ".jpg")}" style="width:436px;height:166px;object-fit:cover;border-radius:6px;display:block;{hl}">'
                 f'<div style="display:flex;justify-content:space-between;margin-top:9px;font-family:Inter;font-size:19px">'
                 f'<span style="color:#8f8bb8">{when}</span><span style="color:#E8E5FF">{what}</span></div></div>')
P("p02", '<div class="grain"></div>' + "".join(cells) + """
<div style="position:absolute;left:60px;top:52px;font-size:40px;font-weight:600">Bars 3–11 · the S0 montage, embedded</div>
<div class="label" style="position:absolute;right:60px;top:62px;font-size:22px">0:05.1 → 0:27.8 · 16 shots on the beat · music only</div>
<div class="note" style="left:60px;bottom:30px;font-size:19px">AMBER = CHANGED FOR THE PROMO · MAGENTA = THE TRAIN, PLANTED ONE BEAT BEFORE IT RETURNS</div>""")

# --- P03 · bar 11 · the strobe -------------------------------------------------------------------------------------
P("p03", f"""
<img class="full" src="{url(M + '/enigma_25.60.jpg')}" style="clip-path:inset(0 50% 0 0)">
<img class="full" src="{url(M + '/strobe_tunnel.jpg')}" style="clip-path:inset(0 0 0 50%)">
<div style="position:absolute;left:958px;top:0;bottom:0;width:4px;background:#08071A"></div>
<div class="note" style="left:70px;top:70px">A · HEART'S DIAMOND VIDEO (AS IN S0)</div>
<div class="note" style="left:1030px;top:70px">B · THE EMPTY TUNNEL, FROM THE GIF</div>
<div class="note" style="left:70px;bottom:70px;right:70px;text-align:center">STROBE: A ↔ B EVERY 2 FRAMES, NEAR-SILENT · LANDS ON B · THE TUNNEL WAITS FOR THE DROP</div>""")

# --- P04 · bar 12 beat 1 · the drop --------------------------------------------------------------------------------
P("p04", f"""
<img class="full" src="{url(SP + '/train/f_0.20.png')}" style="object-position:50% 0%;image-rendering:auto">
<div style="position:absolute;inset:0;background:radial-gradient(60% 70% at 55% 55%, rgba(255,255,255,.55), rgba(255,255,255,0) 70%)"></div>
<svg style="position:absolute;inset:0" width="1920" height="1080"><defs><marker id="ah" markerWidth="14" markerHeight="14" refX="7" refY="7" orient="auto">
<path d="M0 0L14 7L0 14z" fill="#FFC94A"/></marker></defs>
<path d="M1500 860 C1200 760 900 620 520 560" fill="none" stroke="#FFC94A" stroke-width="4" stroke-dasharray="14 10" marker-end="url(#ah)"/></svg>
<div class="note" style="left:70px;bottom:70px">THE DROP · WHITE FLASH (2 FRAMES) → THE GIF AT 1× · ITS OWN TITLE STAYS</div>""")

# --- P05 · bar 12 beats 3-4 · side view, freeze --------------------------------------------------------------------
CROP_Y, K = 125, 2.4
P("p05", f"""
<img class="full" src="{url(SP + '/train/m_4.00.png')}" style="object-fit:none;width:800px;height:450px;transform-origin:0 0;
  transform:scale({K});object-position:0 -{CROP_Y}px">
<div style="position:absolute;inset:0;background:radial-gradient(90% 90% at 50% 50%, rgba(8,7,26,0) 55%, rgba(8,7,26,.7) 100%)"></div>
{ticks()}
<div class="note" style="left:70px;top:70px">BEAT 3 · CUT TO THE SIDE VIEW (MIRRORED, TITLE CROPPED OUT)</div>
<div class="note" style="left:70px;bottom:70px">BEAT 4 · FREEZE AS THE NOSE MEETS THE TUNNEL · CORNER TICKS FADE IN</div>""")

# --- P06 · bar 13 · the trace --------------------------------------------------------------------------------------
def poly(pts): return "M" + " L".join(f"{x * K:.1f} {(y - CROP_Y) * K:.1f}" for x, y in pts)
_t = TR["train"]
while _t and _t[-1][0] < 32 and _t[-1][1] > 380: _t = _t[:-1]      # the hull's last corner, round the wheel at the frame's edge
tr, ar = poly(_t), poly(TR["arch"])
nose = max(TR["train"], key=lambda p: p[0]); top = min(TR["arch"], key=lambda p: p[1])
P("p06", f"""
<img class="full" src="{url(SP + '/train/m_4.00.png')}" style="object-fit:none;width:800px;height:450px;transform-origin:0 0;
  transform:scale({K});object-position:0 -{CROP_Y}px;filter:brightness(.42) saturate(.55)">
<svg style="position:absolute;inset:0" width="1920" height="1080"><defs>{grad('tg', 0, 300, 900, 900)}</defs>
<path d="{tr}" fill="none" stroke="url(#tg)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
<path d="{ar}" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="{nose[0] * K:.0f}" cy="{(nose[1] - CROP_Y) * K:.0f}" r="9" fill="#fff"/>
<path d="M{nose[0] * K + 14:.0f} {(nose[1] - CROP_Y) * K + 10:.0f} l60 60 h150" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="1.5"/>
<path d="M{top[0] * K:.0f} {(top[1] - CROP_Y) * K - 12:.0f} l50 -70 h150" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="1.5"/>
</svg>
<div class="label" style="position:absolute;left:{nose[0] * K + 84:.0f}px;top:{(nose[1] - CROP_Y) * K + 34:.0f}px;font-size:34px;color:#fff">the train</div>
<div class="label" style="position:absolute;left:{top[0] * K + 60:.0f}px;top:{(top[1] - CROP_Y) * K - 132:.0f}px;font-size:34px;color:#fff">the tunnel</div>
{ticks()}
<div class="note" style="left:70px;bottom:70px">BEATS 1–2 TRACE THE TRAIN IN THE GRADIENT · BEATS 3–4 TRACE THE TUNNEL · THE CARTOON SINKS TO NAVY</div>""")

# --- P07 · bar 14 beats 1-2 · construction: straighten, turn the tunnel ----------------------------------------------
U = 13.5
grid = "".join(f'<path d="M{i} 0V64M0 {i}H64" stroke="rgba(255,255,255,{.10 if i % 8 == 0 else .04})" stroke-width="{.08 if i % 8 == 0 else .05}"/>' for i in range(0, 65, 2))
P("p07", chrome(None) + f"""
<svg style="position:absolute;inset:0" width="1920" height="1080"><defs><marker id="ah2" viewBox="0 0 8 8" markerWidth="1.5" markerHeight="1.5" refX="4" refY="4" orient="auto" markerUnits="userSpaceOnUse">
<path d="M0 0L8 4L0 8z" fill="#C9C5E8"/></marker></defs>
<g transform="{stage(U)}">{grid}
<circle cx="34.268" cy="32" r="19.1" fill="none" stroke="rgba(201,197,232,.45)" stroke-width=".12" stroke-dasharray=".6 .6"/>
<circle cx="34.268" cy="32" r="5.886" fill="none" stroke="rgba(201,197,232,.35)" stroke-width=".1" stroke-dasharray=".5 .5"/>
<path d="{BOWL}" transform="rotate(-90 34.268 32)" fill="none" stroke="rgba(255,255,255,.6)" stroke-width=".32" stroke-dasharray="1 .7" stroke-linecap="round"/>
<path d="M52.6 20.2 A21.5 21.5 0 0 1 55.3 33.2" fill="none" stroke="#C9C5E8" stroke-width=".18" marker-end="url(#ah2)"/>
<path d="{BOWL}" fill="none" stroke="#fff" stroke-width=".5" stroke-linecap="round"/>
<path d="{LOOP}" transform="translate(-24 0)" fill="none" stroke="url(#tg2)" stroke-width=".55" stroke-linecap="round"/>
<path d="M-17 32H6" stroke="rgba(201,197,232,.5)" stroke-width=".1" stroke-dasharray=".5 .5"/>
<defs>{grad('tg2', -14, 26, 19, 38)}</defs>
</g></svg>
<div class="label" style="position:absolute;left:{528 + 56.6 * U:.0f}px;top:{108 + 22 * U:.0f}px;font-size:30px">90°</div>
<div class="label" style="position:absolute;left:{528 + 34.3 * U + 8:.0f}px;top:{108 + 10.6 * U:.0f}px;font-size:22px">r 19.1</div>
<div class="label" style="position:absolute;left:{528 - 16 * U:.0f}px;top:{108 + 21.4 * U:.0f}px;font-size:24px">the train, straightened</div>
<div class="label" style="position:absolute;left:{528 + 12.2 * U:.0f}px;top:{108 + 47.2 * U:.0f}px;font-size:22px;color:rgba(201,197,232,.7)">the arch, before</div>
<div class="label" style="position:absolute;left:{528 + 30 * U:.0f}px;top:{108 + 1.4 * U:.0f}px;font-size:22px">the tunnel, turned to face it</div>
<div class="note" style="left:70px;bottom:70px">THE TRACES SNAP TO THE 64-UNIT GRID · THE ARCH SWINGS 90° TO FACE THE TRAIN</div>""")

# --- P08 · bar 14 beats 3-4 · the lock, the gradient, even gaps ----------------------------------------------------
dim = [(15.9, 23.114, "7.21"), (29.114, 34.886, "5.77"), (40.886, 48.1, "7.21")]
ext = "".join(f'<path d="M{x0} {y}H2.2" stroke="rgba(201,197,232,.55)" stroke-width=".07" stroke-dasharray=".4 .3"/>'
              for x0, y in ((22.45, 15.9), (7.6, 23.114), (7.6, 29.114), (7.6, 34.886), (7.6, 40.886), (22.45, 48.1)))
chain = "".join(f'<path d="M3 {a + .25}V{b - .25}" stroke="#C9C5E8" stroke-width=".09"/><path d="M2.2 {a}H3.8M2.2 {b}H3.8" stroke="#C9C5E8" stroke-width=".09"/>' for a, b, _ in dim)
P("p08", chrome(None) + f"""
<svg style="position:absolute;inset:0" width="1920" height="1080"><defs>{grad('pg')}
<linearGradient id="wipe" gradientUnits="userSpaceOnUse" x1="46.69" y1="10.13" x2="17.25" y2="53.88">
<stop offset="0" stop-color="#fff"/><stop offset=".6" stop-color="#fff"/><stop offset=".68" stop-color="#000"/></linearGradient>
<mask id="wm" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64"><rect width="64" height="64" fill="url(#wipe)"/></mask></defs>
<g transform="{stage(U)}">{grid}{ext}{chain}
<path d="{MARK}" fill="#fff"/><path d="{MARK}" fill="url(#pg)" mask="url(#wm)"/>
</g></svg>
""" + "".join(f'<div class="label" style="position:absolute;left:{528 + 3.6 * U + 8:.0f}px;top:{108 + (a + b) / 2 * U - 15:.0f}px;font-size:22px">{t}</div>' for a, b, t in dim) + f"""
<div class="label" style="position:absolute;left:{528 + 2.2 * U:.0f}px;top:{108 + 57 * U:.0f}px;font-size:22px">even gaps · 6 thick · round ends</div>
<div class="note" style="left:70px;bottom:70px">BEAT 3 · THE TRAIN GLIDES IN AND LOCKS (CLICK) · BEAT 4 · pDAI'S GRADIENT FLOODS IN, CYAN → RED</div>""")

# --- P09 · bar 15 · the echo, Dai's D, the name --------------------------------------------------------------------
U9 = 9.0; cy9 = 450
rings = "".join(f'<circle cx="34.268" cy="32" r="{r}" fill="none" stroke="url(#rg)" stroke-width="{w}" opacity="{o}"/>'
                for r, w, o in ((27, .22, .55), (33.5, .16, .32), (41, .12, .16)))
P("p09", chrome("faint") + f"""
<svg style="position:absolute;inset:0" width="1920" height="1080"><defs>{grad('pg9')}{grad('rg', 60, 0, 8, 64)}</defs>
<g transform="{stage(U9, 960, cy9)}">{rings}
<path d="{DAI_D}" transform="translate(34.268 32) scale(0.0795) translate(-505 -500)" fill="#fff" opacity=".13"/>
<path d="{MARK}" fill="url(#pg9)"/></g></svg>
<div class="center" style="justify-content:flex-end;padding-bottom:150px">
  <div style="font-size:92px;letter-spacing:-.01em"><b style="font-weight:700">pDAI</b> <span style="font-weight:500">Name Service</span></div>
</div>
<div class="note" style="left:70px;top:70px">BEAT 1 · AN ECHO RING PULSES OUT OF THE TUNNEL</div>
<div class="note" style="right:70px;top:70px;text-align:right">BEATS 2–3 (OPTIONAL) · THE pDAI COIN'S Đ GHOSTS IN:<br>ITS UPRIGHT GOES, ITS TWO LINES BECOME THE TRAIN</div>
<div class="note" style="left:70px;bottom:52px">BEAT 4 · THE NAME</div>""")

# --- P10 · bar 16 · next stop --------------------------------------------------------------------------------------
P("p10", chrome("") + f"""
<div style="position:absolute;left:250px;top:330px">
  <div style="display:flex;align-items:center;gap:18px">
    <svg width="44" height="40" viewBox="7.632 9.9 48.736 44.2"><defs>{grad('pg10')}</defs><path d="{MARK}" fill="url(#pg10)"/></svg>
    <span class="label" style="font-size:38px;font-weight:500;color:#C9C5E8">Next stop</span></div>
  <div style="margin-top:34px;font-family:'JetBrains Mono';font-size:54px;color:rgba(255,255,255,.30);position:relative;display:inline-block">
    0x7a3F9e21…b04Ec91E<div style="position:absolute;left:-6px;right:-6px;top:52%;height:3px;background:rgba(255,255,255,.45)"></div></div>
  <div style="margin-top:6px;font-size:190px;font-weight:600;letter-spacing:-.03em;line-height:1.05">yourname<span class="grad">.pdai</span></div>
</div>
<div class="note" style="left:70px;bottom:70px">THE ADDRESS DECODES LETTER BY LETTER INTO THE NAME (HEX DIGITS CYCLE, THEN RESOLVE)</div>""")

# --- P11 · bar 17 · pay with what you hold -------------------------------------------------------------------------
TL = f"{RES}/token logos"
coins = [("pDAI.svg", 1430, 150, 150, -8), ("PLS.svg", 1700, 380, 118, 10), ("HEX.svg", 1180, 790, 112, -12), ("PLSX.svg", 1660, 800, 96, 8)]
cz = "".join(f'<div class="coin" style="left:{x}px;top:{y}px;width:{s}px;height:{s}px;transform:rotate({r}deg)">{svg_logo(TL + "/" + f)}</div>' for f, x, y, s, r in coins)
P("p11", chrome("") + f"""
<div style="position:absolute;left:150px;top:300px;width:900px">
  <div style="font-size:112px;font-weight:600;letter-spacing:-.025em;line-height:1.02">Pay with pDAI,<br>PLS or HEX.</div>
  <div class="label" style="margin-top:40px;font-size:40px;line-height:1.35">From $10 a year.<br><span style="color:#fff">Five years for the price of two.</span></div>
</div>
<div class="glass" style="left:1130px;top:250px;width:600px;height:560px;padding:44px;transform:perspective(1600px) rotateY(-14deg) rotateX(4deg)">
  <div style="display:flex;align-items:center;gap:16px;font-size:44px;font-weight:600">
    <svg width="50" height="46" viewBox="7.632 9.9 48.736 44.2"><defs>{grad('pg11')}</defs><path d="{MARK}" fill="url(#pg11)"/></svg>
    <span>yourname<span class="grad">.pdai</span></span></div>
  <div class="label" style="margin-top:34px;font-size:24px">Years</div>
  <div style="display:flex;gap:10px;margin-top:12px">{''.join(f'<div style="flex:1;height:58px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:600;{"background:#fff;color:#08071A" if n == 5 else "background:rgba(255,255,255,.06);color:#C9C5E8"}">{n}</div>' for n in range(1, 6))}</div>
  <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:30px">
    <span class="label" style="font-size:26px">Total</span><span style="font-size:52px;font-weight:600">$20</span></div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:22px;padding:14px 18px;border-radius:16px;background:rgba(255,255,255,.05)">
    <span class="label" style="font-size:24px">Pay with</span>
    <span style="display:flex;align-items:center;gap:12px;font-size:30px;font-weight:600"><span style="width:38px;height:38px;display:inline-block">{svg_logo(TL + '/pDAI.svg').replace('<svg', '<svg width="38" height="38"', 1)}</span>pDAI ▾</span></div>
  <div class="btn" style="margin-top:28px;height:72px;width:100%;font-size:30px">Register</div>
</div>{cz}
<div class="note" style="left:70px;bottom:70px">COINS DROP IN ON THE BEAT · THE TOKEN PICKER FLICKS pDAI → PLS → HEX → pDAI</div>""")

# --- P12 · bar 18 · yours ------------------------------------------------------------------------------------------
card = f"""<svg width="560" height="560" viewBox="0 0 270 270"><defs><linearGradient id="cg" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#100E2C"/><stop offset="0.55" stop-color="#08071A"/><stop offset="1" stop-color="#1F0B2C"/></linearGradient>
{grad('cp')}</defs><rect width="270" height="270" fill="url(#cg)"/>
<path transform="translate(24 24) scale(0.72) translate(-7.632 -9.9)" fill="url(#cp)" d="{MARK}"/>
<text x="246" y="44" text-anchor="end" font-family="SG" font-size="12" font-weight="700" fill="#FFFFFF" fill-opacity="0.9">pDAI Name Service</text>
<text x="24" y="240" font-family="SG" font-size="34" font-weight="700" fill="#FFFFFF">believer.pdai</text></svg>"""
P("p12", chrome("") + f"""
<div style="position:absolute;left:150px;top:330px;width:900px">
  <div style="font-size:108px;font-weight:600;letter-spacing:-.025em;line-height:1.02">Yours,<br>on PulseChain.</div>
  <div style="margin-top:44px;font-size:56px;font-weight:500;line-height:1.2">Nobody can take it.<br><span class="soft">Not even us.</span></div>
</div>
<div style="position:absolute;left:1170px;top:250px;width:560px;height:560px;border-radius:34px;overflow:hidden;
  transform:perspective(1800px) rotateY(-20deg) rotateX(7deg) rotateZ(2deg);box-shadow:0 60px 140px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.10)">
  {card}<div style="position:absolute;inset:0;background:linear-gradient(115deg,rgba(255,255,255,0) 30%,rgba(255,255,255,.16) 46%,rgba(255,255,255,0) 60%)"></div></div>
<div class="note" style="left:70px;bottom:70px">THE ON-CHAIN NAME CARD (THE REAL SVG) FLIPS IN · A SHEEN SWEEPS IT</div>""")

# --- P13 · bar 19 · find yours -------------------------------------------------------------------------------------
AV = f"{NAMES}/web/src/assets/avatars"
pills = [("pdaiconference", "pdai_conference", "#b94bfb", 170, 170, .95), ("yourfriendsommi", "yourfriendsommi", "#33f70f", 1210, 140, 1),
         ("nineironcapital", "nineironcapital", "#af750a", 120, 790, .9), ("libertyswap", "libertyswapfi", "#e77529", 1350, 330, .85),
         ("coexisteven", "coexisteven", "#e64b2f", 1290, 820, .95), ("zkxwallet", "zkxwallet", "#437de9", 300, 330, .8),
         ("bluntfullstop", "bluntfullstop", "#f84a0b", 700, 900, .85), ("cryptogirl", "cryptogirrrl", "#d743ad", 640, 120, .8)]
pz = "".join(f'<div class="pill" style="left:{x}px;top:{y}px;opacity:{o}"><img src="{url(AV + "/" + a + ".jpg")}">{n}<span style="color:{c}">.pdai</span></div>' for n, a, c, x, y, o in pills)
P("p13", chrome("faint") + pz + """
<div class="center" style="gap:46px">
  <div style="font-size:132px;font-weight:600;letter-spacing:-.025em">Find yours.</div>
  <div style="display:flex;align-items:center;gap:16px;width:960px;padding:12px 12px 12px 34px;border-radius:999px;border:2px solid transparent;
    background:linear-gradient(rgba(18,17,49,.96),rgba(18,17,49,.96)) padding-box,linear-gradient(90deg,#00EAFF,#0080FF,#8000FF,#E619E6,#FF0000) border-box;
    box-shadow:0 0 0 10px rgba(255,255,255,.06),0 0 70px rgba(0,200,255,.16)">
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#aca8d2" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
    <div style="flex:1;text-align:left;font-family:Inter;font-size:42px;font-weight:500;color:#F5F3FF">believer<span style="color:#aca8d2">.pdai</span><span style="display:inline-block;width:3px;height:44px;background:#fff;margin-left:4px;vertical-align:-6px"></span></div>
    <div class="btn" style="height:78px;padding:0 44px;font-size:32px">Search</div>
  </div>
</div>
<div class="note" style="left:70px;bottom:40px">THE SITE'S FEATURED NAMES DRIFT IN (RESERVED FOR THEIR OWNERS) · THE NAME TYPES ITSELF</div>""")

# --- P14 · bar 20 · the lockup and CTA -----------------------------------------------------------------------------
P("p14", chrome("") + f"""
<svg style="position:absolute;inset:0" width="1920" height="1080"><defs>{grad('rg14', 60, 0, 8, 64)}</defs>
<g transform="translate(578 268) scale(5.4)" opacity=".5">{"".join(f'<circle cx="34.268" cy="32" r="{r}" fill="none" stroke="url(#rg14)" stroke-width="{w}" opacity="{o}"/>' for r, w, o in ((30, .16, .5), (38, .12, .3), (47, .09, .15)))}</g></svg>
<div class="center" style="gap:40px;padding-top:30px">
  <div style="display:flex;align-items:center;gap:44px">
    <svg height="140" viewBox="7.632 9.9 48.736 44.2" width="{140 * 48.736 / 44.2:.1f}"><defs>{grad('pg14')}</defs><path d="{MARK}" fill="url(#pg14)"/></svg>
    <div style="font-size:90px;letter-spacing:-.01em"><b style="font-weight:700">pDAI</b> <span style="font-weight:500">Name Service</span></div></div>
  <div class="soft" style="font-size:46px;font-weight:500">Your <span class="grad">.pdai</span> name on PulseChain</div>
  <div class="btn" style="height:96px;padding:0 64px;font-size:42px;margin-top:10px">pdai.domains</div>
  <div class="label" style="font-size:26px;margin-top:4px">Live now on PulseChain · Built on ENSv2</div>
</div>
<div class="note" style="left:70px;bottom:52px">THE LAST HIT ECHOES OUT (DELAY TAIL, ~3 s) · HOLD TO BLACK</div>""")

html = f"<!doctype html><html><head><meta charset='utf-8'><style>{CSS}</style></head><body>{''.join(panels)}</body></html>"
open(OUT, "w").write(html)
print("panels", len(panels), "->", OUT)
