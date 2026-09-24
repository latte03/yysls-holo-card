"""Normalize v3 layers: true-alpha subject (one or more z-ordered layers), lineart masked to the
union silhouette, uniform-darkened background."""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance

sys.path.insert(0, str(Path(__file__).resolve().parent))
from align_lineart import (
    _load_ink,
    _load_subject,
    fit as align_fit,
    register as align_register,
    residual as align_residual,
)
from common import card_root, config, darken, delivery, subject_layers

ROOT = card_root()
CFG = config(ROOT)
SRC = ROOT / 'assets'
DELIVERY = ROOT / 'source'
W, H = 1024, 1536
DARKEN = darken(CFG)

def enhance(im):
    # 交付即 1024x1536 真透明满幅主体时，这里只是直通：不裁切、不位移，只做惯常的饱和/对比提升。
    rgb = ImageEnhance.Contrast(ImageEnhance.Color(Image.merge('RGB', im.split()[:3])).enhance(1.10)).enhance(1.08)
    return Image.merge('RGBA', (*rgb.split(), im.split()[3]))


# 主体按 z 序（后→前）逐层增强。单层卡只有一层，走的还是原来那条链。
layers = []
for name, source in subject_layers(CFG):
    layer = enhance(Image.open(DELIVERY / source).convert('RGBA').resize((W, H), Image.LANCZOS))
    if name != 'subject':          # 单层卡没有独立层名，它本身就是下面那张固化层
        layer.save(SRC / f'{name}.png')
    layers.append(layer)

# 主体固化层 assets/subject.png：线稿配准（align_lineart 读它）、辉光遮罩、preview 都按这一张算。
# 单层卡就是那层本身；多层卡是并集轮廓——线稿只该对着整个主体的边缘打分，不该只看中层。
flat = layers[0]
if len(layers) > 1:
    flat = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for layer in layers:
        flat.alpha_composite(layer)
flat.save(SRC / 'subject.png')
sa = np.asarray(flat)[..., 3] / 255.0


def load_line_source():
    for name in (delivery(CFG, 'lineart'), 'lineart.jpeg'):
        p = DELIVERY / name
        if p.exists():
            im = Image.open(p)
            if im.mode == 'RGBA':
                flat = Image.new('RGB', im.size, (255, 255, 255))
                flat.paste(im, mask=im.split()[3])
                return name, flat
            return name, im.convert('RGB')
    return None, None


_line_name, _line_im = load_line_source()
if _line_im is not None:
    # Registration lives in align_lineart.py: full-resolution NCC plus a
    # residual check, so the fit cannot be gamed by a coarse-scale alias.
    edge, solid = _load_subject()
    ink = _load_ink()
    _, (s, dx, dy, score) = align_fit(edge, ink)
    registered = align_register(ink, s, dx, dy)
    print('lineart align %.3f / %+d / %+d  ncc %.4f  residual %.1fpx'
          % (s, dx, dy, score, align_residual(registered, edge, solid)))
    line = Image.fromarray(
        np.where(registered > 0.02, (255.0 - registered * 255.0), 255.0).round().astype(np.uint8)
    ).convert('RGB')
else:
    # No pixel-registered trace on file: keep the glow layer inert rather than show misaligned lines.
    line = Image.new('RGB', (W, H), (255, 255, 255))
la = np.asarray(line, dtype=np.float64)
la = np.clip(la * (255.0 / 245.0), 0, 255)
la = np.where(la < 150, la, 255.0)
la[sa < 0.5] = 255
Image.fromarray(la.round().astype(np.uint8), 'RGB').save(SRC / 'lineart.png')

orig = DELIVERY / delivery(CFG, 'background')
bg = Image.open(orig).convert('RGB').resize((W, H), Image.LANCZOS)
bg = ImageEnhance.Contrast(bg).enhance(1.10)
bga = np.asarray(bg, dtype=np.float64) * DARKEN
Image.fromarray(bga.round().astype(np.uint8), 'RGB').save(SRC / 'background.png')

comp = bg.convert('RGBA').copy()
comp.alpha_composite(flat)
comp.convert('RGB').save(ROOT / 'preview-composite.png')
print('subject transparent', round(float((sa < 0.06).mean()), 3), 'solid', round(float((sa > 0.5).mean()), 3))
