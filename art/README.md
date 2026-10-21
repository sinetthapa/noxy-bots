# Nox's art

Nox's source art, under CC BY 4.0 (see [LICENSE-ART](../LICENSE-ART)): `nox.svg` and `nox-ii.svg` (the body),
`nox-ear-l.svg` (the left ear; the right one is mirrored), `exclamation.svg`, `question.svg` and `bulb.svg` (the
symbols), and `nox.png` (a render, used in the README). The rig in `src/character/__fixtures__/nox-rig.svg` was built
from them.

## Drawing a Noxy part

How to draw a new body, ears or bolts for Nox and bring it into the lab. The importer is strict on purpose:
anything outside this format fails with a message that names the file and the problem.

### The workflow

1. In the lab (`npm run dev`), pick a look close to what you want and click **Download SVG**.
2. Open it in Figma (or any editor). It's a 985 × 830 frame: Nox's frame.
3. Draw your part on top, then hide or delete everything else.
4. Add the markers your part needs (below).
5. Export the whole frame as SVG into `src/character/nox/art/`, named for the part:
   `body-<id>.svg`, `ears-<id>.svg` or `bolts-<id>.svg`. The id is lowercase letters and digits; the lab shows it capitalised.
   In Figma's export settings, tick **Include "id" attribute**, so layer names (`shell`, `pivot`, …) become ids. Ids on ears and bolts shapes are dropped on import; only `pivot` matters there.
6. Run `npm run import-art`. It rewrites `src/character/nox/parts.gen.ts`; your variant appears in the lab's Look folder.

Figma exports the frame with a `0 0 985 830` viewBox. That's fine: the importer shifts the art back onto Nox's
frame (`-180 -60 985 830`). The viewBox size must stay 985 × 830, so export the whole frame, not a selection.

Figma names gradients `paint0_linear_…`. After exporting, rename each one in a text editor, in both its
`<linearGradient id>` and the `fill="url(#…)"` that uses it: a body's shell gradient must be `grad-shell`, and every
other gradient gets a unique `grad-…` id, so a body, its ears and its bolts never share one.

### What each part needs

**Ears and bolts.** Draw the **left** side only; the right side is drawn by mirroring it.
Add one circle with `id="pivot"` at the hinge: ears rotate and droop about it, bolts grow and shrink about it.
The pivot lands on the body's ear or bolt anchor, so a side drawn for one body fits any body.

Bolts light up: every shape filled with the accent colour (`#FA6C2E`) brightens toward the lit accent when Nox's
accents pulse, with a glow-coloured halo behind the bolt. Other colours stay as drawn.

**Bodies.** Draw, at the top level of the file (not inside another group; anything else at the top level fails on import):

- the shell in a group `<g id="shell">`, filled with a linear gradient `id="grad-shell"` (its `x1`/`x2` set
  the highlight that drifts when Nox turns);
- the screen in `<g id="screen">`;
- the floor shadow as `<ellipse id="shadow">`, filled `#000000`;
- one circle per anchor, its centre being the position:

| id | Where |
|---|---|
| `axis` | any point on the vertical centre line (only its x is used) |
| `eye-l` | the left eye's centre |
| `ear-l` | where the left ear hinges |
| `bolt-l` | where the left bolt hinges |
| `mouth` | the mouth's centre |
| `tilt` | the point the head tilts about |
| `squash` | the point the body squashes about (the base) |
| `symbols` | where `!`, `?` and the bulb pop up |
| `badge` | the notification badge |
| `zzz-from`, `zzz-to` | where the sleep Zzz start and end |

Markers can be any colour; they're removed on import. Right-side positions are mirrored about `axis`.

### The format

- **Elements:** `path`, `rect`, `circle`, `ellipse`, `g`, `linearGradient`, `radialGradient` (in `defs` or not).
- **Paths:** absolute `M L H V C Q Z` only. Figma exports this; other editors may need "absolute coordinates".
- **No transforms.** Flatten rotated or scaled shapes first (Figma: Flatten, ⌘E).
- **No clipping.** Turn off "Clip content" on the frame, or Figma wraps everything in a clip group.
- **No `fill-opacity`.** Set the layer's opacity instead; it exports as `opacity`.
- **Attributes kept:** geometry, `fill-rule`, `clip-rule`, `opacity`, `stroke-width`, `stroke-linecap`,
  `stroke-linejoin`, `stroke-dasharray`, and `opacity` on groups. No `style=`; no `fill` or `stroke` on groups.
- **Colours:** only the palette below, as hex (Figma's `white` and `black` by name count as `#FFFFFF` and `#000000`, so they work in gradient stops and the shadow). Each maps to a theme token, so the part follows every theme.

| Colour | Token |
|---|---|
| `#95A9AF` | trim |
| `#FA6C2E` | accent (lights up on bolts) |
| `#FF8A4C` | glow |
| `#2EC7E6` | eye |
| `#EFEFEF` | mouth |
| `#FC721A` | symbol |
| `#000000` | the shadow ellipse only |

Gradients have exactly two stops, matching one pair:

| Stops | Token |
|---|---|
| `#FFFFFF` → `#92A7AD` | shell |
| `#FFFFFF` → `#D9E0E3` | ear shell |
| `#313E4F` → `#12171D` | screen |

Prefer linear gradients, or radial ones without `gradientTransform`: the Lottie export (M4) handles those best.

### Licence

Nox's art is CC BY 4.0. Art you add to this folder ships under the same licence.
