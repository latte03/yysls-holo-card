"""Compose the transparent card-back layer: gold double border + 燕云十六声 logo + edition."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
cfg = json.loads((ROOT / 'card-config.json').read_text(encoding='utf-8-sig'))
W, H = 1024, 1536
gold = (194, 163, 104, 255)

im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(im)
d.rectangle((74, 74, 74 + 876, 74 + 1388), outline=gold, width=2)
d.rectangle((87, 87, 87 + 850, 87 + 1362), outline=gold, width=2)

logo = Image.open(ROOT / '..' / '..' / 'brand' / 'logo+文字.webp').convert('RGBA')
lw = 600
logo = logo.resize((lw, round(logo.height * lw / logo.width)), Image.LANCZOS)
im.alpha_composite(logo, ((W - lw) // 2, 544))

font = ROOT / '..' / '..' / 'brand' / 'fonts' / 'NotoSerif-SemiBold.ttf'
d.text((512, 1310), cfg.get('edition', 'No.00'), font=ImageFont.truetype(str(font), 30),
       fill=gold, anchor='ma')
im.save(ROOT / 'assets' / 'back.png')
print('back.png', im.size)
