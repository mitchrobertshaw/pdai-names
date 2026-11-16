# The promo's own scenes as one deterministic page, 1080 x 1080: window.render(t) draws the frame for film time t.
#   bars 1-2   the open                      bars 16  pay with pDAI, PLS or HEX
#   bar 12-13  the train becomes the mark    bar 17   from $10 a year, five years for two
#   bar 14     next stop: yourname.pdai      bar 18   yours, nobody can take it
#   bar 15     swap your 0x... for a name    bar 19   find yours
#   bar 20 + tail: the lockup, echoing out with the music
# (bars 3-11 are the montage, rendered by promo_montage.py). usage: scenes.py ASSETS OUT_HTML
import itertools, json, os, re, sys

A, OUT = sys.argv[1], sys.argv[2]
NAMES = os.environ.get("PDAI_NAMES", "/home/user/pdai-names")
RES = os.environ.get("PDAI_REPO", "/home/user/pdai-research")
url = lambda p: "file://" + os.path.abspath(p).replace(" ", "%20")
TR = json.load(open(f"{A}/trace33.json"))
CX0, CY0, K = 286, 125, 2.4                    # the freeze frame's square window in the mirrored GIF frame
to_px = lambda p: [round((p[0] - CX0) * K, 1), round((p[1] - CY0) * K, 1)]
TRAIN = [to_px(p) for p in TR["train"][::2]] + [to_px(TR["train"][-1])]
ARCH = [to_px(p) for p in TR["arch"][::2]] + [to_px(TR["arch"][-1])]
nose = max(TRAIN, key=lambda p: p[0]); top = min(ARCH, key=lambda p: p[1])

MARK = ("M22.45 9.9H34.268A22.1 22.1 0 0 1 34.268 54.1H22.45A3 3 0 0 1 22.45 48.1H34.268A16.1 16.1 0 0 0 34.268 15.9H22.45A3 3 0 0 1 "
        "22.45 9.9ZM10.632 23.114H34.268A8.886 8.886 0 0 1 34.268 40.886H10.632A3 3 0 0 1 10.632 34.886H34.268A2.886 2.886 0 0 0 "
        "34.268 29.114H10.632A3 3 0 0 1 10.632 23.114Z")
STOPS = [("0", "#00EAFF"), ("0.2525", "#0080FF"), ("0.4974", "#8000FF"), ("0.7499", "#E619E6"), ("0.9991", "#FF0000")]
st = "".join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in STOPS)
def grad(i, x1=46.69, y1=10.13, x2=17.25, y2=53.88): return f'<linearGradient id="{i}" gradientUnits="userSpaceOnUse" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">{st}</linearGradient>'
def mark_svg(i, h, extra=""):
    return (f'<svg {extra} height="{h}" width="{h * 48.736 / 44.2:.1f}" viewBox="7.632 9.9 48.736 44.2"><defs>{grad(i)}</defs>'
            f'<path d="{MARK}" fill="url(#{i})"/></svg>')
_uid = itertools.count()
def logo(path, size):   # a token logo inlined, its ids made unique so several can share the page
    s = open(path).read(); s = s[s.index("<svg"):]; k = f"u{next(_uid)}_"
    s = re.sub(r'id="([^"]+)"', lambda m: f'id="{k}{m.group(1)}"', s).replace("url(#", f"url(#{k}").replace('href="#', f'href="#{k}')
    s = re.sub(r"<svg\b([^>]*?)\swidth=\"[^\"]*\"", r"<svg\1", s, 1); s = re.sub(r"<svg\b([^>]*?)\sheight=\"[^\"]*\"", r"<svg\1", s, 1)
    return s.replace("<svg", f'<svg width="{size}" height="{size}"', 1)
TL = f"{RES}/token logos"
COIN = {k: lambda s, k=k: logo(f"{TL}/{k}.svg", s) for k in ("pDAI", "PLS", "HEX", "PLSX")}
AV = f"{NAMES}/web/src/assets/avatars"
PILLS = [("pdaiconference", "pdai_conference", "#b94bfb", 70, 120), ("yourfriendsommi", "yourfriendsommi", "#33f70f", 560, 70),
         ("cryptogirl", "cryptogirrrl", "#d743ad", 640, 210), ("zkxwallet", "zkxwallet", "#437de9", 60, 270),
         ("nineironcapital", "nineironcapital", "#af750a", 70, 790), ("libertyswap", "libertyswapfi", "#e77529", 600, 830),
         ("coexisteven", "coexisteven", "#e64b2f", 300, 935), ("bluntfullstop", "bluntfullstop", "#f84a0b", 690, 720)]
pills = "".join(f'<div class="pill" id="pill{i}" style="left:{x}px;top:{y}px"><img src="{url(f"{AV}/{a}.jpg")}">{n}<span style="color:{c}">.pdai</span></div>'
                for i, (n, a, c, x, y) in enumerate(PILLS))
GIF = f"{A}/gif"
qimgs = "".join(f'<img class="full gq" id="q{i}" src="{url(f"{GIF}/q{i:02d}.jpg")}">' for i in range(14))
simgs = "".join(f'<img class="full gs" id="s{i}" src="{url(f"{GIF}/s{i:02d}.jpg")}">' for i in range(7))
U, O = 12, 156
C = (O + 34.268 * U, O + 32 * U)
mk = lambda u, v: (round(O + u * U, 1), round(O + v * U, 1))
g1, g2 = mk(46.69, 10.13), mk(17.25, 53.88)
gridlines = "".join(f'<path d="M{O + i * U} {O}V{O + 64 * U}M{O} {O + i * U}H{O + 64 * U}"/>' for i in range(0, 65, 4))
card = f"""<svg width="440" height="440" viewBox="0 0 270 270"><defs><linearGradient id="cg" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#100E2C"/><stop offset="0.55" stop-color="#08071A"/><stop offset="1" stop-color="#1F0B2C"/></linearGradient>{grad('cp')}</defs>
<rect width="270" height="270" fill="url(#cg)"/><path transform="translate(24 24) scale(0.72) translate(-7.632 -9.9)" fill="url(#cp)" d="{MARK}"/>
<text x="246" y="44" text-anchor="end" font-family="SG" font-size="12" font-weight="700" fill="#FFFFFF" fill-opacity="0.9">pDAI Name Service</text>
<text x="24" y="240" font-family="SG" font-size="34" font-weight="700" fill="#FFFFFF">believer.pdai</text></svg>"""
chips = "".join(f'<div class="chip" id="chip{n}">{n}</div>' for n in range(1, 6))
coins = "".join(f'<div class="coin" id="coin{i}">{COIN[k](s)}</div>' for i, (k, s) in enumerate((("pDAI", 112), ("PLS", 96), ("HEX", 92), ("PLSX", 80))))
picks = "".join(f'<span class="pick" id="pick{i}">{COIN[k](40)}<b>{k}</b></span>' for i, k in enumerate(("pDAI", "PLS", "HEX")))

html = f"""<!doctype html><html><head><meta charset="utf-8"><style>
@font-face {{ font-family: "SG"; src: url("{url(f'{A}/fonts/space-grotesk-latin-wght-normal.woff2')}") format("woff2"); font-weight: 300 700; }}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
html, body {{ width: 1080px; height: 1080px; overflow: hidden; background: #08071A; }}
#stage {{ position: relative; width: 1080px; height: 1080px; overflow: hidden; background: #08071A; color: #fff; font-family: "SG", "Inter", sans-serif; }}
.scene {{ position: absolute; inset: 0; display: none; }}
.full {{ position: absolute; left: 0; top: 0; width: 1080px; height: 1080px; }}
.gq, .gs {{ visibility: hidden; }}
.layer {{ position: absolute; inset: 0; }}
.aurora {{ position: absolute; left: -15%; right: -15%; bottom: -330px; height: 600px; filter: blur(80px); opacity: .5;
  background: radial-gradient(28% 60% at 18% 50%, #00EAFF 0%, transparent 70%), radial-gradient(26% 60% at 38% 55%, #0080FF 0%, transparent 70%),
  radial-gradient(26% 60% at 56% 50%, #8000FF 0%, transparent 70%), radial-gradient(24% 60% at 74% 55%, #E619E6 0%, transparent 70%),
  radial-gradient(22% 60% at 90% 50%, #FF0000 0%, transparent 70%); }}
.grain {{ position: absolute; inset: -60px; pointer-events: none; opacity: .06; mix-blend-mode: screen;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='260' height='260'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='260' height='260' filter='url(%23n)'/></svg>"); }}
.ticks {{ position: absolute; inset: 36px; pointer-events: none; }}
.ticks i {{ position: absolute; width: 24px; height: 24px; border: 0 solid rgba(255,255,255,.32); }}
.ticks i:nth-child(1) {{ left: 0; top: 0; border-left-width: 1px; border-top-width: 1px; }}
.ticks i:nth-child(2) {{ right: 0; top: 0; border-right-width: 1px; border-top-width: 1px; }}
.ticks i:nth-child(3) {{ left: 0; bottom: 0; border-left-width: 1px; border-bottom-width: 1px; }}
.ticks i:nth-child(4) {{ right: 0; bottom: 0; border-right-width: 1px; border-bottom-width: 1px; }}
.grad {{ background: linear-gradient(90deg, #00EAFF, #0080FF 25%, #8000FF 50%, #E619E6 75%, #FF0000); -webkit-background-clip: text; background-clip: text; color: transparent; }}
.soft {{ color: #C9C5E8; }}
.c {{ position: absolute; left: 0; right: 0; text-align: center; }}
.h {{ font-weight: 600; letter-spacing: -.025em; line-height: 1.04; }}
.lbl {{ font-family: "Inter", sans-serif; font-weight: 500; color: #C9C5E8; }}
.mono {{ font-family: "JetBrains Mono", monospace; }}
.glass {{ position: absolute; background: rgba(18,17,49,.82); border: 1px solid rgba(255,255,255,.12); border-radius: 30px;
  box-shadow: 0 50px 120px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.08); }}
.btn {{ display: inline-flex; align-items: center; justify-content: center; background: #fff; color: #08071A; border-radius: 999px; font-weight: 650;
  box-shadow: 0 12px 36px -14px rgba(255,255,255,.6); }}
.pill {{ position: absolute; display: inline-flex; align-items: center; gap: 12px; padding: 8px 20px 8px 8px; border-radius: 999px;
  background: rgba(18,17,49,.78); border: 1px solid rgba(255,255,255,.10); font-size: 26px; font-weight: 650; color: #F5F3FF;
  box-shadow: 0 18px 40px rgba(0,0,0,.45); white-space: nowrap; }}
.pill img {{ width: 46px; height: 46px; border-radius: 50%; box-shadow: 0 0 0 3px #121131; }}
.chip {{ width: 92px; height: 66px; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 32px;
  font-weight: 600; background: rgba(255,255,255,.06); color: #C9C5E8; }}
.chip.on {{ background: #fff; color: #08071A; }}
.coin {{ position: absolute; filter: drop-shadow(0 18px 26px rgba(0,0,0,.55)); }}
.pick {{ position: absolute; right: 0; top: 0; display: none; align-items: center; gap: 12px; font-size: 32px; }}
.ch {{ display: inline-block; }}
</style></head><body><div id="stage">
<div class="aurora" id="aurora"></div>

<section class="scene" id="sOpen">
  <div class="c h" id="o1" style="top:392px;font-size:106px">pDAI believers,</div>
  <div class="c soft" id="o2" style="top:540px;font-size:60px;font-weight:500">you held through all of it.</div>
</section>

<section class="scene" id="sDrop">
  <div class="layer" id="gifq">{qimgs}</div>
  <div class="layer" id="gifs">{simgs}</div>
  <div class="layer" id="dim" style="background:#08071A;opacity:0"></div>
  <svg class="full" id="logo" viewBox="0 0 1080 1080">
    <defs>{grad('gTrace', -300, 120, 600, 760)}{grad('gMark', g1[0], g1[1], g2[0], g2[1])}{grad('gRing', 900, 100, 200, 1000)}
      <linearGradient id="gWipe" gradientUnits="userSpaceOnUse" x1="{g1[0]}" y1="{g1[1]}" x2="{g2[0]}" y2="{g2[1]}"><stop id="wipeA" offset="0" stop-color="#fff"/><stop id="wipeB" offset="0" stop-color="#000"/></linearGradient>
      <mask id="wipe" maskUnits="userSpaceOnUse" x="-600" y="-600" width="2280" height="2280"><rect x="-600" y="-600" width="2280" height="2280" fill="url(#gWipe)"/></mask></defs>
    <g id="grid" opacity="0" stroke="rgba(255,255,255,.10)" stroke-width="1.2" fill="none">{gridlines}</g>
    <g id="markG">
      <circle id="echo1" cx="{C[0]:.1f}" cy="{C[1]:.1f}" r="300" fill="none" stroke="url(#gRing)" stroke-width="3" opacity="0"/>
      <circle id="echo2" cx="{C[0]:.1f}" cy="{C[1]:.1f}" r="300" fill="none" stroke="url(#gRing)" stroke-width="2" opacity="0"/>
      <path id="archA" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round" opacity="0"/>
      <path id="trainA" fill="none" stroke="url(#gTrace)" stroke-linecap="round" stroke-linejoin="round" opacity="0"/>
      <path id="archB" fill="none" stroke="url(#gMark)" stroke-linecap="round" stroke-linejoin="round" mask="url(#wipe)" opacity="0"/>
      <path id="trainB" fill="none" stroke="url(#gMark)" stroke-linecap="round" stroke-linejoin="round" mask="url(#wipe)" opacity="0"/>
    </g>
    <g id="lblTrain" opacity="0"><path d="M{nose[0] - 4:.0f} {nose[1] + 14:.0f}L{nose[0] - 44:.0f} {nose[1] + 214:.0f}H{nose[0] - 250:.0f}" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="2"/>
      <text x="{nose[0] - 250:.0f}" y="{nose[1] + 202:.0f}" font-family="Inter, sans-serif" font-size="38" fill="#fff">the train</text></g>
    <g id="lblTunnel" opacity="0"><path d="M{top[0] + 10:.0f} {top[1] - 14:.0f}L{top[0] + 60:.0f} {top[1] - 90:.0f}H{top[0] + 270:.0f}" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="2"/>
      <text x="{top[0] + 70:.0f}" y="{top[1] - 102:.0f}" font-family="Inter, sans-serif" font-size="38" fill="#fff">the tunnel</text></g>
    <text id="name" x="540" y="842" text-anchor="middle" font-family="SG, Inter, sans-serif" font-size="68" fill="#fff" opacity="0"><tspan font-weight="700">pDAI</tspan><tspan font-weight="500"> Name Service</tspan></text>
  </svg>
</section>

<section class="scene" id="sNext">
  <div class="c" id="n1" style="top:388px;display:flex;justify-content:center;align-items:center;gap:16px">{mark_svg('pgN', 40)}<span class="lbl" style="font-size:40px">Next stop</span></div>
  <div class="c h" id="n2" style="top:470px;font-size:120px"></div>
  <div id="n3" style="position:absolute;left:150px;right:150px;top:640px;height:3px;background:linear-gradient(90deg,#00EAFF,#0080FF,#8000FF,#E619E6,#FF0000);transform-origin:50% 50%"></div>
</section>

<section class="scene" id="sSwap">
  <div class="c h" id="w1" style="top:190px;font-size:80px">Swap your 0x…</div>
  <div class="c h soft" id="w2" style="top:280px;font-size:80px">for a name.</div>
  <div class="c mono" id="w3" style="top:500px;font-size:36px;color:rgba(255,255,255,.55)"><span id="addr" style="position:relative;display:inline-block">0x7a3F9e21C4b88d1F…b04Ec91E<span id="strike" style="position:absolute;left:-8px;right:-8px;top:52%;height:3px;background:rgba(255,255,255,.6);transform-origin:0 50%"></span></span></div>
  <div class="c h" id="w4" style="top:580px;font-size:108px;white-space:nowrap"></div>
  <div class="c lbl" id="w5" style="top:790px;font-size:34px">It points to your wallet.</div>
</section>

<section class="scene" id="sPay">
  <div class="c h" id="p1" style="top:130px;font-size:84px">Pay with pDAI,<br>PLS or HEX.</div>
  <div class="glass" id="pcard" style="left:210px;top:470px;width:660px;height:390px;padding:40px">
    <div style="display:flex;align-items:center;gap:16px;font-size:44px;font-weight:600">{mark_svg('pgP', 46)}<span>yourname<span class="grad">.pdai</span></span></div>
    <div style="position:relative;margin-top:36px;height:72px;padding:0 22px;border-radius:18px;background:rgba(255,255,255,.05);display:flex;align-items:center">
      <span class="lbl" style="font-size:28px">Pay with</span><div style="position:absolute;right:22px;top:16px;height:40px;width:200px">{picks}</div></div>
    <div class="btn" style="margin-top:30px;height:84px;width:100%;font-size:34px">Register</div>
  </div>{coins}
</section>

<section class="scene" id="sPrice">
  <div class="c lbl" id="r1" style="top:170px;font-size:44px">From $10 a year.</div>
  <div class="c h" id="r2" style="top:270px;font-size:250px;font-variant-numeric:tabular-nums">$10</div>
  <div class="c lbl" id="r3" style="top:545px;font-size:34px">1 year</div>
  <div class="c" id="r4" style="top:630px;display:flex;justify-content:center;gap:14px">{chips}</div>
  <div class="c h" id="r5" style="top:790px;font-size:50px;font-weight:500">Five years for the price of two.</div>
</section>

<section class="scene" id="sYours">
  <div class="c h" id="y1" style="top:120px;font-size:72px">Yours, on PulseChain.</div>
  <div id="ycardWrap" style="position:absolute;left:320px;top:255px;width:440px;height:440px;perspective:1600px">
    <div id="ycard" style="position:absolute;inset:0;border-radius:30px;overflow:hidden;box-shadow:0 60px 140px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.10)">{card}
      <div id="sheen" style="position:absolute;inset:0;background:linear-gradient(115deg,rgba(255,255,255,0) 30%,rgba(255,255,255,.18) 46%,rgba(255,255,255,0) 60%)"></div></div></div>
  <div class="c h" id="y2" style="top:760px;font-size:56px;font-weight:500">Nobody can take it.</div>
  <div class="c h soft" id="y3" style="top:836px;font-size:56px;font-weight:500">Not even us.</div>
</section>

<section class="scene" id="sFind">
  {pills}
  <div class="c h" id="f1" style="top:395px;font-size:116px">Find yours.</div>
  <div id="f2" style="position:absolute;left:110px;width:860px;top:570px;display:flex;align-items:center;gap:14px;padding:12px 12px 12px 30px;border-radius:999px;border:2px solid transparent;
    background:linear-gradient(rgba(18,17,49,.96),rgba(18,17,49,.96)) padding-box,linear-gradient(90deg,#00EAFF,#0080FF,#8000FF,#E619E6,#FF0000) border-box;box-shadow:0 0 0 10px rgba(255,255,255,.06),0 0 70px rgba(0,200,255,.16)">
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#aca8d2" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
    <div style="flex:1;font-family:Inter,sans-serif;font-size:40px;font-weight:500;color:#F5F3FF;white-space:nowrap"><span id="typed"></span><span id="suffix" style="color:#aca8d2">.pdai</span><span id="caret" style="display:inline-block;width:3px;height:42px;background:#fff;margin-left:3px;vertical-align:-6px"></span></div>
    <div class="btn" id="fbtn" style="height:76px;padding:0 40px;font-size:30px">Search</div>
  </div>
</section>

<section class="scene" id="sEnd">
  <svg class="full" viewBox="0 0 1080 1080"><defs>{grad('gRingE', 900, 100, 200, 1000)}</defs>
    {''.join(f'<circle id="er{i}" cx="540" cy="330" r="120" fill="none" stroke="url(#gRingE)" stroke-width="2.5" opacity="0"/>' for i in range(5))}</svg>
  <div class="c" id="e1" style="top:225px">{mark_svg('pgE', 200)}</div>
  <div class="c" id="e2" style="top:470px;font-size:76px;letter-spacing:-.01em"><b style="font-weight:700">pDAI</b> <span style="font-weight:500">Name Service</span></div>
  <div class="c soft" id="e3" style="top:585px;font-size:38px;font-weight:500">Your <span class="grad">.pdai</span> name on PulseChain</div>
  <div class="c" id="e4" style="top:680px"><span class="btn" style="height:92px;padding:0 60px;font-size:42px">pdai.domains</span></div>
  <div class="c lbl" id="e5" style="top:815px;font-size:26px;font-weight:400">Live now on PulseChain · Built on ENSv2</div>
</section>

<div class="grain" id="grain"></div>
<div class="ticks" id="ticks"><i></i><i></i><i></i><i></i></div>
<div class="layer" id="flash" style="background:#fff;opacity:0"></div>
<div class="layer" id="black" style="background:#000;opacity:0"></div>
</div>
<script>
const BAR = 240 / 95, BEAT = BAR / 4, B1 = 27.845 - 11 * BAR;
const bar = (k) => B1 + (k - 1) * BAR, fr = (s) => Math.round(s * 30) / 30;
const TRAIN = {json.dumps(TRAIN, separators=(",", ":"))}, ARCH = {json.dumps(ARCH, separators=(",", ":"))};
const U = {U}, O = {O}, CX = {C[0]:.3f}, CY = {C[1]:.3f}, N = 160;
const $ = (id) => document.getElementById(id);
const clamp = (x) => Math.max(0, Math.min(1, x)), seg = (t, a, b) => clamp((t - a) / (b - a));
const io = (x) => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2), out3 = (x) => 1 - Math.pow(1 - x, 3);
const back = (x) => {{ const c = 1.7; return x <= 0 ? 0 : x >= 1 ? 1 : 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); }};
const pulse = (t) => {{ const ph = (((t - B1) % BEAT) + BEAT) % BEAT; return Math.exp(-ph * 6); }};
function resample(p, n) {{
  const L = [0]; for (let i = 1; i < p.length; i++) L.push(L[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  const o = []; let j = 0;
  for (let k = 0; k < n; k++) {{ const s = L[L.length - 1] * k / (n - 1); while (j < L.length - 2 && L[j + 1] < s) j++;
    const f = (s - L[j]) / ((L[j + 1] - L[j]) || 1); o.push([p[j][0] + (p[j + 1][0] - p[j][0]) * f, p[j][1] + (p[j + 1][1] - p[j][1]) * f]); }}
  return o;
}}
const line = (a, b, k) => Array.from({{ length: k + 1 }}, (_, i) => [a[0] + (b[0] - a[0]) * i / k, a[1] + (b[1] - a[1]) * i / k]);
const arc = (r, k) => Array.from({{ length: k + 1 }}, (_, i) => {{ const a = -Math.PI / 2 + Math.PI * i / k; return [34.268 + r * Math.cos(a), 32 + r * Math.sin(a)]; }});
const hook = (r, y0, y1, x) => [...line([x, y0], [34.268, y0], 40), ...arc(r, 90).slice(1), ...line([34.268, y1], [x, y1], 40).slice(1)];
const px = ([u, v]) => [O + u * U, O + v * U];
const BOWL = resample(hook(19.1, 12.9, 51.1, 22.45).map(px), N), LOOP = resample(hook(5.886, 26.114, 37.886, 10.632).map(px), N);
const TR = resample(TRAIN, N), AR = resample(ARCH, N);
const rot = (p, d) => {{ const a = d * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return p.map(([x, y]) => [CX + (x - CX) * c - (y - CY) * s, CY + (x - CX) * s + (y - CY) * c]); }};
const shift = (p, du) => p.map(([x, y]) => [x + du * U, y]);
const mix = (a, b, k) => a.map((q, i) => [q[0] + (b[i][0] - q[0]) * k, q[1] + (b[i][1] - q[1]) * k]);
const D = (p) => "M" + p.map((q) => q[0].toFixed(1) + " " + q[1].toFixed(1)).join("L");
const op = (el, v) => {{ el.style.opacity = v.toFixed(3); }};
const opa = (el, v) => el.setAttribute("opacity", v.toFixed(3));
function enter(el, lt, t0, dur = .4, dy = 28, blur = 8) {{   // fade, rise and sharpen in
  const k = out3(seg(lt, t0, t0 + dur)); el.style.opacity = k.toFixed(3);
  el.style.transform = `translateY(${{(1 - k) * dy}}px)`; el.style.filter = k < 1 ? `blur(${{(1 - k) * blur}}px)` : "none";
}}
const HEX = "0123456789abcdef";
const slice = (i) => `background-size:500% 100%;background-position:${{i * 25}}% 0`;   // letter i of ".pdai" shows its fifth of the gradient
const hx = (i, f) => HEX[(i * 7919 + f * 104729 + ((i * f) % 13) * 31) % 16];
let tA, tB, aA, aB, LT, LA;
function ready() {{
  tA = $("trainA"); tB = $("trainB"); aA = $("archA"); aB = $("archB");
  tA.setAttribute("d", D(TRAIN)); aA.setAttribute("d", D(ARCH)); LT = tA.getTotalLength(); LA = aA.getTotalLength();
  $("n2").innerHTML = [..."yourname"].map((c) => `<span class="ch">${{c}}</span>`).join("") + [...".pdai"].map((c, i) => `<span class="ch grad" style="${{slice(i)}}">${{c}}</span>`).join("");
}}
const SCENES = ["sOpen", "sDrop", "sNext", "sSwap", "sPay", "sPrice", "sYours", "sFind", "sEnd"];
function show(id) {{ for (const s of SCENES) $(s).style.display = s === id ? "block" : "none"; }}

function render(t) {{
  const f = Math.round(t * 30);
  $("grain").style.transform = `translate(${{(f * 37) % 60 - 30}}px, ${{(f * 53) % 60 - 30}}px)`;
  op($("flash"), 0); op($("black"), 0); op($("ticks"), 1); op($("aurora"), .42 + .12 * pulse(t));
  if (t < fr(bar(3))) return open(t);
  if (t < fr(bar(14))) return drop(t - bar(12));
  if (t < fr(bar(15))) return next(t - bar(14));
  if (t < fr(bar(16))) return swap(t - bar(15), f);
  if (t < fr(bar(17))) return pay(t - bar(16));
  if (t < fr(bar(18))) return price(t - bar(17));
  if (t < fr(bar(19))) return yours(t - bar(18));
  if (t < fr(bar(20))) return find(t - bar(19), f);
  return end(t - bar(20), t);
}}

function open(t) {{
  show("sOpen"); op($("ticks"), .6); op($("aurora"), .28 + .1 * pulse(t));
  const o1 = $("o1"), o2 = $("o2"); enter(o1, t, bar(1), .55, 30, 10); enter(o2, t, bar(2), .55, 30, 10);
  const p = io(seg(t, bar(2) + 3 * BEAT, fr(bar(3))));
  if (p > 0) for (const el of [o1, o2]) {{
    el.style.transform = `scale(${{1 + .4 * p}})`; el.style.opacity = (1 - p).toFixed(3); el.style.filter = `blur(${{10 * p}}px)`; }}
  op($("flash"), .9 * seg(t, fr(bar(3)) - .16, fr(bar(3))));
}}

function drop(lt) {{
  show("sDrop"); const b = BEAT;
  op($("aurora"), lt < 4 * b ? 0 : .26 * seg(lt, 4 * b, 4.6 * b)); op($("ticks"), seg(lt, 3 * b, 3.3 * b));
  op($("flash"), lt < .1 ? 1 - seg(lt, .03, .1) : (lt >= 2 * b && lt < 2 * b + .09 ? .4 : 0));
  // the GIF: the 3/4 view on the drop, pushing in; the side view (mirrored) on beat 3; freeze on beat 4
  const qi = lt < 2 * b ? Math.min(13, Math.max(0, Math.floor(lt / (2 * b) * 14))) : -1;
  const si = lt >= 2 * b ? Math.min(6, Math.floor((lt - 2 * b) / b * 7)) : -1;
  for (let i = 0; i < 14; i++) $("q" + i).style.visibility = i === qi ? "visible" : "hidden";
  for (let i = 0; i < 7; i++) $("s" + i).style.visibility = i === si ? "visible" : "hidden";
  $("gifq").style.transform = `scale(${{1 + .07 * seg(lt, 0, 2 * b)}})`;
  op($("dim"), lt < 3 * b ? 0 : .5 * seg(lt, 3 * b, 3 * b + .15) + .5 * seg(lt, 4 * b, 4 * b + .22));
  opa($("lblTrain"), seg(lt, 3 * b + .26, 3 * b + .36) * (1 - seg(lt, 4 * b, 4 * b + .12)));
  opa($("lblTunnel"), seg(lt, 3 * b + .4, 3 * b + .5) * (1 - seg(lt, 4 * b, 4 * b + .12)));
  opa($("grid"), .9 * seg(lt, 4 * b, 4 * b + .3) * (1 - seg(lt, 6 * b, 6 * b + .3)));
  let tp, ap;
  if (lt < 4 * b) {{
    tp = TRAIN; ap = ARCH;
    tA.setAttribute("stroke-dasharray", LT); tA.setAttribute("stroke-dashoffset", (LT * (1 - io(seg(lt, 3 * b + .02, 3 * b + .34)))).toFixed(1));
    aA.setAttribute("stroke-dasharray", LA); aA.setAttribute("stroke-dashoffset", (LA * (1 - io(seg(lt, 3 * b + .16, 3 * b + .48)))).toFixed(1));
    opa(tA, lt < 3 * b ? 0 : 1); opa(aA, lt < 3 * b + .16 ? 0 : 1);
  }} else {{
    const m = io(seg(lt, 4 * b + .02, 4 * b + .56)), r = io(seg(lt, 5 * b, 5 * b + .36)), sl = back(seg(lt, 5 * b + .22, 5 * b + .6));
    tp = shift(mix(TR, shift(LOOP, -36), m), 36 * sl);
    ap = mix(AR, rot(BOWL, -90 + 90 * r), m);
    tA.removeAttribute("stroke-dasharray"); aA.removeAttribute("stroke-dasharray");
    opa(tA, 1 - seg(lt, 6 * b + .3, 6 * b + .45)); opa(aA, 1 - seg(lt, 6 * b + .3, 6 * b + .45));
  }}
  const dt = D(tp), da = D(ap);
  for (const [el, d] of [[tA, dt], [tB, dt], [aA, da], [aB, da]]) el.setAttribute("d", d);
  const w = 7 + (6 * U - 7) * io(seg(lt, 6 * b, 6 * b + .2));
  for (const el of [tA, tB, aA, aB]) el.setAttribute("stroke-width", w.toFixed(2));
  opa(tB, lt >= 6 * b ? 1 : 0); opa(aB, lt >= 6 * b ? 1 : 0);
  const p = -.15 + 1.35 * seg(lt, 6 * b + .02, 6 * b + .42);
  $("wipeA").setAttribute("offset", Math.max(0, p).toFixed(3)); $("wipeB").setAttribute("offset", Math.max(0, p + .1).toFixed(3));
  const k1 = seg(lt, 6 * b + .2, 6 * b + 1.3), k2 = seg(lt, 7 * b + .05, 7 * b + 1.15);
  $("echo1").setAttribute("r", (24 * U + 18 * U * out3(k1)).toFixed(1)); opa($("echo1"), lt < 6 * b + .2 ? 0 : .85 * (1 - k1));
  $("echo2").setAttribute("r", (24 * U + 18 * U * out3(k2)).toFixed(1)); opa($("echo2"), lt < 7 * b + .05 ? 0 : .6 * (1 - k2));
  const g = io(seg(lt, 7 * b, 7 * b + .34));
  $("markG").setAttribute("transform", `translate(540 ${{540 - 72 * g}}) scale(${{1 - .16 * g}}) translate(-540 -540)`);
  const nk = out3(seg(lt, 7 * b + .06, 7 * b + .36)); opa($("name"), nk); $("name").setAttribute("transform", `translate(0 ${{(1 - nk) * 24}})`);
}}

function next(lt) {{
  show("sNext"); enter($("n1"), lt, 0, .3, 20, 6);
  const chs = $("n2").querySelectorAll(".ch");
  chs.forEach((c, i) => {{ const k = out3(seg(lt, .06 + i * .035, .06 + i * .035 + .32)); c.style.opacity = k.toFixed(3); c.style.transform = `translateY(${{(1 - k) * 60}}px)`; }});
  const r = io(seg(lt, .5, .95)); $("n3").style.transform = `scaleX(${{r}})`; op($("n3"), .9 * r);
}}

function swap(lt, f) {{
  show("sSwap"); enter($("w1"), lt, 0, .35); enter($("w2"), lt, .08, .35); enter($("w3"), lt, .12, .3, 14, 4);
  const s = io(seg(lt, BEAT, BEAT + .28)); $("strike").style.transform = `scaleX(${{s}})`; $("w3").style.opacity = (out3(seg(lt, .12, .42)) * (1 - .45 * s)).toFixed(3);
  const name = "believer.pdai", t0 = BEAT + .05;
  $("w4").innerHTML = [...name].map((c, i) => {{
    const a = t0 + i * .028, z = t0 + .18 + i * .062;
    if (lt < a) return `<span class="ch" style="opacity:0">${{c}}</span>`;
    if (lt < z) return `<span class="ch mono" style="color:rgba(255,255,255,.45);font-size:.8em">${{hx(i, f)}}</span>`;
    return i >= 8 ? `<span class="ch grad" style="${{slice(i - 8)}}">${{c}}</span>` : `<span class="ch">${{c}}</span>`;
  }}).join("");
  enter($("w5"), lt, 3 * BEAT, .35, 16, 4);
}}

function pay(lt) {{
  show("sPay"); enter($("p1"), lt, 0, .35);
  const ck = out3(seg(lt, .05, .45)); const c = $("pcard"); c.style.opacity = ck.toFixed(3);
  c.style.transform = `perspective(1600px) rotateX(${{(1 - ck) * 18 + 4}}deg) translateY(${{(1 - ck) * 60}}px)`;
  const pos = [[100, 455, -10], [868, 420, 12], [150, 820, -14], [850, 840, 9]];
  pos.forEach(([x, y, r], i) => {{
    const el = $("coin" + i), k = back(seg(lt, i * BEAT, i * BEAT + .32)); el.style.opacity = seg(lt, i * BEAT, i * BEAT + .08).toFixed(3);
    el.style.left = x + "px"; el.style.top = y + "px"; el.style.transform = `translateY(${{(1 - k) * -280}}px) rotate(${{r * k}}deg)`;
  }});
  const which = lt < BEAT ? 0 : lt < 2 * BEAT ? 1 : lt < 3 * BEAT ? 2 : 0;
  for (let i = 0; i < 3; i++) $("pick" + i).style.display = i === which ? "flex" : "none";
}}

function price(lt) {{
  show("sPrice"); enter($("r1"), lt, 0, .3, 18, 4);
  const steps = [[0, 1, "$10"], [BEAT / 2, 2, "$15"], [BEAT, 3, "$17.50"], [1.5 * BEAT, 4, "$18.75"], [2 * BEAT, 5, "$20"]];
  let cur = steps[0]; for (const s of steps) if (lt >= s[0]) cur = s;
  const r2 = $("r2"); r2.textContent = cur[2]; const bump = 1 + .05 * Math.exp(-(lt - cur[0]) * 14); r2.style.transform = `scale(${{bump}})`;
  r2.style.opacity = out3(seg(lt, 0, .2)).toFixed(3);
  $("r3").textContent = cur[1] + (cur[1] === 1 ? " year" : " years"); op($("r3"), out3(seg(lt, 0, .2)));
  for (let n = 1; n <= 5; n++) $("chip" + n).className = "chip" + (n <= cur[1] ? " on" : "");
  enter($("r4"), lt, 0, .3, 18, 4); enter($("r5"), lt, 2 * BEAT, .35, 20, 6);
}}

function yours(lt) {{
  show("sYours"); enter($("y1"), lt, 0, .35);
  const k = back(seg(lt, .02, .5)), drift = seg(lt, .5, 2.5);
  $("ycard").style.transform = `rotateY(${{75 - 85 * k + 6 * drift}}deg) rotateX(6deg)`; op($("ycard"), seg(lt, .02, .12));
  $("sheen").style.transform = `translateX(${{-120 + 240 * io(seg(lt, .55, 1.2))}}%)`;
  enter($("y2"), lt, BEAT, .35, 22, 6); enter($("y3"), lt, 2 * BEAT, .35, 22, 6);
}}

function find(lt, f) {{
  show("sFind"); op($("aurora"), .3 + .1 * pulse(lt + bar(19)));
  for (let i = 0; i < 8; i++) {{
    const el = $("pill" + i), k = out3(seg(lt, .04 * i, .04 * i + .4));
    el.style.opacity = (k * .9).toFixed(3);
    el.style.transform = `translate(${{Math.sin(lt * .9 + i * 1.7) * 10}}px, ${{(1 - k) * 30 + Math.cos(lt * .7 + i) * 8}}px)`;
  }}
  enter($("f1"), lt, 0, .35); enter($("f2"), lt, .1, .35, 20, 4);
  const word = "believer", n = Math.max(0, Math.min(word.length, Math.floor((lt - .3) / .1)));
  $("typed").textContent = word.slice(0, n); $("suffix").style.display = lt > 1.15 ? "inline" : "none";
  $("caret").style.opacity = (f % 16 < 9 || n < word.length) ? "1" : "0";
  const pr = Math.exp(-Math.max(0, lt - 3 * BEAT) * 8) * (lt >= 3 * BEAT ? 1 : 0); $("fbtn").style.transform = `scale(${{1 - .06 * pr}})`;
}}

function end(lt, t) {{
  show("sEnd"); op($("aurora"), .45);
  const k = out3(seg(lt, -.02, .3)); const e1 = $("e1"); e1.style.opacity = k.toFixed(3); e1.style.transform = `scale(${{1.08 - .08 * k}})`;
  enter($("e2"), lt, .06, .35, 20, 6); enter($("e3"), lt, .16, .35, 18, 5); enter($("e4"), lt, .26, .35, 18, 5); enter($("e5"), lt, .36, .35, 14, 4);
  [0, .316, .632, .947, 1.263].forEach((d, i) => {{ const q = seg(lt, d, d + 1.4), el = $("er" + i);
    el.setAttribute("r", (120 + 380 * out3(q)).toFixed(1)); el.setAttribute("opacity", lt < d ? "0" : (.7 * (1 - q) * Math.pow(.78, i)).toFixed(3)); }});
  op($("black"), seg(t, 50.45, 51.07));
}}
window.ready = ready; window.render = render;
</script></body></html>"""
open(OUT, "w").write(html)
print("ok", OUT, len(html), "bytes")
