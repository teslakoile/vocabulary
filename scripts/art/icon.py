"""
Draws the app icon: a postage stamp on the app's sky, with a serif V.

    python3 scripts/art/icon.py

Writes public/icon-{180,192,512}.png. The stamp stays inside the middle 64% of
the square, which is within the area a maskable icon is guaranteed to show.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]

SKY = (58, 123, 196)
HORIZON = (76, 146, 205)
WHITE = (255, 255, 255)
SERIF = '/System/Library/Fonts/Supplemental/Baskerville.ttc'


def icon(size: int) -> Image.Image:
    scale = 4
    big = size * scale
    art = Image.new('RGB', (big, big), SKY)
    draw = ImageDraw.Draw(art)

    # The stamp: a white sheet, with a row of bites along each edge.
    side = big * 0.64
    left = top = (big - side) / 2
    right = bottom = left + side
    draw.rectangle([left, top, right, bottom], fill=WHITE)
    teeth = 11
    bite = side / teeth * 0.3
    for i in range(teeth):
        at = left + (i + 0.5) * side / teeth
        for cx, cy in ((at, top), (at, bottom), (left, at), (right, at)):
            draw.ellipse([cx - bite, cy - bite, cx + bite, cy + bite], fill=SKY)

    # The picture on it: the same sky, lighter toward the bottom.
    inset = side * 0.11
    x0, y0, x1, y1 = left + inset, top + inset, right - inset, bottom - inset
    for y in range(int(y0), int(y1)):
        t = (y - y0) / (y1 - y0)
        tone = tuple(round(a + (b - a) * t) for a, b in zip(SKY, HORIZON))
        draw.line([(x0, y), (x1, y)], fill=tone)

    font = ImageFont.truetype(SERIF, int(side * 0.62))
    draw.text(((x0 + x1) / 2, (y0 + y1) / 2 + side * 0.015), 'V', font=font, fill=WHITE, anchor='mm')
    return art.resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    for size in (180, 192, 512):
        icon(size).save(ROOT / 'public' / f'icon-{size}.png', optimize=True)
        print('wrote', f'public/icon-{size}.png')
