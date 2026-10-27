#!/usr/bin/env python3
"""Shrink the pictures in assets/ for the web: limit the longest side, re-encode as optimised progressive JPEG.
Usage: python3 tools/optimise-images.py [--dry-run]
Safe to re-run: a picture already within its limit and smaller than the new encoding is left alone.
After running, run `node tools/make-sw.js` so the offline file list and version are refreshed."""
import os, sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets')
LIMITS = {'hotel': 1280, 'rooms': 1000, 'scenes': 1000, 'staff': 300}   # longest side in pixels (about 1.5x the widest place each is shown)
QUALITY = 80
dry = '--dry-run' in sys.argv
before = after = 0
for folder, limit in LIMITS.items():
    for name in sorted(os.listdir(os.path.join(ROOT, folder))):
        if not name.lower().endswith('.jpg'): continue
        path = os.path.join(ROOT, folder, name)
        size = os.path.getsize(path); before += size
        im = Image.open(path).convert('RGB')
        if max(im.size) > limit:
            scale = limit / max(im.size)
            im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
        tmp = path + '.tmp'
        im.save(tmp, 'JPEG', quality=QUALITY, optimize=True, progressive=True, subsampling='4:2:0')
        new = os.path.getsize(tmp)
        if new < size and not dry: os.replace(tmp, path); after += new
        else: os.remove(tmp); after += size
print(f'{before / 1e6:.1f} MB -> {after / 1e6:.1f} MB ({100 * (1 - after / before):.0f}% smaller)' + (' [dry run]' if dry else ''))
