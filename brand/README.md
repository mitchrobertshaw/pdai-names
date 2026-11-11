# pDAI Names brand

The pDAI Names mark is **Coin**: a lowercase p whose bowl is a coin, with a node at its centre,
your name. A name for your wallet, with pDAI's gold.

Every file is a single filled shape (no strokes), so it scales cleanly from a 16px favicon to a
billboard, in a browser or in any design tool.

## Files

| File | Use it for |
| --- | --- |
| `pdains-mark.svg` | The mark in colour, cropped tight. The default. |
| `pdains-mark-square.svg` | The mark in colour, centred in a square (avatars, favicons). |
| `pdains-mark-black.svg` | One colour, dark ink, on light backgrounds. |
| `pdains-mark-white.svg` | One colour, on dark backgrounds or photos. |
| `pdains-app-icon.svg` / `-1024.png` | App icon: dark ink on the gold. |
| `pdains-app-icon-dark.svg` / `-1024.png` | App icon: the gold mark on dark. |
| `pdains-mark-1024.png` | The mark in colour as a picture, transparent background. |

The website's own icons (favicon, phone home-screen icons) are in `web/public`, the mark itself is
in `web/src/components/Logo.tsx`, and the name cards wallets show draw it too
(`src/PdaiNameCard.sol`). A test checks all of them use the same shape.

## Colours

| | |
| --- | --- |
| The mark's gold, top left to bottom right | `#FFCF40` → `#F5AC37` → `#D47A16` |
| The gold behind dark ink (app icon, name cards) | `#FFD84D` → `#F5AC37` → `#E08A1E` |
| Ink on the gold | `#2B1D05` |
| Teal, for buttons and links on light backgrounds | `#0B7A6C` |
| Dark | `#0B1714` (icons, site background) |
| Light | `#FFFBF2` (site background) |

`#F5AC37` is the gold Dai has always been drawn in. The teal nods to MakerDAO's, where Dai began.
Never put white on the gold: it's hard to read. Use the dark ink.

## Using it

- Beside the pDAI Names wordmark (Space Grotesk Bold), make the mark 1.5 times the wordmark's font
  size tall, with a gap of 0.35 times the font size: a 30px mark beside 20px text, as on the website.
  On its own, it can be as large as you like.
- With "pDAI Name Service" in small type beneath the wordmark (11px, in the muted colour), make the
  mark tall enough to span both lines: 34px beside a 20px wordmark, as in the website's top bar.
  On screens narrower than 360px, leave the tagline out.
- Leave space around the mark at least the size of its centre node.
- Smallest sizes: 16px tall for the mark, 16px for the square favicon.
- Use the files as they are: no other colours, outlines, shadows or stretching.
- On photos or busy backgrounds, use the white mark.

## How it's drawn

On a 64-unit grid, with the same 5.8-unit line and 7.4 node as HexNS's mark, so the two read as a
family: a ring of radius 17 centred at (32, 25.5), and a stem down its left side, from the ring's
middle to y = 55.5, with a round end. A node of radius 7.4 sits at the ring's centre. The whole mark
fills 39.8 by 52.8 from (12.1, 5.6), so it is centred in the square. The gold runs from (12, 6) to
(52, 58).
