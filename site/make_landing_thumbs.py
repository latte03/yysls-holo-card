"""把每张卡的 grok-male.png 立绘抠成首页缩略图（透明底 webp）。

输入 cards/<id>-*/grok-male.png，输出 site/public/assets/landing/<id>.webp，
统一 441x616（63:88，和卡框同比），所以三张图在网格里占的视觉体量一致，
CSS 不用再按张调。缺输入文件的卡会被跳过并报告——首页那几张渲染成占位卡。

    python site/make_landing_thumbs.py

背景是近白但不透明（alpha 全 255），而且角色本身是白发白衣，按颜色全局阈值会把
人抠穿；所以走连通性：从四条边泛洪标记背景，只留下和边框相连的那一片。
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

# Windows 控制台默认 GBK，打印中文路径会崩。
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
CARDS = ROOT / "cards"
OUT = ROOT / "site" / "public" / "assets" / "landing"

SRC_NAME = "grok-male.png"
CANVAS = (441, 616)  # 63:88 的 7 倍
FIT = 0.88  # 立绘在画布里的占比上限（高或宽取先撞到的那个）
THRESH = 26  # 泛洪容差（1-范数）：背景自身在 245~253 之间漂移，再大就要吃进灰描边了
MATT = 95  # 边缘环带里色差到多少才算完全不透明
BAND = 3  # 只在剪影外缘这么多像素上做软 alpha
PAD = 6  # 裁切框外扩，留住描边的抗锯齿


def background_color(rgb: np.ndarray) -> np.ndarray:
    """边框一圈的中位数，就是这张图背景的实际颜色。"""
    edge = np.concatenate(
        [
            rgb[:3].reshape(-1, 3),
            rgb[-3:].reshape(-1, 3),
            rgb[:, :3].reshape(-1, 3),
            rgb[:, -3:].reshape(-1, 3),
        ]
    )
    return np.median(edge.reshape(-1, 3), axis=0)


def foreground_mask(rgb: np.ndarray, thresh: int) -> np.ndarray:
    """从四条边泛洪标出背景，返回前景 bool 掩膜。"""
    im = Image.fromarray(rgb, "RGB")
    pixels = np.array(im)
    sentinel = next(
        c
        for c in [(255, 0, 255), (0, 255, 255), (255, 0, 128)]
        if not np.all(pixels == np.array(c), axis=2).any()
    )
    w, h = im.size
    seeds = [(x, y) for y in (0, h - 1) for x in range(0, w, 32)] + [
        (x, y) for x in (0, w - 1) for y in range(0, h, 32)
    ]
    for xy in seeds:
        if im.getpixel(xy) == sentinel:
            continue
        ImageDraw.floodfill(im, xy, sentinel, thresh=thresh)
    return ~np.all(np.array(im) == sentinel, axis=2)


def edge_band(mask: np.ndarray, width: int) -> np.ndarray:
    """剪影外缘 width 像素的一圈环带（往里收缩 width 次取差）。"""
    eroded = mask
    for axis in (0, 1):
        for _ in range(width):
            shifted = [np.roll(eroded, s, axis=axis) for s in (-1, 0, 1)]
            eroded = np.minimum.reduce(shifted)
    return mask & ~eroded


def decontaminate(rgb: np.ndarray, alpha: np.ndarray, bg: np.ndarray) -> np.ndarray:
    """边缘半透明像素按「原色 = 立绘色 ⊕ 背景色」反解，去掉那圈白边。"""
    a = (alpha / 255.0)[..., None]
    out = np.where(a > 0, (rgb - (1 - a) * bg) / np.maximum(a, 1e-3), rgb)
    return np.clip(out, 0, 255).astype(np.uint8)


def paste_x(img: Image.Image) -> int:
    """横向按「视觉质量」居中，不是按外接框。

    立绘常有单侧的长飘带/长发（007 的白发往左拖出 379px 宽），按 bbox 居中会把人物
    本体推到右边——外接框是对称的，质量不是。这里把 alpha 质心对到画布中线上，
    再夹一次保证外接框不被推出画布（尾巴太长时以不裁切优先，宁可质心偏一点）。
    """
    a = np.asarray(img)[..., 3] > 60
    w = img.width
    xs = np.arange(w, dtype=np.float64)
    centroid = float((a * xs).sum() / a.sum()) if a.any() else w / 2
    left = round(CANVAS[0] / 2 - centroid)
    return max(0, min(left, CANVAS[0] - w))


def cutout(path: Path) -> Image.Image:
    src = Image.open(path).convert("RGB")
    rgb = np.asarray(src)
    bg = background_color(rgb)

    mask = foreground_mask(rgb, THRESH)
    # 描边和外圈背景之间那圈抗锯齿是浅灰，直接留成不透明就在深色卡面上亮出一圈边。
    # 但也不能整圈收掉：发簪流苏和金穗只有 3~4px 宽，一收就断。所以只在外缘环带里
    # 按「离背景色多远」给软 alpha——浅灰的洇边掉到低透明，实色的细线仍然是实的。
    diff = np.abs(rgb.astype(np.int16) - bg).sum(axis=2)
    soft = np.clip((diff - THRESH) / (MATT - THRESH), 0, 1)
    a = np.where(edge_band(mask, BAND), soft, mask).astype(np.float32) * 255
    a = np.asarray(Image.fromarray(a.astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(0.6)))
    rgb = decontaminate(rgb, a, bg)

    rgba = np.dstack([rgb, a])
    img = Image.fromarray(rgba, "RGBA")
    bbox = img.getbbox()
    img = img.crop(
        (
            max(bbox[0] - PAD, 0),
            max(bbox[1] - PAD, 0),
            min(bbox[2] + PAD, img.width),
            min(bbox[3] + PAD, img.height),
        )
    )
    scale = min(CANVAS[0] * FIT / img.width, CANVAS[1] * FIT / img.height)
    size = (max(round(img.width * scale), 1), max(round(img.height * scale), 1))
    img = img.resize(size, Image.LANCZOS)
    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    canvas.paste(img, (paste_x(img), (CANVAS[1] - size[1]) // 2), img)
    return canvas


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    made, missing = [], []
    for card in sorted(CARDS.glob("0*")):
        src = card / SRC_NAME
        if not (card / "card-config.json").exists() or not src.exists():
            missing.append(card.name)
            continue
        cid = card.name.split("-")[0]
        img = cutout(src)
        dst = OUT / f"{cid}.webp"
        img.save(dst, "WEBP", quality=90, method=6)
        made.append((cid, src.stat().st_size, dst.stat().st_size))

    for cid, raw, webp in made:
        print(f"{cid}: {raw/1024:.0f} KB -> {webp/1024:.1f} KB  {OUT.name}/{cid}.webp")
    if missing:
        print(f"无立绘，首页走占位：{'、'.join(missing)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
