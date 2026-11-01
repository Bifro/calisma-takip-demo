"""Package the supplied artwork for web and Android without redrawing it."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
source = Image.open(ROOT / 'assets/logo-source.png').convert('RGBA')
# Ignore nearly invisible export speckles when removing the transparent margin.
box = source.getchannel('A').point(lambda a: 255 if a > 1 else 0).getbbox()
art = source.crop(box)
side = max(art.size)
square = Image.new('RGBA', (side, side))
square.alpha_composite(art, ((side-art.width)//2, (side-art.height)//2))

def save(image, relative):
    path = ROOT / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, optimize=True)

def sized(size):
    return square.resize((size, size), Image.Resampling.LANCZOS)

for size in (192, 512):
    save(sized(size), f'assets/icon-{size}.png')
save(sized(64), 'assets/logo.png')
opaque = Image.new('RGBA', (180, 180), '#1a1a1a')
opaque.alpha_composite(sized(180))
save(opaque.convert('RGB'), 'assets/apple-touch-icon.png')
square.save(ROOT / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])

for density, size in [('mdpi',48),('hdpi',72),('xhdpi',96),('xxhdpi',144),('xxxhdpi',192)]:
    save(sized(size), f'android/res/mipmap-{density}/ic_launcher.png')
# 108dp layer at xxxhdpi. Keep the stopwatch inside Android's safe mask.
foreground = Image.new('RGBA', (432, 432))
foreground.alpha_composite(sized(336), (48, 48))
save(foreground, 'android/res/drawable-xxxhdpi/ic_launcher_foreground.png')
print('Web and Android icons generated from the supplied logo.')
