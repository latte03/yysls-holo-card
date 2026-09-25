"""把一张金线云纹图抠成首页膜层用的**遮罩** asset。

    python site/make_foil_asset.py <源图路径>

输出 site/public/assets/landing/foil-cloud.webp：白色线 + 透明底。存成遮罩而不是存成
"金色线"是有意的——landing.css 用 mask-image 用它，金色由 CSS 变量 --foil-ink 供给，
所以换色 / 调浓淡都不用重出图，调参面板也能实时改。

源图要求：暗底 + 亮线（AI 生成的描金云纹那类）。线越细越吃抗锯齿，所以抠 alpha 用了一段
斜坡而不是硬阈值：LO 以下算全透，HI 以上算全实，中间按 gamma 过渡。
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "public" / "assets" / "landing" / "foil-cloud.webp"

LONG_SIDE = 768  # 512x768 的遮罩 138KB。膜按 3 倍摆时卡面取到的是源图 1/3 宽，
# 再往上放大就会软；调到 1024 是 212KB，换的是"放大后仍锐"。
LO, HI = 3.0, 40.0  # alpha 斜坡两端（源图上的最大通道亮度）
GAMMA = 0.8  # <1 让细线的暗部更容易浮出来


def key(src: Path) -> Image.Image:
    im = Image.open(src).convert("RGB")
    if max(im.size) > LONG_SIDE:
        s = LONG_SIDE / max(im.size)
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    lum = np.asarray(im).astype(np.float32).max(axis=2)
    a = np.clip((lum - LO) / (HI - LO), 0.0, 1.0) ** GAMMA
    rgb = np.full(lum.shape + (3,), 255, dtype=np.uint8)
    return Image.fromarray(np.dstack([rgb, (a * 255).astype(np.uint8)]), "RGBA")


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    src = Path(sys.argv[1])
    if not src.exists():
        sys.exit(f"找不到源图 {src}")
    img = key(src)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "WEBP", lossless=True, exact=True, method=6)

    a = np.asarray(img)[:, :, 3]
    # 只存 alpha 有意义，所以 lossless 比 lossy 还小：色平面全是白，VP8 的比特花在无用的地方。
    print(f"{OUT.name}: {img.width}x{img.height}  {OUT.stat().st_size / 1024:.0f} KB  实心 {(100 * (a > 250).mean()):.1f}%  半透 {(100 * ((a > 4) & (a < 250)).mean()):.1f}%")
    return 0


if __name__ == "__main__":
    sys.exit(main())
