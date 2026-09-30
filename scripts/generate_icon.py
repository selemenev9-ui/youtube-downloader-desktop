from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "build"
OUT.mkdir(exist_ok=True)

S = 1024
im = Image.new("RGBA", (S, S), (0, 0, 0, 0))

# Soft cyan/violet aura.
glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
gd.ellipse((110, 110, 914, 914), fill=(90, 48, 255, 120))
gd.ellipse((300, 250, 980, 930), fill=(0, 225, 239, 90))
glow = glow.filter(ImageFilter.GaussianBlur(95))
im.alpha_composite(glow)

# Premium dark tile.
tile = Image.new("RGBA", (S, S), (0, 0, 0, 0))
td = ImageDraw.Draw(tile)
td.rounded_rectangle((105, 105, 919, 919), radius=235, fill=(12, 14, 30, 255), outline=(123, 103, 222, 180), width=8)
im.alpha_composite(tile)

# Diagonal purple-to-cyan inner orb.
orb = Image.new("RGBA", (S, S), (0, 0, 0, 0))
op = orb.load()
for y in range(S):
    for x in range(S):
        dx, dy = x - 512, y - 492
        if dx * dx + dy * dy <= 292 * 292:
            t = max(0.0, min(1.0, (x + y - 400) / 1050))
            r = int(145 * (1 - t) + 16 * t)
            g = int(77 * (1 - t) + 211 * t)
            b = int(255 * (1 - t) + 239 * t)
            op[x, y] = (r, g, b, 255)
orb = orb.filter(ImageFilter.GaussianBlur(0.35))
im.alpha_composite(orb)

d = ImageDraw.Draw(im)
# Play glyph.
d.polygon([(430, 330), (430, 640), (676, 485)], fill=(255, 255, 255, 255))
# Download cue, kept bold enough for 16px rendering.
d.rounded_rectangle((468, 690, 556, 830), radius=34, fill=(255, 255, 255, 255))
d.polygon([(390, 770), (634, 770), (512, 890)], fill=(255, 255, 255, 255))

im.save(OUT / "icon.png", optimize=True)
im.save(OUT / "icon.ico", format="ICO", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print(OUT / "icon.ico")
