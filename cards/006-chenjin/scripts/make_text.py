"""Text layer v3: the delivered combined border+title layer, used as-is."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets'
DELIVERY = ROOT / 'source'

with Image.open(SRC / 'background.png') as bg:
    W, H = bg.size

im = Image.open(DELIVERY / 'text.png').convert('RGBA').resize((W, H), Image.LANCZOS)
im.save(SRC / 'text.png')

prev = Image.new('RGBA', (W, H), (28, 36, 48, 255))
prev.alpha_composite(im)
prev.convert('RGB').save(ROOT / 'preview-text.png')
print('text.png', im.size)
