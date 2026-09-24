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

# 多层主体的层名，按 z 序（后→中→前）。多层卡在 delivery.subjectLayers 里声明，
# 单层卡只给 subject 一项——prep 对两者的处理完全一致，都是"逐层增强 + 固化一张扁平并集"。
SUBJECT_Z_ORDER = ('subject_back', 'subject_mid', 'subject_front')


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


def subject_layers(cfg):
    """主体交付件，按 z 序（后→中→前）返回 [(资产层名, source 文件名), ...]。

    单层卡返回 [('subject', <delivery.subject>)]；多层卡在 card-config.json 里写

        "delivery": { "subjectLayers": { "subject_back": "...", "subject_mid": "...",
                                         "subject_front": "..." } }

    映射的键是资产层名（决定 assets/ 下的文件名与网页侧图层的角色），值才是 source/ 里的文件名。
    声明哪些层随卡片需要，但返回顺序一律按 SUBJECT_Z_ORDER，不受 JSON 里书写顺序影响。
    """
    declared = (cfg.get('delivery') or {}).get('subjectLayers')
    if not declared:
        return [('subject', delivery(cfg, 'subject'))]
    if not isinstance(declared, dict):
        sys.exit('delivery.subjectLayers 要写成 {资产层名: source 文件名} 的映射')
    unknown = [key for key in declared if key not in SUBJECT_Z_ORDER]
    if unknown:
        sys.exit(f'未知的主体层名 {unknown}；只认 {list(SUBJECT_Z_ORDER)}')
    return [(key, declared[key]) for key in SUBJECT_Z_ORDER if key in declared]


def darken(cfg):
    """背景压暗量。缺字段就按不压暗处理——压暗是审美决定，不该由脚本默认施加。"""
    return float(cfg.get('darken', 1.0))
