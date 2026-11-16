# The promo's sound design, synthesized and timed to the picture's cues (the same beat maths as scenes.py), kept well
# under the music: a shutter click on the freeze, two shimmers under the traces, grid ticks, the lock, an echoing ping
# as the gradient floods, decode ticks, coin clinks, price ticks, a card whoosh and key taps. usage: sfx.py OUT.wav
import sys, wave
import numpy as np

SR = 48000; TOTAL = 51.1; N = int(SR * TOTAL)
BAR = 240 / 95; B = BAR / 4; B1 = 27.845 - 11 * BAR
bar = lambda k: B1 + (k - 1) * BAR
rng = np.random.default_rng(7)
L = np.zeros(N); R = np.zeros(N)

def put(sig, t, gain=1.0, pan=0.0):
    i = int(t * SR); n = min(len(sig), N - i)
    if n <= 0: return
    L[i:i + n] += sig[:n] * gain * np.sqrt(0.5 * (1 - pan)); R[i:i + n] += sig[:n] * gain * np.sqrt(0.5 * (1 + pan))
def env(n, a=0.002, d=0.1):          # fast attack, exponential decay
    t = np.arange(n) / SR; return np.minimum(1, t / a) * np.exp(-t / d)
def tone(f, dur, d, a=0.002):
    t = np.arange(int(dur * SR)) / SR; return np.sin(2 * np.pi * f * t) * env(len(t), a, d)
def noise(dur): return rng.standard_normal(int(dur * SR))
def bandpass(x, lo, hi):              # FFT brick-wall band, softened at the edges
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    m = np.clip((f - lo * 0.8) / (lo * 0.2 + 1e-9), 0, 1) * np.clip((hi * 1.2 - f) / (hi * 0.2), 0, 1)
    return np.fft.irfft(X * m, len(x))
def click(d=0.012, lo=2500, hi=9000):
    x = bandpass(noise(0.05), lo, hi); return x * env(len(x), 0.0005, d)
def echo(x, delays=(0.316, 0.632, 0.947, 1.263), decays=(0.5, 0.32, 0.2, 0.12)):
    out = np.zeros(len(x) + int(SR * (max(delays) + 0.05)))
    out[:len(x)] += x
    for dl, g in zip(delays, decays): i = int(dl * SR); out[i:i + len(x)] += x * g
    return out

# the drop: a soft air rush as the train charges
w = bandpass(noise(0.9), 600, 6000); w *= np.sin(np.linspace(0, np.pi, len(w))) ** 2
put(w, bar(12) - 0.25, 0.10, -0.2)
# the freeze, beat 4 of bar 12: a shutter click over a low thump
put(click(0.015, 1800, 9000), bar(12) + 3 * B, 0.55); put(tone(70, 0.25, 0.07), bar(12) + 3 * B, 0.35)
# the traces: two quick rising shimmers, the train's then the tunnel's
for t0, f0, f1, pan in ((bar(12) + 3 * B + 0.02, 1800, 3600, -0.3), (bar(12) + 3 * B + 0.16, 2200, 4400, 0.3)):
    n = int(0.34 * SR); tt = np.arange(n) / SR; f = f0 + (f1 - f0) * (tt / tt[-1]) ** 1.5
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.linspace(0, np.pi, n)) * (0.6 + 0.4 * np.sin(2 * np.pi * 28 * tt))
    put(s, t0, 0.06, pan)
# the grid fades in: four tiny ticks
for i in range(4): put(click(0.004, 4000, 12000), bar(13) + 0.03 + i * 0.07, 0.18, (-1) ** i * 0.4)
# the lock: the train seats in the tunnel at the end of beat 2 of bar 13
t_lock = bar(13) + B + 0.55
put(tone(82, 0.3, 0.06), t_lock, 0.55); put(click(0.01, 1200, 6000), t_lock, 0.6); put(click(0.006, 3000, 10000), t_lock + 0.035, 0.35)
# the gradient floods and the echo ring goes out: a ping that echoes at half beats, like the ending
p = tone(1568, 0.6, 0.18) + 0.5 * tone(2349, 0.6, 0.12)
put(echo(p), bar(13) + 2 * B + 0.2, 0.16)
# swap: the strike across the address, then a tick per letter as the name decodes
s = bandpass(noise(0.26), 1500, 7000) * np.sin(np.linspace(0, np.pi, int(0.26 * SR))) ** 2
put(s, bar(15) + B, 0.07, 0.2)
t0 = bar(15) + B + 0.05
for i in range(13): put(click(0.003, 5000, 14000), t0 + 0.18 + i * 0.062, 0.16, -0.5 + i / 12)
# pay: a coin clink as each coin lands
def clink():
    n = int(0.5 * SR); tt = np.arange(n) / SR
    return sum(a * np.sin(2 * np.pi * f * tt) * np.exp(-tt / d) for f, a, d in ((2380, 1, .16), (3790, .6, .1), (5310, .4, .07), (6950, .25, .05)))
for i, pan in enumerate((-0.6, 0.6, -0.4, 0.5)): put(clink() * env(int(0.5 * SR), 0.001, 1.0), bar(16) + i * B + 0.24, 0.07, pan)
# price: a soft tick, a little higher, at each step from one year to five
for i, (dt, f) in enumerate(((0, 980), (B / 2, 1100), (B, 1240), (1.5 * B, 1390), (2 * B, 1650))):
    put(tone(f, 0.12, 0.035), bar(17) + dt, 0.16 if i < 4 else 0.22)
# yours: the card flips in with a short whoosh; the sheen gets a faint glide
w = bandpass(noise(0.45), 400, 5000) * np.sin(np.linspace(0, np.pi, int(0.45 * SR))) ** 3
put(w, bar(18) + 0.0, 0.12, -0.3)
n = int(0.6 * SR); tt = np.arange(n) / SR
put(np.sin(2 * np.pi * np.cumsum(3000 + 2000 * tt / tt[-1]) / SR) * np.sin(np.linspace(0, np.pi, n)) ** 2, bar(18) + 0.55, 0.025, 0.4)
# find yours: key taps as the name types, then the button
for i in range(8): put(click(0.008, 1500, 7000) * (0.8 + 0.4 * rng.random()), bar(19) + 0.3 + i * 0.1, 0.22, -0.2 + 0.05 * i)
put(click(0.012, 800, 5000), bar(19) + 3 * B, 0.3); put(tone(140, 0.12, 0.03), bar(19) + 3 * B, 0.2)

pk = max(np.abs(L).max(), np.abs(R).max()); print(f"sfx peak {20 * np.log10(pk + 1e-12):.1f} dBFS (before mix)")
st = np.stack([L, R], 1); st = np.clip(st, -1, 1)
with wave.open(sys.argv[1], "wb") as wv:
    wv.setnchannels(2); wv.setsampwidth(2); wv.setframerate(SR); wv.writeframes((st * 32767).astype("<i2").tobytes())
print("sfx", sys.argv[1])
