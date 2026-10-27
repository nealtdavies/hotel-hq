#!/usr/bin/env python3
"""Cuts a grid of pictures into separate game pictures, in reading order (left to right, then top to bottom).
Usage: python3 tools/split-quad.py <grid image> <kind> <name> <name> ... [--grid COLSxROWS]
  kind: scenes (16:9, 1000 px wide), menu (16:10, 1000 px wide) or guests (square, 300 px wide).
  --grid: the number of pictures across and down. The default is 2x2. There must be one name per picture ("-" skips one).
Examples:
  python3 tools/split-quad.py quad.png scenes claw-stuck racing-screen pinball-flipper dance-pad
  python3 tools/split-quad.py faces.png guests f01 f02 f03 f04 f05 f06 f07 f08 f09 f10 f11 f12 --grid 4x3
The thin white lines between pictures are found automatically, so pictures that are not exactly equal in size are still cut cleanly. When no
clear lines are found, the image is divided into equal parts with a small trim. Each picture is cropped from the centre to the game's shape,
shrunk, and saved as optimised progressive JPEG in assets/<kind>/<name>.jpg, like tools/optimise-images.py does."""
import os, sys
from PIL import Image

SHAPES = {'scenes': (16, 9), 'menu': (16, 10), 'guests': (1, 1)}
WIDTHS = {'scenes': 1000, 'menu': 1000, 'guests': 300}   # pixels wide: headshots are shown small, so they need far fewer
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets')
WHITE = 235          # a pixel is "white" when its darkest channel is at least this
LINE_SHARE = 0.97    # a column or row is a gutter when this much of it is white
MIN_LINE = 2         # pixels: a white run thinner than this is not a gutter


def spans(flags):
    """Runs of consecutive True values, as (start, end) with end exclusive."""
    out, start = [], None
    for i, f in enumerate(flags + [False]):
        if f and start is None: start = i
        if not f and start is not None: out.append((start, i)); start = None
    return out


def intervals(flags, count, length):
    """The `count` picture intervals along one direction: the gaps between white lines when exactly that many are found, otherwise equal parts."""
    white = [s for s in spans(flags) if s[1] - s[0] >= MIN_LINE]
    cuts, pos = [], 0
    for s in white:
        if s[0] > pos: cuts.append((pos, s[0]))
        pos = s[1]
    if pos < length: cuts.append((pos, length))
    cuts = [c for c in cuts if c[1] - c[0] > length / count * 0.4]   # ignore slivers
    if len(cuts) == count: return cuts, True
    trim = max(3, round(length * 0.004))
    size = length / count
    return [(round(i * size) + trim, round((i + 1) * size) - trim) for i in range(count)], False


def main(argv):
    grid = (2, 2)
    if '--grid' in argv:
        i = argv.index('--grid')
        try: grid = tuple(int(x) for x in argv[i + 1].lower().split('x')); assert len(grid) == 2 and min(grid) >= 1
        except Exception: sys.exit('--grid needs a size like 4x3')
        argv = argv[:i] + argv[i + 2:]
    if len(argv) < 4 or argv[2] not in SHAPES: sys.exit(__doc__)
    src, kind, names = argv[1], argv[2], argv[3:]
    cols, rows = grid
    if len(names) != cols * rows: sys.exit(f'A {cols}x{rows} grid has {cols * rows} pictures but {len(names)} names were given (use "-" to skip one).')
    im = Image.open(src).convert('RGB')
    W, H = im.size
    px = im.load()
    step = max(1, H // 400)
    colflags = [sum(1 for y in range(0, H, step) if min(px[x, y]) >= WHITE) / len(range(0, H, step)) >= LINE_SHARE for x in range(W)]
    step = max(1, W // 400)
    rowflags = [sum(1 for x in range(0, W, step) if min(px[x, y]) >= WHITE) / len(range(0, W, step)) >= LINE_SHARE for y in range(H)]
    xs, found_x = intervals(colflags, cols, W)
    ys, found_y = intervals(rowflags, rows, H)
    print(f'{W}x{H}: {"found the white lines" if found_x and found_y else "no clear white lines in " + ("columns" if not found_x else "rows") + ", cut into equal parts"}')
    aw, ah = SHAPES[kind]
    width = WIDTHS[kind]
    for n, name in enumerate(names):
        if name == '-': continue
        (x0, x1), (y0, y1) = xs[n % cols], ys[n // cols]
        inset = 2   # stay clear of the line's soft edge
        tile = im.crop((x0 + inset, y0 + inset, x1 - inset, y1 - inset))
        w, h = tile.size
        if w * ah > h * aw:   # too wide: trim the sides
            nw = round(h * aw / ah); tile = tile.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
        else:                 # too tall: trim top and bottom
            nh = round(w * ah / aw); tile = tile.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
        tile = tile.resize((width, round(width * ah / aw)), Image.LANCZOS)
        out = os.path.join(ROOT, kind, name + '.jpg')
        os.makedirs(os.path.dirname(out), exist_ok=True)
        tile.save(out, 'JPEG', quality=80, optimize=True, progressive=True, subsampling='4:2:0')
        print(f'{kind}/{name}.jpg  {tile.size[0]}x{tile.size[1]}  {os.path.getsize(out) // 1024} KB')


main(sys.argv)
