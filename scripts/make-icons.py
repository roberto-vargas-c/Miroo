"""Render the app icons (favicon, PWA, Apple touch) from the logo mark.

The mark matches src/components/Logo.tsx: three overlapping rounded squares
drawn in a 32-unit box. Run with: python3 scripts/make-icons.py
Needs Pillow (pip install pillow).
"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public"
SS = 4  # supersampling for smooth edges

# (x, y, w, h, rx, colour, opacity) in logo units, same as Logo.tsx
RECTS = [
    (2, 8, 16, 16, 4, (0x14, 0xA3, 0x8B), 1.0),
    (9, 4, 16, 16, 4, (0x0D, 0x6B, 0x5E), 0.85),
    (14, 12, 16, 16, 4, (0xF5, 0x9E, 0x0B), 0.9),
]
MARK_X0, MARK_Y0, MARK_W, MARK_H = 2, 4, 28, 24  # bounds of the three squares


def render(size, mark_width, background=None):
    """Draw the mark centred, mark_width as a fraction of the icon width."""
    px = size * SS
    # Blend the overlaps on white, then cut the outline out, so the
    # see-through squares look the same on a dark taskbar as on white.
    img = Image.new("RGBA", (px, px), (255, 255, 255, 255))
    shape = Image.new("L", (px, px), 0)
    unit = px * mark_width / MARK_W
    ox = (px - MARK_W * unit) / 2 - MARK_X0 * unit
    oy = (px - MARK_H * unit) / 2 - MARK_Y0 * unit
    for x, y, w, h, rx, rgb, a in RECTS:
        layer = Image.new("RGBA", (px, px), (0, 0, 0, 0))
        ImageDraw.Draw(layer).rounded_rectangle(
            [ox + x * unit, oy + y * unit, ox + (x + w) * unit, oy + (y + h) * unit],
            radius=rx * unit,
            fill=rgb + (round(255 * a),),
        )
        img = Image.alpha_composite(img, layer)
        shape.paste(255, mask=layer.getchannel("A").point(lambda v: 255 if v else 0))
    if background is None:
        img.putalpha(shape)
    return img.resize((size, size), Image.LANCZOS)


WHITE = (255, 255, 255, 255)

# Transparent, edge to edge: what desktop taskbars, docks and browser tabs show.
for s in (16, 32, 48, 192, 512):
    render(s, 0.98).save(OUT / "icons" / f"icon-{s}.png", optimize=True)
render(48, 0.98).save(
    OUT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)]
)
# Maskable (Android adaptive icons): solid background, mark inside the
# 80% safe circle so no launcher shape crops it.
render(512, 0.62, WHITE).convert("RGB").save(OUT / "icons" / "maskable-512.png", optimize=True)
# iOS fills transparency with black, so keep white, but let the mark fill it.
render(180, 0.84, WHITE).convert("RGB").save(
    OUT / "icons" / "apple-touch-icon.png", optimize=True
)
