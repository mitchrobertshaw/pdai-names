# pDAI Names launch film, 1:1

[`pdai-names-promo-1x1.mp4`](pdai-names-promo-1x1.mp4): 1080 × 1080, 30 fps, 51.1 s (1,533 frames), H.264 with AAC at
192 kb/s, about 23 MB. The mix is −16.0 LUFS integrated with peaks at −2.3 dBFS, the loudness S0 is mixed to.

It follows [the storyboard](../STORYBOARD.md), changed as asked on 16 Nov 2026: square, a quicker logo, and the
montage's bar 9 left as it is in the film.

**Next:** a new opening for pDAI and peg believers and a voiceover. The options and the timed script are in
[`VO_SCRIPT.md`](VO_SCRIPT.md); the cut is re-timed once the take arrives.

| Bars | Time | What |
|---|---|---|
| 1–2 | 0:00.0 – 0:05.1 | "Pulse believers," / "you were here for all of it." |
| 3–10 | 0:05.1 – 0:25.3 | S0's montage: the same 15 shots, beats and screen treatment, re-rendered for a square frame on 4:3 screens |
| 11 | 0:25.3 – 0:27.8 | S0's strobe on Heart's diamond video, flickering with the empty tunnel from the GIF and landing on it |
| 12–13 | 0:27.8 – 0:32.9 | The logo, one step a beat: the drop on the PulseChain Train, the side view, the freeze, the trace ("the train", "the tunnel"), the snap to the grid, the tunnel turning 90°, the train sliding in, the gradient and the echo ring, the name |
| 14 | 0:32.9 – 0:35.4 | "Next stop" · yourname.pdai |
| 15 | 0:35.4 – 0:38.0 | "Swap your 0x… for a name." A wallet address is struck through and believer.pdai decodes beneath it. "It points to your wallet." |
| 16 | 0:38.0 – 0:40.5 | "Pay with pDAI, PLS or HEX." A checkout card; the coins land on the beats |
| 17 | 0:40.5 – 0:43.0 | "From $10 a year." $10, $15, $17.50, $18.75, $20 for 1 to 5 years, then "Five years for the price of two." |
| 18 | 0:43.0 – 0:45.5 | "Yours, on PulseChain." The on-chain name card flips in. "Nobody can take it. Not even us." |
| 19 | 0:45.5 – 0:48.1 | "Find yours." The site's featured names around the search, believer.pdai typing in |
| 20 + tail | 0:48.1 – 0:51.1 | The lockup, "Your .pdai name on PulseChain", pdai.domains, "Live now on PulseChain · Built on ENSv2" |

## Changes from the storyboard

- **Square.** The montage is re-rendered by [`src/promo_montage.py`](src/promo_montage.py), adapted from S0's
  `ext_montage.py`. Each screen is 4:3 instead of 16:9, and the camera distance is scaled to the frame, so the screens
  tilt as they do in the film. The word search is shown whole in its screen, padded as S0 pads the meme.
- **A quicker logo:** two bars (5.1 s) instead of four. The Đ beat is left out. The two bars this frees go to the
  0x-to-name swap (bar 15) and to the price (bar 17).
- **Bar 9 unchanged:** StoryTeller's post stays, as in the film.
- **The approach comes from the GIF's first take** (frames 27–33, 1.08–1.32 s, mirrored). The take boarded at 4.00 s
  turned out to be a camera pull-back onto a train that barely moves. The freeze is frame 33, traced again by
  [`src/trace_freeze.py`](src/trace_freeze.py).

## Sound

The track is the one bought for S0, Skeler's remix of "Clubbed to Death". It lines up with S0's music to within 5 ms
(cross-correlated in three windows), so S0's grid holds: 95 bpm, bar 1 at 0.056 s, the drop at 27.845 s. The film's
white flash is on frame 835 (27.833 s), and the drop's onset measures 27.848 s.

[`src/music.py`](src/music.py) plays the track from its first note to the downbeat of bar 20 (48.056 s). There it plays
the drop's own first hit again and echoes it out at half beats (316 ms), so the film ends on an instrumental hit and the
vocal section that follows never starts. [`src/sfx.py`](src/sfx.py) synthesizes the effects, 9 dB under the music: a
shutter click on the freeze, shimmers under the traces, the lock, an echoing ping, decode ticks, coin clinks, price
ticks, a card whoosh and key taps. The track itself stays out of the repo, as it does for S0.

## Rebuilding

```bash
PROMO_MUSIC=/path/to/track.mp3 promo/film/src/build.sh /tmp/promo-work
```

It needs ffmpeg, ImageMagick, Python 3 with numpy and Pillow, Node with Playwright, npm, this repo, and pdai-research
on `consolidated-research` with S0's montage sources, the PulseChain Train GIF, the pDAI Conference art and
`token logos/` checked out (paths in `PDAI_NAMES` and `PDAI_REPO`). It takes about four minutes on four cores:

1. frames from the GIF and the trace of the freeze frame;
2. the montage, [`src/promo_montage.py`](src/promo_montage.py);
3. the music and the effects;
4. the scenes, [`src/scenes.py`](src/scenes.py): one page where `render(t)` draws any frame, rendered by
   [`src/render_frames.cjs`](src/render_frames.cjs) in four processes;
5. the mix (two-pass loudnorm) and the picture, [`src/assemble.sh`](src/assemble.sh). `CRF` sets the encode (default 21).
