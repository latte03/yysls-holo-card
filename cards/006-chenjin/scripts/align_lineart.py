"""Register the delivered line trace onto the finished subject.

The trace is generated separately from the artwork, so it never arrives
pixel-registered. This fits a similarity transform (scale + translate) and
writes the registered line layer plus the evidence needed to trust it.

Outputs
  assets/lineart.png          registered trace, masked to the subject silhouette
  renders/preview-register.png  red-overlay proof, for eyeballing the fit
  alignment.json              transform, scores and residual, for the record

Why full-resolution NCC: at 96x144 the ink and the subject's edges both blur
into blobs, and the correlation happily prefers a 7% scale error that throws
the hem ~50px off. Scoring at native resolution, then refining, is what makes
the fit trustworthy. Identity is always a candidate so a trace that is already
registered stays untouched.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets'
DELIVERY = ROOT / 'source'
W, H = 1024, 1536

COARSE = (256, 384)  # stage-1 search resolution
REFINE = 6           # stage-2 pixel window at native resolution


def _load_subject():
    sub = Image.open(SRC / 'subject.png').convert('RGBA')
    gray = np.asarray(sub.convert('L'), dtype=np.float64)
    gy, gx = np.gradient(gray)
    edge = np.hypot(gx, gy)
    edge = (edge - edge.mean()) / (edge.std() + 1e-6)
    return edge, np.asarray(sub)[..., 3] > 128


def _load_ink():
    line = Image.open(DELIVERY / 'lineart_src.png').convert('L')
    la = np.asarray(line, dtype=np.float64)
    return np.where(la < 140, (255.0 - la) / 255.0, 0.0)


def _resample(ink, w, h):
    return np.asarray(
        Image.fromarray((ink * 255).astype(np.uint8)).resize((w, h), Image.BILINEAR),
        dtype=np.float64,
    ) / 255.0


def _place(ink, scale, dx, dy, size):
    """Scale the trace about the canvas centre and translate it, clipped to size."""
    w, h = round(size[0] * scale), round(size[1] * scale)
    small = _resample(ink, w, h)
    canvas = np.zeros((size[1], size[0]))
    x0, y0 = round((size[0] - w) / 2 + dx), round((size[1] - h) / 2 + dy)
    xs, ys = max(0, x0), max(0, y0)
    xe, ye = min(size[0], x0 + w), min(size[1], y0 + h)
    if xe <= xs or ye <= ys:
        return None
    canvas[ys:ye, xs:xe] = small[ys - y0:ye - y0, xs - x0:xe - x0]
    return canvas


def _ncc(edge, canvas):
    if canvas is None or canvas.sum() <= 0:
        return -1e9
    num = float((edge * canvas).sum())
    den = float(np.sqrt((edge * edge).sum() * (canvas * canvas).sum()))
    return num / (den + 1e-9)


def residual(ink, edge, solid, block=64, radius=24):
    """Median local displacement between the registered ink and the subject's
    edges, in pixels. This is the number that actually predicts whether the
    glow will sit on the artwork, so it is reported next to every fit."""
    bw = block
    disp = []
    for y in range(bw // 2, H - bw // 2, bw):
        for x in range(bw // 2, W - bw // 2, bw):
            sl = (slice(y - bw // 2, y + bw // 2), slice(x - bw // 2, x + bw // 2))
            e, i = edge[sl] * solid[sl], ink[sl] * solid[sl]
            if e.sum() < 30 or i.sum() < 5:
                continue
            best = (0, 0, -1e9)
            for dy in range(-radius, radius + 1, 2):
                for dx in range(-radius, radius + 1, 2):
                    s = np.roll(np.roll(i, dy, axis=0), dx, axis=1)
                    den = np.sqrt((e * e).sum() * (s * s).sum()) + 1e-9
                    v = float((e * s).sum()) / den
                    if v > best[2]:
                        best = (dx, dy, v)
            disp.append(float(np.hypot(*best[:2])))
    return float(np.median(disp)) if disp else float('nan')


def fit(edge, ink):
    """Coarse-to-fine similarity fit at native resolution.

    Identity is scored alongside the search so a trace that already lines up
    is left alone rather than dragged off by a spurious scale.
    """
    cw, ch = COARSE
    edge_c = _resample(edge, cw, ch)
    ink_c = _resample(ink, cw, ch)
    best = (1.0, 0, 0, -1e9)
    for si in range(16):
        s = 0.88 + si * 0.02
        for dx in range(-32, 33, 4):
            for dy in range(-32, 33, 4):
                v = _ncc(edge_c, _place(ink_c, s, dx, dy, COARSE))
                if v > best[3]:
                    best = (s, dx, dy, v)
    # refine at native resolution, and let the search settle on either side of 1.0
    refined = (1.0, 0, 0, _ncc(edge, _place(ink, 1.0, 0, 0, (W, H))))
    s0 = best[0]
    for s in np.arange(max(0.85, s0 - 0.04), min(1.15, s0 + 0.04) + 1e-9, 0.005):
        for dx in range(best[1] - 6, best[1] + 7, 2):
            for dy in range(best[2] - 6, best[2] + 7, 2):
                v = _ncc(edge, _place(ink, s, dx, dy, (W, H)))
                if v > refined[3]:
                    refined = (float(s), dx, dy, v)
    return best, refined


def register(ink, scale, dx, dy):
    return _place(ink, scale, dx, dy, (W, H))


def proof(subject_img, ink, path):
    """Red-overlay proof: the trace drawn on top of the finished artwork."""
    base = Image.new('RGBA', subject_img.size, (255, 255, 255, 255))
    base.alpha_composite(subject_img)
    alpha = Image.fromarray((ink * 255).round().astype(np.uint8)).convert('L')
    layer = Image.new('RGBA', base.size, (225, 30, 50, 255))
    layer.putalpha(alpha)
    base.alpha_composite(layer)
    base.convert('RGB').save(path)


def main():
    edge, solid = _load_subject()
    ink = _load_ink()
    subject_img = Image.open(SRC / 'subject.png').convert('RGBA')

    coarse, refined = fit(edge, ink)
    scale, dx, dy, score = refined
    registered = register(ink, scale, dx, dy)

    # Report the residual of the fit we chose and of doing nothing, so a bad
    # fit is visible in the record rather than silently baked into the card.
    res_fit = residual(registered, edge, solid)
    res_identity = residual(register(ink, 1.0, 0, 0), edge, solid)
    print('coarse  %.3f / %+d / %+d  ncc %.4f' % coarse)
    print('refined %.3f / %+d / %+d  ncc %.4f' % (scale, dx, dy, score))
    print('residual  chosen %.1fpx   identity %.1fpx' % (res_fit, res_identity))

    # White ground, ink lines darkened, and clipped to the subject silhouette so
    # the glow never leaks outside the figure.
    la = 255.0 - registered * 255.0
    la[~solid] = 255.0
    Image.fromarray(la.round().astype(np.uint8)).save(SRC / 'lineart.png')

    out = ROOT / 'renders'
    out.mkdir(exist_ok=True)
    proof(subject_img, registered, out / 'preview-register.png')

    record = {
        'source': 'source/lineart_src.png',
        'transform': {'scale': round(scale, 4), 'dx': dx, 'dy': dy},
        'ncc': round(score, 5),
        'residual_px': {'chosen': round(res_fit, 2), 'identity': round(res_identity, 2)},
        'note': 'residual is the median local displacement between the trace and the subject edges',
    }
    (ROOT / 'alignment.json').write_text(
        json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
    )
    print('wrote assets/lineart.png, renders/preview-register.png, alignment.json')


if __name__ == '__main__':
    main()
