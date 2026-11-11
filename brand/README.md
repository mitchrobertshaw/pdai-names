# HexNS brand

The HexNS mark is **Route**: one network line runs round a hexagon and turns in to end at a node
in the centre, your name. A name that always leads home to your wallet.

Every file is a single filled shape (no strokes), so it scales cleanly from a 16px favicon to a
billboard, in a browser or in any design tool.

## Files

| File | Use it for |
| --- | --- |
| `hexns-mark.svg` | The mark in colour, cropped tight. The default. |
| `hexns-mark-square.svg` | The mark in colour, centred in a square (avatars, favicons). |
| `hexns-mark-black.svg` | One colour, on light backgrounds. |
| `hexns-mark-white.svg` | One colour, on dark backgrounds or photos. |
| `hexns-app-icon.svg` / `-1024.png` | App icon: white mark on the gradient. |
| `hexns-app-icon-dark.svg` / `-1024.png` | App icon: colour mark on dark. |
| `hexns-mark-1024.png` | The mark in colour as a picture, transparent background. |

The website's own icons (favicon, phone home-screen icons) are in `web/public`, and the mark itself
is in `web/src/components/Logo.tsx`.

## Colours

| | |
| --- | --- |
| Gradient, top left to bottom right | `#FFC400` → `#FF6A1F` → `#E5007A` |
| Dark | `#1D1424` (icons), `#130B18` (site background) |
| Light | `#FFF9F4` (site background) |

## Using it

- Beside the HexNS wordmark (Space Grotesk Bold), make the mark 1.5 times the wordmark's font size
  tall, with a gap of 0.35 times the font size: a 30px mark beside 20px text, as on the website.
  On its own, it can be as large as you like.
- With "HEX Name Service" in small type beneath the wordmark (11px, in the muted colour), make the
  mark tall enough to span both lines: 34px beside a 20px wordmark, as in the website's top bar.
  On screens narrower than 360px, leave the tagline out.
- Leave space around the mark at least the size of its centre node.
- Smallest sizes: 16px tall for the mark, 16px for the square favicon.
- Use the files as they are: no other colours, outlines, shadows or stretching.
- On photos or busy backgrounds, use the white mark.

## How it's drawn

On a 64-unit grid: a hexagon with a corner at the top, its corners 23.5 from the centre (32, 32).
One 5.8-unit line with round ends and corners starts at the top corner, runs clockwise round five
sides to the upper-left corner, then turns in to the centre, where a node of radius 7.4 sits. The
side from the upper-left corner back to the top is left open. The gradient runs from (10, 6) to
(54, 58).
