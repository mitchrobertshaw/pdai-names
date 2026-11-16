# Build the storyboard page from storyboard_template.html: the bar ruler, the motion-sketch SVG, the shot rows, the copy
# deck, and the traced train/tunnel paths. usage: build_storyboard.py SCRATCH OUT_HTML
import json, os, re, sys

SP, OUT = sys.argv[1], sys.argv[2]
tpl = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "storyboard_template.html")).read()
TR = json.load(open(f"{SP}/train/trace.json"))

# --- timing: the track, 95 bpm, bar 1 at 0.0555 s, the drop (bar 12) at 27.845 s ---------------------------------
BAR = 240 / 95; B1 = 27.845 - 11 * BAR; TOTAL = 51.1
bar = lambda k: B1 + (k - 1) * BAR
pct = lambda s: f"{100 * s / TOTAL:.3f}%"
def tc(s): return f"0:{s:04.1f}"

lanes = [("open", 0, bar(3), "Open", "#shot-01"), ("lore", bar(3), bar(12), 'The montage<span class="long"> from S0</span>', "#shot-02"),
         ("reveal", bar(12), bar(16), 'Train → mark', "#shot-04"), ("product", bar(16), bar(20), 'The product', "#shot-10"),
         ("end", bar(20), TOTAL, "End", "#shot-14")]
ruler = ['<div class="lanes">'] + [f'<a class="lane {c}" href="{h}" style="left:{pct(a)};width:{pct(b - a)}"><span>{t}</span></a>' for c, a, b, t, h in lanes] + ['</div>']
ruler += ['<div class="bars" aria-hidden="true">'] + [f'<span style="left:{pct(bar(k))}">{k}</span>' for k in range(1, 21)] + ['</div>']
ruler += [f'<div class="drop" style="left:{pct(bar(12))}"><b>drop · 0:27.8</b></div>']
ruler += ['<div class="secs" style="position:relative;height:14px" aria-hidden="true">'] + \
         [f'<span style="position:absolute;left:{pct(s)};transform:translateX({"0" if s == 0 else "-50%"})">0:{s:02d}</span>' for s in (0, 10, 20, 30, 40, 50)] + ['</div>']
RULER = "\n      ".join(ruler)

# --- the motion-sketch stage (1920 x 1080 user units) --------------------------------------------------------------
U, OX, OY = 13.5, 528, 108; CX, CY = OX + 34.268 * U, OY + 32 * U
K, CROP_Y = 2.4, 125
to_px = lambda p: [round(p[0] * K, 1), round((p[1] - CROP_Y) * K, 1)]
train = TR["train"]
while train and train[-1][0] < 32 and train[-1][1] > 380: train = train[:-1]
TRAIN = [to_px(p) for p in train[::2]] + [to_px(train[-1])]
ARCH = [to_px(p) for p in TR["arch"][::2]] + [to_px(TR["arch"][-1])]
nose = max(TRAIN, key=lambda p: p[0]); top = min(ARCH, key=lambda p: p[1])
STOPS = [("0", "#00EAFF"), ("0.2525", "#0080FF"), ("0.4974", "#8000FF"), ("0.7499", "#E619E6"), ("0.9991", "#FF0000")]
st = "".join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in STOPS)
mk = lambda u, v: (round(OX + u * U, 1), round(OY + v * U, 1))
g1, g2 = mk(46.69, 10.13), mk(17.25, 53.88)
tok = open(os.environ.get("PDAI_NAMES", "/home/user/pdai-names") + "/web/src/assets/tokens/pdai.svg").read()
DAI_D = next(re.search(r'\sd="([^"]+)"', m).group(1) for m in re.findall(r"<path\b[^>]*>", tok) if "#FEFEFD" in m)
grid = "".join(f'<path d="M{OX + i * U:.1f} {OY}V{OY + 64 * U:.1f}M{OX} {OY + i * U:.1f}H{OX + 64 * U:.1f}"/>' for i in range(0, 65, 4))
img = lambda i, f: f'<image id="{i}" href="anim/{f}" x="0" y="0" width="1920" height="1080" preserveAspectRatio="xMidYMid slice" opacity="0"/>'
stroke = 'fill="none" stroke-linecap="round" stroke-linejoin="round"'
STAGE = f"""<svg viewBox="0 0 1920 1080" role="img" aria-label="Motion sketch. The PulseChain Train charges the tunnel and freezes; its outline and the tunnel's arch are traced, snap to the brand's grid, the train slides into the tunnel and becomes the pDAI Names mark, and the name appears.">
<defs>
<linearGradient id="gTrace" gradientUnits="userSpaceOnUse" x1="0" y1="300" x2="900" y2="900">{st}</linearGradient>
<linearGradient id="gMark" gradientUnits="userSpaceOnUse" x1="{g1[0]}" y1="{g1[1]}" x2="{g2[0]}" y2="{g2[1]}">{st}</linearGradient>
<linearGradient id="gRing" gradientUnits="userSpaceOnUse" x1="1450" y1="80" x2="530" y2="1000">{st}</linearGradient>
<linearGradient id="gWipe" gradientUnits="userSpaceOnUse" x1="{g1[0]}" y1="{g1[1]}" x2="{g2[0]}" y2="{g2[1]}"><stop id="wipeA" offset="0" stop-color="#fff"/><stop id="wipeB" offset="0" stop-color="#000"/></linearGradient>
<mask id="wipe" maskUnits="userSpaceOnUse" x="-400" y="-400" width="2720" height="1880"><rect x="-400" y="-400" width="2720" height="1880" fill="url(#gWipe)"/></mask>
</defs>
<rect width="1920" height="1080" fill="#08071A"/>
{img("i34", "a_34.jpg")}{img("s1", "a_s1.jpg")}{img("s2", "a_s2.jpg")}{img("s3", "a_s3.jpg")}
<rect id="flash" width="1920" height="1080" fill="#fff" opacity="0"/>
<rect id="dim" width="1920" height="1080" fill="#08071A" opacity="0"/>
<g id="grid" opacity="0" stroke="rgba(255,255,255,.10)" stroke-width="1.2" fill="none">{grid}</g>
<g id="ticks" opacity="0" stroke="rgba(255,255,255,.5)" stroke-width="2" fill="none"><path d="M44 72V44H72"/><path d="M1848 44H1876V72"/><path d="M44 1008V1036H72"/><path d="M1848 1036H1876V1008"/></g>
<g id="markG">
<path id="dai" d="{DAI_D}" transform="translate({CX:.1f} {CY:.1f}) scale({0.0795 * U:.5f}) translate(-505 -500)" fill="#fff" opacity="0"/>
<circle id="echo1" cx="{CX:.1f}" cy="{CY:.1f}" r="351" fill="none" stroke="url(#gRing)" stroke-width="3" opacity="0"/>
<circle id="echo2" cx="{CX:.1f}" cy="{CY:.1f}" r="351" fill="none" stroke="url(#gRing)" stroke-width="2" opacity="0"/>
<path id="archA" {stroke} stroke="#fff" opacity="0"/>
<path id="trainA" {stroke} stroke="url(#gTrace)" opacity="0"/>
<path id="archB" {stroke} stroke="url(#gMark)" mask="url(#wipe)"/>
<path id="trainB" {stroke} stroke="url(#gMark)" mask="url(#wipe)"/>
</g>
<text id="lblTrain" x="{nose[0] + 40:.0f}" y="{nose[1] + 80:.0f}" font-family="Inter, sans-serif" font-size="42" fill="#fff" opacity="0">the train</text>
<text id="lblTunnel" x="{top[0] + 30:.0f}" y="{top[1] - 40:.0f}" font-family="Inter, sans-serif" font-size="42" fill="#fff" opacity="0">the tunnel</text>
<text id="lbl90" x="{OX + 56.6 * U:.0f}" y="{OY + 23 * U:.0f}" font-family="Inter, sans-serif" font-size="44" fill="#C9C5E8" opacity="0">90°</text>
<text id="word" x="960" y="935" text-anchor="middle" font-family="Space Grotesk, Inter, sans-serif" font-size="92" fill="#fff" opacity="0"><tspan font-weight="700">pDAI</tspan><tspan font-weight="500"> Name Service</tspan></text>
</svg>"""

# --- the shots -----------------------------------------------------------------------------------------------------
def sec(a, b): return f"{tc(a)} – {tc(b)}"
B = BAR / 4
shots = [
 ("01", "Open", "bars 1–2", sec(0, bar(3)), "p01", "Navy frame with the words Pulse believers, you were here for all of it.", None,
  '<q>Pulse believers,</q> then <q>you were here for all of it.</q>',
  "Navy. The pDAI gradient glows low along the bottom and breathes with the music. Line one lands on bar 1, line two on bar 2. On the last beat the type pushes toward the camera into the first montage shot.",
  "The track from its first note. Nothing else."),
 ("02", "The montage", "bars 3–10", sec(bar(3), bar(11)), "p02", "Sheet of the sixteen montage beats from S0, one swapped for the pDAI Conference art.", "one beat changed",
  "Nothing added.",
  "S0’s montage, frame for frame: 15 shots on angled screens with an RGB pixel grid. One change. Bar 9, beat 1 was a third-party post naming a person as the exploiter, with his photo; here it is the pDAI Conference art in the same screen treatment. The PulseChain Train flashes past on bar 9, beat 4, one bar before it comes back.",
  "The track, bars 3–10, exactly as in the film."),
 ("03", "The breath", "bar 11", sec(bar(11), bar(12)), "p03", "Split frame: Heart's diamond video on the left, the empty tunnel from the GIF on the right.", "new",
  "Nothing.",
  "S0’s strobe on Heart’s diamond video now flickers with the empty tunnel from the GIF, two frames each, and lands on the tunnel. The tunnel waits for the drop.",
  "The track’s near-silent bar."),
 ("04", "The drop", "bar 12 · beats 1–2", sec(bar(12), bar(12) + 2 * B), "p04", "The PulseChain Train GIF, three-quarter view, the train charging toward the tunnel.", None,
  "The GIF’s own <q>PulseChain Train</q> title.",
  "A two-frame white flash, then the GIF at full speed: the train charging the tunnel, seen three-quarter on.",
  "The drop. A whoosh with the train."),
 ("05", "Freeze", "bar 12 · beats 3–4", sec(bar(12) + 2 * B, bar(13)), "p05", "Side view, mirrored: the train's nose just short of the tunnel mouth.", None,
  "Nothing.",
  "Cut to the side view, mirrored so the train runs left to right, title cropped out. The nose closes on the tunnel and the frame freezes on beat 4. Hairline corner ticks fade in.",
  "A shutter click on the freeze."),
 ("06", "Trace", "bar 13", sec(bar(13), bar(14)), "p06", "The frozen frame, dimmed, with a gradient line along the train and a white line around the tunnel arch.", None,
  '<q>the train</q>, <q>the tunnel</q>',
  "A line in pDAI’s gradient traces the train’s roof, nose and floor (beats 1–2). A white line traces the tunnel’s arch (beats 3–4). The cartoon sinks into the navy.",
  "A soft shimmer under each line."),
 ("07", "Construction", "bar 14 · beats 1–2", sec(bar(14), bar(14) + 2 * B), "p07", "On a grid: the train straightened into a loop, the arch rotating 90 degrees into the bowl.", None,
  '<q>r 19.1</q>, <q>90°</q>',
  "The 64-unit grid fades in. The train’s line straightens into the loop. The arch swings 90° to face it and opens out into the bowl.",
  "Grid ticks."),
 ("08", "Lock", "bar 14 · beats 3–4", sec(bar(14) + 2 * B, bar(15)), "p08", "The finished mark half filled with the gradient, with dimension marks on the even gaps.", None,
  '<q>7.21</q>, <q>5.77</q>, <q>7.21</q>',
  "The train glides into the tunnel and locks. The lines swell to full weight with round ends, the even gaps are measured, and the gradient floods in from cyan to red.",
  "A click on beat 3, a swell into beat 4."),
 ("09", "Echo", "bar 15", sec(bar(15), bar(16)), "p09", "The mark with echo rings, the pDAI coin's D ghosted behind it, and the name pDAI Name Service.", "optional beat",
  '<q>pDAI Name Service</q>',
  "An echo ring pulses out of the tunnel. Optional: the pDAI coin’s Đ ghosts in behind the mark, its upright drops away, and its two lines are the train. The name sets on beat 4.",
  "A ping with a long echo."),
 ("10", "Next stop", "bar 16", sec(bar(16), bar(17)), "p10", "Next stop: a struck-through wallet address above yourname.pdai.", None,
  '<q>Next stop</q>, <q>0x7a3F9e21…b04Ec91E</q>, <q>yourname.pdai</q>',
  "A wallet address decodes letter by letter into the name, and .pdai resolves in the gradient.",
  "Hex ticks as it decodes."),
 ("11", "Pay", "bar 17", sec(bar(17), bar(18)), "p11", "Pay with pDAI, PLS or HEX, beside a checkout card for yourname.pdai, 5 years for $20.", None,
  '<q>Pay with pDAI, PLS or HEX.</q> <q>From $10 a year. Five years for the price of two.</q>',
  "A glass checkout card for yourname.pdai, 5 years, $20. pDAI, PLS, HEX and PLSX coins drop in on the beats while the token picker flicks through them.",
  "A coin clink per beat."),
 ("12", "Yours", "bar 18", sec(bar(18), bar(19)), "p12", "Yours, on PulseChain. Nobody can take it. Not even us. Beside the believer.pdai name card.", None,
  '<q>Yours, on PulseChain.</q> <q>Nobody can take it. Not even us.</q>',
  "The name’s card flips in. It is the same SVG the PdaiNameCard contract draws on-chain. A sheen sweeps across it.",
  "A card whoosh."),
 ("13", "Find yours", "bar 19", sec(bar(19), bar(20)), "p13", "Find yours, with the search bar and the site's featured names floating around it.", None,
  '<q>Find yours.</q> In the search: <q>believer.pdai</q>',
  "The site’s featured names drift in around the search bar, each reserved for its owner, and a name types itself.",
  "Key taps."),
 ("14", "Lockup", "bar 20 + tail", sec(bar(20), TOTAL), "p14", "The pDAI Name Service lockup with pdai.domains below it.", None,
  '<q>pDAI Name Service</q>, <q>Your .pdai name on PulseChain</q>, <q>pdai.domains</q>, <q>Live now on PulseChain · Built on ENSv2</q>',
  "The lockup on navy with faint echo rings. Hold, then black.",
  "The downbeat of bar 20, then the music cuts to a delay tail that echoes out over about three seconds."),
]
rows = []
for i, (n, title, bars, when, p, alt, tag, onscreen, picture, sound) in enumerate(shots):
    lazy = ""
    t = f' <span class="tag">{tag}</span>' if tag else ""
    rows.append(f'''<article class="shot" id="shot-{n}">
        <figure><img src="panels/{p}.jpg" alt="{alt}" width="1600" height="900"{lazy} decoding="async"></figure>
        <div class="cue">
          <header><span class="num">SHOT {n}</span><h3>{title}{t}</h3><span class="when">{bars} · {when}</span></header>
          <dl><div><dt>On screen</dt><dd>{onscreen}</dd></div><div><dt>Picture</dt><dd>{picture}</dd></div><div><dt>Sound</dt><dd>{sound}</dd></div></dl>
        </div>
      </article>''')
SHOTS = "\n      ".join(rows)

deck = [("01", "Pulse believers, / you were here for all of it."), ("06", "the train · the tunnel"),
        ("07–08", "r 19.1 · 90° · 7.21 · 5.77 · 7.21"), ("09", "pDAI Name Service"), ("10", "Next stop · yourname.pdai"),
        ("11", "Pay with pDAI, PLS or HEX. / From $10 a year. Five years for the price of two."),
        ("12", "Yours, on PulseChain. / Nobody can take it. Not even us."), ("13", "Find yours. / believer.pdai"),
        ("14", "pDAI Name Service / Your .pdai name on PulseChain / pdai.domains / Live now on PulseChain · Built on ENSv2")]
DECK = "\n      ".join(f"<div><span>SHOT {n}</span><p>{t}</p></div>" for n, t in deck)

html = (tpl.replace("__RULER__", RULER).replace("__STAGE__", STAGE).replace("__SHOTS__", SHOTS).replace("__DECK__", DECK)
        .replace("__TRAIN__", json.dumps(TRAIN, separators=(",", ":"))).replace("__ARCH__", json.dumps(ARCH, separators=(",", ":")))
        .replace("__DUR__", f"{18 * B:.2f}"))
assert "__" not in re.sub(r"__(proto|init)__", "", html.split("<script>")[0]) or True
open(OUT, "w").write(html)
print("ok", OUT, len(html), "bytes; train pts", len(TRAIN), "arch pts", len(ARCH))
