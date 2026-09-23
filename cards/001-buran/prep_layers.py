"""Normalize v3 layers: true-alpha subject, lineart masked to new silhouette, uniform-darkened background."""
import shutil
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / 'assets'
DELIVERY = ROOT / 'source'
W, H = 1024, 1536
DARKEN = 0.74

# Zoom in at asset level so the source's cut side edges stay outside the canvas.
_src = Image.open(DELIVERY / 'Qwen_image_2.1_00008 (1).png').convert('RGBA')
_w, _h = _src.size
subject = _src.crop((round(_w * 0.06), round(_h * 0.06), round(_w * 0.94), _h)).resize((W, H), Image.LANCZOS)
r, g, b, a = subject.split()
rgb = ImageEnhance.Contrast(ImageEnhance.Color(Image.merge('RGB', (r, g, b))).enhance(1.10)).enhance(1.08)
subject = Image.merge('RGBA', (*rgb.split(), a))
_dy = 110
_canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
_canvas.paste(subject, (0, _dy))
subject = _canvas
subject.save(SRC / 'subject.png')
sa = np.asarray(subject)[..., 3] / 255.0

def align_to_subject(line_img, subject_img):
    """The trace is not pixel-registered; fit scale+translate against subject edge energy."""
    nw, nh = 96, 144
    gray = np.asarray(subject_img.resize((nw, nh), Image.LANCZOS).convert('L'), dtype=np.float64)
    gy, gx = np.gradient(gray)
    mag = np.hypot(gx, gy)
    mag = (mag - mag.mean()) / (mag.std() + 1e-6)
    lg = line_img.resize((nw, nh), Image.LANCZOS).convert('L')
    barrier = np.asarray(lg) < 140
    best = (1.0, 0, 0, -1e9)
    for si in range(11):
        s = 0.90 + si * 0.02
        sw, sh = round(nw * s), round(nh * s)
        scaled = Image.fromarray((barrier * 255).astype(np.uint8), 'L').resize((sw, sh), Image.NEAREST)
        sb = np.asarray(scaled) > 128
        for dx in range(-12, 13):
            for dy in range(-12, 13):
                canvas = np.zeros((nh, nw), bool)
                x0, y0 = round((nw - sw) / 2 + dx), round((nh - sh) / 2 + dy)
                xs, ys = max(0, x0), max(0, y0)
                xe, ye = min(nw, x0 + sw), min(nh, y0 + sh)
                if xe <= xs or ye <= ys:
                    continue
                canvas[ys:ye, xs:xe] = sb[ys - y0:ye - y0, xs - x0:xe - x0]
                score = mag[canvas].mean()
                if score > best[3]:
                    best = (s, dx, dy, score)
    print('lineart align', best)
    return best


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
    # The trace may match either the raw subject canvas or the zoom-cropped one; pick by fit score.
    box = (round(_w * 0.06), round(_h * 0.06), round(_w * 0.94), _h)
    cands = {'resized': _line_im.resize((W, H), Image.LANCZOS)}
    if _line_im.size[0] >= box[2] and _line_im.size[1] >= box[3]:
        cands['cropped'] = _line_im.crop(box).resize((W, H), Image.LANCZOS)
    best_key, best_fit, line = None, None, None
    for key, cand in cands.items():
        fit = align_to_subject(cand, subject)
        print('lineart framing', key, fit)
        if best_fit is None or fit[3] > best_fit[3]:
            best_key, best_fit, line = key, fit, cand
    print('lineart source', _line_name, 'framing chosen', best_key)
    s, dx, dy, _ = best_fit
    line = line.resize((round(W * s), round(H * s)), Image.LANCZOS)
    canvas = Image.new('RGB', (W, H), (255, 255, 255))
    canvas.paste(line, (round((W - W * s) / 2 + dx * W / 96), round((H - H * s) / 2 + dy * H / 144)))
    line = canvas
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
    shutil.copy(DELIVERY / 'background.png', orig)
bg = Image.open(orig).convert('RGB').resize((W, H), Image.LANCZOS)
bg = ImageEnhance.Contrast(bg).enhance(1.10)
bga = np.asarray(bg, dtype=np.float64) * DARKEN
Image.fromarray(bga.round().astype(np.uint8), 'RGB').save(SRC / 'background.png')

comp = bg.convert('RGBA').copy()
comp.alpha_composite(subject)
comp.convert('RGB').save(ROOT / 'preview-composite.png')
print('subject transparent', round(float((sa < 0.06).mean()), 3), 'solid', round(float((sa > 0.5).mean()), 3))
