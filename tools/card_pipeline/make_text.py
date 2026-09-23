"""Text layer v3: the delivered combined border+title layer, used as-is."""
import sys
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import card_root, config, delivery

ROOT = card_root()
CFG = config(ROOT)
SRC = ROOT / 'assets'
DELIVERY = ROOT / 'source'

with Image.open(SRC / 'background.png') as bg:
    W, H = bg.size

im = Image.open(DELIVERY / delivery(CFG, 'text')).convert('RGBA').resize((W, H), Image.LANCZOS)
im.save(SRC / 'text.png')

prev = Image.new('RGBA', (W, H), (28, 36, 48, 255))
prev.alpha_composite(im)
prev.convert('RGB').save(ROOT / 'preview-text.png')
print('text.png', im.size)
