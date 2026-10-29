#!/usr/bin/env python3
"""Compresses the game artwork (the pictures in assets/games) from full-size originals.

Usage:  python3 tools/compress-art.py <folder of originals> [destination folder, default assets/games]
        python3 tools/compress-art.py --check [folder]   reports sizes and exits 1 if anything is over its weight limit

Needs Pillow (pip install pillow). Always start from the ORIGINAL files, never from files this tool has already written:
compressing twice loses quality twice. The originals can be PNG or JPG, any size, named as the game expects. What each kind of
file becomes:

  <name>-bg.png / .jpg      scene          -> <name>-bg.jpg    JPG, 1000 px wide, quality 80, progressive   (about 70 to 160 KB)
  <name>-f1.png .. -f7.png  moving frame   -> <name>-f1.webp   WebP with transparency, 1000 px wide, quality 85 (about 15 to 55 KB)
  patch-<name>.png          tap patch      -> patch-<name>.webp WebP with transparency, size unchanged, quality 85 (about 5 to 20 KB)

Why these choices (measured on the real artwork, against the originals):
  * 1000 px is the width of every other scene in the game. The game never shows these pictures wider than about 520 CSS pixels
    (a 580 px dialog less its padding), so 1000 px is still sharp on a high-density PC screen. A scene and its frames must keep one
    aspect ratio (3:2); they do, because both are resized to the same width.
  * JPG at quality 80 keeps about 0.98 structural similarity on scenes, and the loss is not visible at display size.
  * WebP, not PNG, for pictures with transparency. A 256-colour PNG is tiny but bands visibly on smooth gradients (brushed metal,
    smoke), and a full-colour PNG is five to ten times larger. Lossy WebP with a lossless alpha channel has neither problem and is
    supported by every current browser (Safari 14 and iPhone iOS 14 or later, Chrome, Edge, Firefox).
"""
import os
import re
import sys

from PIL import Image

WIDTH = 1000
JPEG_QUALITY = 80
WEBP_QUALITY = 85
LIMIT_KB = {'scene': 220, 'frame': 80, 'patch': 40}   # a file over its limit is reported by --check
FRAME = re.compile(r'^[a-z]+-[a-z]+-f[1-7]\.png$')
SCENE = re.compile(r'^[a-z]+-[a-z]+-bg\.(png|jpe?g)$')
PATCH = re.compile(r'^patch-[a-z]+\.png$')


def kind(name):
    if SCENE.match(name):
        return 'scene'
    if FRAME.match(name):
        return 'frame'
    if PATCH.match(name):
        return 'patch'
    return None


def resized(img):
    if img.size[0] == WIDTH:
        return img
    return img.resize((WIDTH, round(img.size[1] * WIDTH / img.size[0])), Image.LANCZOS)


def compress(src, dst):
    """Writes the compressed version of every game picture found in src. Returns the file names written."""
    done = []
    for name in sorted(os.listdir(src)):
        k = kind(name)
        if not k:
            continue
        img = Image.open(os.path.join(src, name))
        if k == 'scene':
            out = re.sub(r'\.(png|jpe?g)$', '.jpg', name)
            resized(img.convert('RGB')).save(os.path.join(dst, out), 'JPEG', quality=JPEG_QUALITY, optimize=True, progressive=True)
        else:
            out = re.sub(r'\.png$', '.webp', name)
            picture = resized(img) if k == 'frame' else img
            picture.convert('RGBA').save(os.path.join(dst, out), 'WEBP', quality=WEBP_QUALITY, method=6, alpha_quality=100)
        done.append(out)
    return done


def check(folder):
    """Prints the total size and any file over its limit. Returns how many are over."""
    over = 0
    total = 0
    for name in sorted(os.listdir(folder)):
        k = kind(re.sub(r'\.(jpg|webp)$', '.png', name))
        if not k:
            continue
        kb = os.path.getsize(os.path.join(folder, name)) / 1024
        total += kb
        if kb > LIMIT_KB[k]:
            over += 1
            print(f'TOO BIG  {name}: {kb:.0f} KB (limit {LIMIT_KB[k]} KB for a {k})')
    print(f'{total / 1024:.1f} MB in total; {over} file(s) over their limit')
    return over


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    default = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'games')
    if '--check' in sys.argv:
        sys.exit(1 if check(args[0] if args else default) else 0)
    if not args:
        sys.exit(__doc__)
    destination = args[1] if len(args) > 1 else default
    os.makedirs(destination, exist_ok=True)
    print(f'{len(compress(args[0], destination))} pictures written to {destination}')
