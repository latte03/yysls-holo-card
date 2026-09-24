"""Compose the transparent card-back layer: gold double border + 燕云十六声 logo + edition."""
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import card_root

ROOT = card_root()
cfg = json.loads((ROOT / 'card-config.json').read_text(encoding='utf-8-sig'))
W, H = 1024, 1536
gold = (194, 163, 104, 255)

im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(im)
# 网格的圆角是 0.2 单位 = 32.5 px（贴图 1024px 对 6.3 单位宽）。金线框内缩 74/87 px，按
# 同心偏移算其实早该是尖角了，所以这里的半径是审美取值：外框 26、内框 16，让框跟着卡的
# 轮廓圆过去，而不是在圆角卡上摆一个正方形框。
d.rounded_rectangle((74, 74, 74 + 876, 74 + 1388), radius=24, outline=gold, width=2)
d.rounded_rectangle((87, 87, 87 + 850, 87 + 1362), radius=16, outline=gold, width=2)

logo = Image.open(ROOT / '..' / '..' / 'brand' / 'logo+文字.webp').convert('RGBA')
lw = 600
logo = logo.resize((lw, round(logo.height * lw / logo.width)), Image.LANCZOS)
im.alpha_composite(logo, ((W - lw) // 2, 544))

font = ROOT / '..' / '..' / 'brand' / 'fonts' / 'NotoSerif-SemiBold.ttf'
d.text((512, 1310), cfg.get('edition', 'No.00'), font=ImageFont.truetype(str(font), 30),
       fill=gold, anchor='ma')
im.save(ROOT / 'assets' / 'back.png')
print('back.png', im.size)
