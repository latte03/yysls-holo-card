"""Brand assets for the 燕云十六声 series.

logo-ink.png   header wordmark: brush mark keeps its gold, the type goes ink.
logo-light.png  same, but the type goes paper — for the dark colour scheme.
favicon.png    tab icon: the 卄 mark alone, square and transparent.

The card-back plate is make_back.py's assets/back.png, shared by both routes.
"""
from pathlib import Path
from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parent
SRC = (ROOT.parent / 'brand' / 'logo+文字.webp').resolve()
OUT = ROOT / 'public' / 'assets'
MARK_X = 98  # column where the 卄 brush mark ends and the wordmark begins
LOGO_W, LOGO_H = Image.open(SRC).size
INK = (36, 38, 37)
PAPER = (232, 230, 225)


def wordmark(color, name):
    """刷字标记保留原金色，只把右边的字刷成指定颜色。"""
    im = Image.open(SRC).convert('RGBA')
    a = np.asarray(im).copy()
    a[:, MARK_X:, :3] = color
    out = Image.fromarray(a, 'RGBA')
    out.save(OUT / name)
    print(name, out.size)


def logo_ink():
    wordmark(INK, 'logo-ink.png')


def logo_light():
    wordmark(PAPER, 'logo-light.png')


def favicon():
    """Square tab icon: the 卄 brush mark alone, on transparent."""
    im = Image.open(SRC).convert('RGBA').crop((0, 0, MARK_X, LOGO_H))
    im = im.crop(im.getchannel('A').getbbox())
    side = max(im.size) + 8
    plate = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    plate.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
    plate = plate.resize((128, 128), Image.LANCZOS)
    plate.save(OUT / 'favicon.png')
    print('favicon.png', plate.size)


if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    logo_ink()
    logo_light()
    favicon()
