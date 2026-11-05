"""Generates the Paisa app icon + every Android mipmap. Run: python3 scripts/gen-icon.py (needs Pillow).
Design: midnight aurora background, a gradient coin ring with an opening, a ₹ whose leg ends in a glowing spark."""
import math, os
from PIL import Image, ImageDraw, ImageFilter, ImageChops

ROOT = os.path.join(os.path.dirname(__file__), '..')
N = 2048            # work at 2x, export at 1024
K = N / 1024

def px(v): return int(round(v * K))
def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
TEAL, BLUE, VIOLET = (61, 219, 169), (116, 192, 252), (132, 94, 247)
def ramp(t):  # teal -> blue -> violet
    return lerp(TEAL, BLUE, t * 2) if t < .5 else lerp(BLUE, VIOLET, (t - .5) * 2)

def background():
    img = Image.new('RGB', (N, N), (7, 11, 22))
    for (cx, cy, r, col, a) in [(150, 960, 640, TEAL, 95), (900, 90, 560, VIOLET, 105), (560, 560, 460, (20, 60, 130), 40)]:
        g = Image.new('L', (N, N), 0)
        ImageDraw.Draw(g).ellipse([px(cx - r), px(cy - r), px(cx + r), px(cy + r)], fill=a)
        g = g.filter(ImageFilter.GaussianBlur(px(170)))
        img = Image.composite(Image.new('RGB', (N, N), col), img, g)
    return img

def thick(draw, pts, w, fill=255):
    pts = [(px(x), px(y)) for x, y in pts]
    draw.line(pts, fill=fill, width=px(w), joint='curve')
    for x, y in (pts[0], pts[-1]): draw.ellipse([x - px(w) / 2, y - px(w) / 2, x + px(w) / 2, y + px(w) / 2], fill=fill)

def arc_pts(cx, cy, r, a0, a1, n=160):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]

def masks():
    ring, glyph = Image.new('L', (N, N), 0), Image.new('L', (N, N), 0)
    # Coin ring with an opening at the upper right (-70°..-20°), where the spark sits.
    thick(ImageDraw.Draw(ring), arc_pts(512, 512, 300, -15, 290), 36)
    d = ImageDraw.Draw(glyph)
    thick(d, [(392, 392), (632, 392)], 46)                       # top bar
    thick(d, [(392, 462), (632, 462)], 46)                       # second bar
    thick(d, [(392, 392), (520, 392)] + arc_pts(520, 466, 74, -90, 90) + [(412, 540)], 46)   # bowl
    thick(d, [(452, 540), (618, 676)], 46)                       # leg
    return ring, glyph

def gradient_fill(mask, angle=135):
    g = Image.new('RGB', (N, N))
    px_ = g.load(); ca, sa = math.cos(math.radians(angle)), math.sin(math.radians(angle))
    for y in range(0, N, 4):
        for x in range(0, N, 4):
            t = ((x - N / 2) * ca + (y - N / 2) * sa) / (N * 0.75) + 0.5
            c = ramp(max(0, min(1, t)))
            for dy in range(4):
                for dx in range(4): px_[x + dx, y + dy] = c
    out = Image.new('RGBA', (N, N), (0, 0, 0, 0)); out.paste(g, (0, 0), mask); return out

def glow(layer, radius, strength=1.0):
    a = layer.split()[3].filter(ImageFilter.GaussianBlur(px(radius)))
    a = a.point(lambda v: min(255, int(v * strength)))
    out = Image.new('RGBA', (N, N), (0, 0, 0, 0)); out.paste(layer.convert('RGB'), (0, 0), a); return out

def foreground():
    ring, glyph = masks()
    ringL = gradient_fill(ring, 120)
    glyphL = Image.new('RGBA', (N, N), (0, 0, 0, 0)); glyphL.paste(Image.new('RGB', (N, N), (255, 255, 255)), (0, 0), glyph)
    # subtle vertical tint so the glyph feels lit from above
    tint = gradient_fill(glyph, 90); glyphL = Image.blend(glyphL, tint, 0.28)
    glyphL.putalpha(glyph)
    # spark in the ring opening
    sx, sy = 512 + 300 * math.cos(math.radians(-42)), 512 + 300 * math.sin(math.radians(-42))
    spark = Image.new('RGBA', (N, N), (0, 0, 0, 0)); sd = ImageDraw.Draw(spark)
    sd.ellipse([px(sx - 30), px(sy - 30), px(sx + 30), px(sy + 30)], fill=(255, 255, 255, 255))
    halo = Image.new('RGBA', (N, N), (0, 0, 0, 0)); ImageDraw.Draw(halo).ellipse([px(sx - 56), px(sy - 56), px(sx + 56), px(sy + 56)], fill=(*TEAL, 255))
    halo = glow(halo, 26, 1.6)
    out = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    for layer in (glow(ringL, 30, 0.9), ringL, glow(glyphL, 18, 0.45), glyphL, halo, spark): out = Image.alpha_composite(out, layer)
    return out

def monochrome():
    ring, glyph = masks()
    m = ImageChops.lighter(ring, glyph)
    sx, sy = 512 + 300 * math.cos(math.radians(-42)), 512 + 300 * math.sin(math.radians(-42))
    ImageDraw.Draw(m).ellipse([px(sx - 30), px(sy - 30), px(sx + 30), px(sy + 30)], fill=255)
    out = Image.new('RGBA', (N, N), (0, 0, 0, 0)); out.paste(Image.new('RGB', (N, N), (255, 255, 255)), (0, 0), m); return out

def down(im, s): return im.resize((s, s), Image.LANCZOS)
def save(im, path): os.makedirs(os.path.dirname(path), exist_ok=True); im.save(path)

bg, fg, mono = background(), foreground(), monochrome()
full = Image.alpha_composite(bg.convert('RGBA'), fg)
A = os.path.join(ROOT, 'assets')
save(down(bg, 1024), f'{A}/android-icon-background.png'); save(down(fg, 1024), f'{A}/android-icon-foreground.png'); save(down(mono, 1024), f'{A}/android-icon-monochrome.png')
save(down(full, 1024).convert('RGB'), f'{A}/icon.png'); save(down(fg, 1024), f'{A}/splash-icon.png'); save(down(full, 96).convert('RGB'), f'{A}/favicon.png')

def legacy(size, circle):
    im = down(full, size); m = Image.new('L', (size * 4, size * 4), 0); d = ImageDraw.Draw(m)
    if circle: d.ellipse([0, 0, size * 4 - 1, size * 4 - 1], fill=255)
    else: d.rounded_rectangle([0, 0, size * 4 - 1, size * 4 - 1], radius=int(size * 4 * .22), fill=255)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0)); out.paste(im, (0, 0), m.resize((size, size), Image.LANCZOS)); return out

for d, (ls, ad) in {'mdpi': (48, 108), 'hdpi': (72, 162), 'xhdpi': (96, 216), 'xxhdpi': (144, 324), 'xxxhdpi': (192, 432)}.items():
    R = f'{ROOT}/android/app/src/main/res/mipmap-{d}'
    save(down(bg, ad).convert('RGB'), f'{R}/ic_launcher_background.png'); save(down(fg, ad), f'{R}/ic_launcher_foreground.png'); save(down(mono, ad), f'{R}/ic_launcher_monochrome.png')
    save(legacy(ls, False), f'{R}/ic_launcher.png'); save(legacy(ls, True), f'{R}/ic_launcher_round.png')
print('icons written')
