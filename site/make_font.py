"""把方正金隶的完整 TTF 裁成站点用的子集 woff2。

源字体 6.2MB（GBK 全集 8000+ 字），而整站文案是固定的几百个字，子集后通常几十 KB。
文案全部来自仓库里的静态文件（模板 / 卡配置 / app.js 里的界面字符串），所以子集可以
完全按这些文件推出来——改了文案或新增一张卡之后要重跑：

    python site/make_font.py

脚本会把字体里没有的字列出来：那些字会掉到 font-family 链的下一个字体上，卡名里出现
就是单个字的字形突变，最好换字或补字。
"""
import string
import sys
from pathlib import Path

from fontTools import subset

# Windows 的控制台默认 GBK，缺字列表里一个 « 就能让 print 崩掉。
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent
SRC = ROOT.parent / "brand" / "fonts" / "FZJinLS-B-GB.ttf"
OUT = ROOT / "public" / "fonts" / "fzjinls.woff2"

# 界面文案的真实来源：模板、首页、注册表、五张卡的配置、查看器脚本、深浅色开关（它的
# 按钮文案是 JS 写的）。样式表里没有会渲染的字（只有 content:""），扫它们只会把注释里的
# 破折号算进"缺字"。
SOURCES = [
    "card.template.html",
    "index.html",
    "cards.manifest.js",
    "finishes.js",
    "viewer/app.js",
    "viewer/theme.js",
]

# 文案之外一定要在的字：ASCII、常见标点、排版符号。
BASELINE = (
    string.printable
    + "·—–…‘’“”«»‹›"
    + "、。，．；：？！％‰（）〔〕〔〕【】《》〈〉「」『』"
    + "°±×÷−＝≠≈≤≥→←↑↓✓"
    + "㈠ⅡⅢⅣ"
)


def collect():
    """返回（要裁的字，文案里真实出现的字）。后者用来判断"缺字"要不要报警。"""
    files = [ROOT / name for name in SOURCES] + sorted(ROOT.glob("*/card.config.js"))
    used = set()
    for path in files:
        if not path.exists():
            sys.exit(f"缺少 {path}，请检查 SOURCES 列表")
        used.update(path.read_text(encoding="utf-8"))
    chars = {c for c in set(BASELINE) | used if ord(c) > 0x20}
    return "".join(sorted(chars)), "".join(c for c in sorted(used) if ord(c) > 0x20)


def main() -> int:
    if not SRC.exists():
        sys.exit(f"找不到源字体 {SRC}")
    chars, used = collect()
    options = subset.Options()
    options.flavor = "woff2"
    options.ignore_missing_unicodes = True
    options.layout_features = ["kern", "liga", "palt", "vert"]
    font = subset.load_font(str(SRC), options)
    cmap = font.getBestCmap()
    missing = [c for c in chars if ord(c) not in cmap]
    subsetter = subset.Subsetter(options)
    subsetter.populate(text=chars)
    subsetter.subset(font)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    subset.save_font(font, str(OUT), options)
    size = OUT.stat().st_size
    print(f"{SRC.name}: {len(chars)} 个候选字 → {OUT.relative_to(ROOT.parent)} {size/1024:.1f} KB")
    # 只报文案里真的出现的：BASELINE 里多列的符号缺了不影响显示。
    gaps = [c for c in missing if c in used]
    if gaps:
        print(f"文案里 {len(gaps)} 个字这套字库没有，会掉到备用字体：{''.join(gaps)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
