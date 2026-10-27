#!/usr/bin/env python3
"""Builds every icon the game needs from the master artwork in icons/source/ (the Luxury Hotel Manager icon pack).
Usage: python3 tools/make-icons.py
Writes into icons/: icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png (180), favicon-32.png,
and into icons/native/: ios-1024.png, playstore-512.png, android-foreground-<density>.png, android-background-<density>.png.
The pack's square icons carry a rounded tile with a dark brown margin baked in. Phones and stores add their own rounded mask, so the
margin is cropped away to leave the artwork filling the whole square. Run `node tools/make-sw.js` afterwards."""
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ICONS = os.path.join(HERE, '..', 'icons')
SRC = os.path.join(ICONS, 'source')
NATIVE = os.path.join(ICONS, 'native')
CROP = 108 / 1024           # share of each side removed to drop the baked-in rounded margin and its shadow
SAFE = 0.72                 # adaptive foreground scale: keeps the whole key inside the circle every launcher shape leaves visible
DENSITIES = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}   # adaptive layers are 108dp

os.makedirs(NATIVE, exist_ok=True)
master = Image.open(os.path.join(SRC, 'iOS_AppIcon_1024.png')).convert('RGB')
m = round(master.width * CROP)
full = master.crop((m, m, master.width - m, master.height - m)).resize((1024, 1024), Image.LANCZOS)
fg = Image.open(os.path.join(SRC, 'Android_Adaptive_Foreground_432.png')).convert('RGBA')
bg = Image.open(os.path.join(SRC, 'Android_Adaptive_Background_432.png')).convert('RGB')

def save(img, folder, name, size=None):
    if size: img = img.resize((size, size), Image.LANCZOS)
    img.save(os.path.join(folder, name), 'PNG', optimize=True)

def safe_foreground(layer, size):
    out = Image.new('RGBA', layer.size, (0, 0, 0, 0))
    small = layer.resize((round(layer.width * SAFE), round(layer.height * SAFE)), Image.LANCZOS)
    out.paste(small, ((layer.width - small.width) // 2, (layer.height - small.height) // 2), small)
    return out.resize((size, size), Image.LANCZOS)

# web and home-screen icons
save(full, ICONS, 'icon-512.png', 512)
save(full, ICONS, 'icon-192.png', 192)
save(full, ICONS, 'apple-touch-icon.png', 180)
save(full, ICONS, 'favicon-32.png', 32)
mask = bg.resize((512, 512), Image.LANCZOS).convert('RGBA')
mask.alpha_composite(safe_foreground(fg, 512))
save(mask.convert('RGB'), ICONS, 'icon-maskable-512.png')

# store and native-project art
save(full, NATIVE, 'ios-1024.png')
save(full, NATIVE, 'playstore-512.png', 512)
for name, px in DENSITIES.items():
    save(safe_foreground(fg, px), NATIVE, f'android-foreground-{name}.png')
    save(bg, NATIVE, f'android-background-{name}.png', px)
print('icons written to', os.path.normpath(ICONS))
