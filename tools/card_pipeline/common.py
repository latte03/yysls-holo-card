"""建卡管线的公共入口约定：卡目录由 --card 传入，卡级参数一律读 card-config.json。

各步骤脚本（prep_layers / make_text / make_back / align_lineart）只从这里拿路径与参数，
算法本身保持与各卡历史产出一致。新增一张卡不再拷脚本，只要写好 card-config.json。
"""
import json
import sys
from pathlib import Path

# 交付层在 source/ 下的默认文件名；卡片若用别的名字，在 card-config.json 的 delivery 里覆盖。
DEFAULT_DELIVERY = {
    'subject': 'subject.png',
    'text': 'text.png',
    'lineart': 'lineart_src.png',
    'background': 'background_orig.png',
}


def card_root():
    """取 --card 指定的卡目录（相对仓库根或绝对路径皆可），并校验配置在位。"""
    argv = sys.argv[1:]
    if '--card' not in argv:
        sys.exit('用法：python3 tools/card_pipeline/<step>.py --card cards/00X-<name>')
    value = argv[argv.index('--card') + 1]
    root = Path(value).resolve()
    if not (root / 'card-config.json').exists():
        sys.exit(f'{root} 下没有 card-config.json')
    for layer in ('source', 'assets'):
        (root / layer).mkdir(exist_ok=True)
    return root


def config(root):
    return json.loads((root / 'card-config.json').read_text(encoding='utf-8-sig'))


def delivery(cfg, layer):
    return (cfg.get('delivery') or {}).get(layer) or DEFAULT_DELIVERY[layer]


def darken(cfg):
    """背景压暗量。缺字段就按不压暗处理——压暗是审美决定，不该由脚本默认施加。"""
    return float(cfg.get('darken', 1.0))
