# pDAI Name Service brand

The mark is **Open D**: Dai's letter with its upright taken away. What's left is its round bowl, and
Dai's two lines running through it and out both sides, in pDAI's own colours. Beside it, the
wordmark reads **pDAI Name Service**, in white.

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
| `pdains-app-icon-bright.svg` / `-1024.png` | App icon: the white mark on the gradient, like the token. |
| `pdains-mark-1024.png` | The mark in colour as a picture, transparent background. |

The website's own icons (favicon, phone home-screen icons) are in `web/public`, the mark itself is
in `web/src/components/Logo.tsx`, the lockup in `web/src/components/Brand.tsx`, and the name cards
wallets show draw it too (`src/PdaiNameCard.sol`). A test checks all of them use the same shape.

## Colours

| | |
| --- | --- |
| The gradient: the mark, words in colour (like ".pdai" in headlines), lines | `#00EAFF` → `#E619E6` → `#FF0000` (cyan, magenta, red) |
| Magenta: the buttons, links, focus, what's selected, ".pdai" beside the floating names | `#E619E6` |
| Section labels | `#F28CF2` (a tint of the magenta) |
| Navy: the site, the name cards, the app icon | `#08071A` (page), `#121131` (cards) |
| The wordmark, and words on the navy | `#FFFFFF` |

There is one gradient, three of pDAI's colours, and it's the same wherever it appears. Across the mark it
runs from the bottom left (cyan) towards the top right (red), set a little to the right of the
mark's middle so more of the cyan and blue shows: from (10.3, 49.1) to (66.3, 4.9) on the 64-unit grid.
Across lines and words it runs left to right. Buttons are solid magenta. Each of its colours stands out on the navy by
at least 5 to 1.

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
