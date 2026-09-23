"""Normalize v3 layers: true-alpha subject, lineart masked to new silhouette, uniform-darkened background."""
import shutil
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

ROOT = Path(__file__).resolve().parent
SRC = ROOT / 'assets'
DELIVERY = ROOT / 'source'
W, H = 1024, 1536
DARKEN = 0.92

# The delivery is already a true-alpha 1024x1536 full-bleed subject: no crop,
# no vertical shift, just the usual saturation/contrast lift.
subject = Image.open(DELIVERY / 'Qwen_image_2.1_00020.png').convert('RGBA').resize((W, H), Image.LANCZOS)
rgb = ImageEnhance.Contrast(ImageEnhance.Color(Image.merge('RGB', subject.split()[:3])).enhance(1.10)).enhance(1.08)
subject = Image.merge('RGBA', (*rgb.split(), subject.split()[3]))
subject.save(SRC / 'subject.png')
sa = np.asarray(subject)[..., 3] / 255.0


def load_line_source():
    for name in ('lineart_src.png', 'lineart.jpeg'):
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

orig = DELIVERY / 'background_orig.png'
if not orig.exists():
    # The first run snapshots the untouched delivery; later runs reuse it so
    # the darkening never compounds.
    shutil.copy(DELIVERY / 'background_orig.png', orig)
bg = Image.open(orig).convert('RGB').resize((W, H), Image.LANCZOS)
bg = ImageEnhance.Contrast(bg).enhance(1.10)
bga = np.asarray(bg, dtype=np.float64) * DARKEN
Image.fromarray(bga.round().astype(np.uint8), 'RGB').save(SRC / 'background.png')

comp = bg.convert('RGBA').copy()
comp.alpha_composite(subject)
comp.convert('RGB').save(ROOT / 'preview-composite.png')
print('subject transparent', round(float((sa < 0.06).mean()), 3), 'solid', round(float((sa > 0.5).mean()), 3))
