"""【已被取代】画首页卡镭射膜用的无缝云纹 tile。

首页现在用的是 make_foil_asset.py 抠出来的那张遮罩，这个脚本暂时没有产出者。留着的原因
只有一个：它是零许可风险的兜底——万一哪天那张生成图要换掉，这里能纯程序画一张出来。
它输出的还是平铺 tile，和现在"整图放大取景"的路子不同，接进 CSS 时要改 .foil 的
mask-size / mask-repeat。

输出 site/public/assets/landing/foil-cloud.png：透明底、金色细线、四边按模绕回，
所以 background-repeat 拼不出缝。改密度 / 线宽 / 色相就改下面那组常量重跑：

    python site/make_foil_tile.py

纹样的**视觉语言**（旋云头 + 描金细线 + 同向流转的水纹）参考用户提供的那张图，但那
张是昵图网付费图库素材（带水印和 ID，且实测非周期：对边相关系数≈0，切不出无缝块），
一个像素都没取用——全部由这里的参数生成。
"""
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "public" / "assets" / "landing" / "foil-cloud.png"

TILE = 128  # tile 边长（最终图就是这么大，卡面按 background-size 摆）
SS = 4  # 超采样：画布先放大这么多倍再降采样，拿抗锯齿
COLS, ROWS = 3, 3  # 一个 tile 里放几个卷云单元（决定密度）

GOLD = (216, 178, 116)  # 描金，和 --gold token 同一支
INK = 255  # 掩膜是 L 模式，落笔只能是灰阶单值；上色在合成那一步做
LINE = 1.1  # 线宽（最终图上的像素，内部按 SS 放大）

# 卷云头：对数螺线 r = R·e^(-bθ)。TURNS 定圈数，B 定收得有多急。
TURNS = 1.45
B = 0.33
NESTS = (1.0, 1.45, 1.95)  # 一个云头画几条同心旋线（参考图那种"多重轮廓"）
R_EYE = 0.17  # 最内圈半径占单元边长的比例
TAIL = 1.05  # 尾梢长度（占单元边长）
TAIL_SAG = 0.34  # 尾梢上下摆的幅度


def spiral(cx, cy, r_outer, curl, steps=140):
    """从外端开始往内卷的一条对数螺线，curl = ±1 定旋向。"""
    th_max = TURNS * 2 * math.pi
    return [
        (
            cx + r_outer * math.exp(-B * th) * math.cos(curl * th),
            cy + r_outer * math.exp(-B * th) * math.sin(curl * th),
        )
        for th in (th_max * i / steps for i in range(steps + 1))
    ]


def tail(p0, length, sag, steps=60):
    """从云头外端顺流向（+x）甩出去的一条二次贝塞尔尾梢。"""
    px, py = p0
    cx, cy = px + length * 0.55, py + sag * length * 0.5
    ex, ey = px + length, py + sag * length
    return [
        (
            (1 - t) ** 2 * px + 2 * (1 - t) * t * cx + t**2 * ex,
            (1 - t) ** 2 * py + 2 * (1 - t) * t * cy + t**2 * ey,
        )
        for t in (i / steps for i in range(steps + 1))
    ]


def unit(cx, cy, cell, curl, sag):
    """一个卷云头：几条同心旋线，各自顺流向甩一条尾梢。"""
    for k in NESTS:
        arm = spiral(cx, cy, cell * R_EYE * k, curl)
        DRAW.line([(x * SS, y * SS) for x, y in arm], fill=INK, width=round(LINE * SS), joint="curve")
        wave = tail(arm[0], cell * TAIL * (0.55 + 0.45 * k), sag * TAIL_SAG)
        DRAW.line([(x * SS, y * SS) for x, y in wave], fill=INK, width=round(LINE * SS), joint="curve")


def draw_wrapped(cx, cy, cell, curl, sag):
    """把单元连同周围 8 份一起画：越出边界的笔画会从对边补回来，这是无缝的全部来源。"""
    for dx in (-TILE, 0, TILE):
        for dy in (-TILE, 0, TILE):
            unit(cx + dx, cy + dy, cell, curl, sag)


MASK = Image.new("L", (TILE * SS, TILE * SS), 0)
DRAW = ImageDraw.Draw(MASK)

CELL_W, CELL_H = TILE / COLS, TILE / ROWS
for row in range(ROWS + 1):
    for col in range(COLS + 1):
        # 砖砌式错位：奇数行推半个单元，旋头才会互相咬住而不是排成齐刷刷的队列。
        # 旋向按行交替、起伏按单元交替，但尾梢永远朝 +x —— 水是一个方向流的。
        draw_wrapped(
            col * CELL_W + (CELL_W / 2 if row % 2 else 0),
            row * CELL_H,
            CELL_W,
            1 if row % 2 else -1,
            1 if (row + col) % 2 else -1,
        )

lines = MASK.resize((TILE, TILE), Image.LANCZOS)
tile = Image.new("RGBA", (TILE, TILE), GOLD + (0,))
tile.putalpha(lines)

OUT.parent.mkdir(parents=True, exist_ok=True)
tile.save(OUT, "PNG", optimize=True)

print(
    f"{OUT.name}: {TILE}x{TILE}  {OUT.stat().st_size / 1024:.1f} KB  "
    f"落墨覆盖率 {100 * np.asarray(lines).mean() / 255:.1f}%"
)
