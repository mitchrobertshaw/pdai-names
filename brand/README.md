# pDAI Name Service brand

The mark is **Echo**: Dai's D with its upright taken away, and Dai's two lines joined into a loop
inside it, like a lookup that goes in and comes back with the answer. It's drawn in pDAI's own
gradient. Beside it, the wordmark reads **pDAI Name Service**, in white.

Every file is a single filled shape (no strokes), so it scales cleanly from a 16px favicon to a
billboard, in a browser or in any design tool.

## Files

| File | Use it for |
| --- | --- |
| `pdains-mark.svg` | The mark in colour, cropped tight. The default. |
| `pdains-mark-square.svg` | The mark in colour, centred in a square (avatars, favicons). |
| `pdains-mark-white.svg` | One colour, on dark backgrounds or photos. |
| `pdains-mark-black.svg` | One colour, navy, on light backgrounds. |
| `pdains-app-icon.svg` / `-1024.png` | App icon: the mark in colour on navy. The website's phone icons and favicon are this. |
| `pdains-app-icon-bright.svg` / `-1024.png` | App icon: the white mark on the gradient, like the token's coin. |
| `pdains-mark-1024.png` | The mark in colour as a picture, transparent background. |

The website's own icons (favicon, phone home-screen icons) are in `web/public`, the mark itself is
in `web/src/components/Logo.tsx`, the lockup in `web/src/components/Brand.tsx`, and the name cards
wallets show draw it too (`src/PdaiNameCard.sol`). A test checks all of them use the same shape.

## Colours

| | |
| --- | --- |
| The gradient: the mark, words in colour (like ".pdai" in headlines), lines | `#00EAFF` → `#0080FF` → `#8000FF` → `#E619E6` → `#FF0000` (cyan, blue, purple, magenta, red), pDAI's own |
| The accent: the buttons (with navy words), links, focus, what's selected | `#FFFFFF` |
| Section labels | `#C9C5E8` (a soft white) |
| Navy: the site, the name cards, the app icon | `#08071A` (page), `#121131` (cards) |
| The wordmark, and words on the navy | `#FFFFFF` |

There is one gradient, the pDAI token's own five colours with its stops (0, 25%, 50%, 75% and
100%), and it's the same wherever it appears. Across the mark it runs at the token's angle, from the
top right (cyan) to the bottom left (red), spanning the 56 by 44.2 box round the mark the way the
token's spans its coin: from (46.69, 10.13) to (17.25, 53.88) on the 64-unit grid. Across lines and
words it runs left to right. Buttons are white, with navy words: the accent is white, so pDAI's
colours appear only in the gradient and never compete with it. Purple is its darkest colour, at
3.2 to 1 on the navy, so the gradient is kept for large words, lines and the mark.

## Using it

- The lockup is the mark, then "pDAI Name Service" in white, in Space Grotesk: "pDAI" bold (700)
  and "Name Service" medium (500). The mark is 1.55 times the type size tall, with a gap of half the
  type size: a 28px mark beside 18px type, as in the website's top bar.
- Put the lockup on navy or another dark colour, never on white: the wordmark is white.
- On its own, the mark can be as large as you like. Leave space around it at least as wide as its
  bowl's line.
- Smallest sizes: 16px tall for the mark, 16px for the square favicon.
- Use the files as they are: no other colours, outlines, shadows or stretching.
- On photos or busy backgrounds, use the white mark.

## How it's drawn

On a 64-unit grid, everything 6 units thick with round ends. The bowl's centre line is a half
circle of radius 19.1 round (30.636, 32), with straight ends running back to x = 18.818. Dai's two
lines run from x = 7 to 57, 5.886 above and below the middle. That puts 5.77 between the two lines
and 7.21 between each line and the bowl: on paper the outer gaps are wider, but the curve of the bowl
closes them in, so all three look the same. The mark fills 56 by 44.2 from (4, 9.9), centred in the
square.
