#!/usr/bin/env python3
"""Puts the game's icons into the iOS and Android projects created by `npx cap add ios` / `npx cap add android`.
Usage: python3 tools/apply-native-icons.py     (run after `cap add`, and again if the icons change; platforms not added yet are skipped)
Needs icons/native/ from `python3 tools/make-icons.py`. The file locations are the ones Capacitor's own templates use."""
import os, shutil
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ICONS = os.path.join(ROOT, 'icons')
NATIVE = os.path.join(ICONS, 'native')
LAUNCHER = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}   # classic (pre-Android 8) icon sizes in px

def ios():
    target = os.path.join(ROOT, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset')
    if not os.path.isdir(target): return print('ios: not added yet, skipped')
    shutil.copyfile(os.path.join(NATIVE, 'ios-1024.png'), os.path.join(target, 'AppIcon-512@2x.png'))
    print('ios: AppIcon-512@2x.png (1024x1024) replaced')

def android():
    res = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
    if not os.path.isdir(res): return print('android: not added yet, skipped')
    full_fg = Image.open(os.path.join(ICONS, 'source', 'Android_Adaptive_Foreground_432.png')).convert('RGBA')
    bg = Image.open(os.path.join(ICONS, 'source', 'Android_Adaptive_Background_432.png')).convert('RGBA')
    classic = bg.copy(); classic.alpha_composite(full_fg)
    for density, px in LAUNCHER.items():
        folder = os.path.join(res, f'mipmap-{density}')
        for layer in ('foreground', 'background'):
            shutil.copyfile(os.path.join(NATIVE, f'android-{layer}-{density}.png'), os.path.join(folder, f'ic_launcher_{layer}.png'))
        square = classic.resize((px, px), Image.LANCZOS)
        square.save(os.path.join(folder, 'ic_launcher.png'), optimize=True)
        shape = Image.new('L', (px * 4, px * 4), 0); ImageDraw.Draw(shape).ellipse((0, 0, px * 4 - 1, px * 4 - 1), fill=255)
        round_icon = square.copy(); round_icon.putalpha(shape.resize((px, px), Image.LANCZOS))
        round_icon.save(os.path.join(folder, 'ic_launcher_round.png'), optimize=True)
    for name in ('ic_launcher.xml', 'ic_launcher_round.xml'):   # the adaptive icon now uses the picture background, not a flat colour
        path = os.path.join(res, 'mipmap-anydpi-v26', name)
        with open(path, 'w') as f:
            f.write('<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
                    '    <background android:drawable="@mipmap/ic_launcher_background"/>\n    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>\n')
    print('android: adaptive foreground and background (all densities), classic and round icons replaced')

ios(); android()
