from __future__ import annotations

import math
import random
import shutil
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "output" / "playwright" / "visual-pass-core-surfaces" / "iphone-max"
OUTPUT_DIR = ROOT / "output" / "app-store-connect" / "ios-6.5"
UPLOAD_DIR = ROOT / "output" / "app-store-connect" / "upload-ios-6.5"
ICON_PATH = ROOT / "ios" / "App" / "App" / "public" / "icon-512.png"

CANVAS = (1284, 2778)
RNG = random.Random(4900)


@dataclass(frozen=True)
class Scene:
    slug: str
    source: str
    eyebrow: str
    title: str
    subtitle: str
    metric: str
    colors: tuple[str, str, str, str]
    rotation: float
    phone_y: int


SCENES = [
    Scene(
        "01-safe-to-spend",
        "dashboard-top.png",
        "WEEKLY MONEY SNAPSHOT",
        "Know what is safe to spend",
        "Bills, buffers, cash pressure, and the next move in one clean view.",
        "B+  /  87",
        ("#050914", "#10233f", "#20e0a0", "#f2b84b"),
        -3.0,
        760,
    ),
    Scene(
        "02-weekly-audit",
        "audit-home-top.png",
        "FAST WEEKLY CHECK-IN",
        "Run a real money audit",
        "Turn balances, bills, and debt into a clear action plan for the week.",
        "5 min",
        ("#06080f", "#291842", "#7c5cff", "#ffcf5a"),
        3.2,
        775,
    ),
    Scene(
        "03-bills-renewals",
        "bills-top.png",
        "UPCOMING PRESSURE",
        "See bills before they hit",
        "Track renewals, due dates, and shortfalls before they become stress.",
        "$2.1k",
        ("#06110f", "#102f26", "#30dfb4", "#f8b851"),
        -2.2,
        775,
    ),
    Scene(
        "04-budget-buckets",
        "budget-top.png",
        "PRACTICAL BUDGETING",
        "Plan every dollar without spreadsheets",
        "Needs, wants, bills, and savings stay readable at a glance.",
        "4 buckets",
        ("#070b15", "#122a4b", "#63b3ff", "#f4bb57"),
        2.4,
        775,
    ),
    Scene(
        "05-card-rewards",
        "rewards-result-top.png",
        "PAY SMARTER",
        "Choose the right card before you pay",
        "Compare rewards and balances before your next purchase decision.",
        "Best card",
        ("#080711", "#2b1643", "#a87cff", "#3fe0b2"),
        -3.4,
        790,
    ),
    Scene(
        "06-ask-ai",
        "chat-history-top.png",
        "CONTEXT-AWARE AI",
        "Ask about your money week",
        "Get answers grounded in your audit, cash flow, and real constraints.",
        "Ask AI",
        ("#050a13", "#132c43", "#4dd6ff", "#f5bf5b"),
        2.8,
        770,
    ),
    Scene(
        "07-private-backups",
        "backup-top.png",
        "LOCAL-FIRST RECORDS",
        "Backup and restore with confidence",
        "Encrypted exports keep your money record portable and under control.",
        "Encrypted",
        ("#07090d", "#1d2418", "#8ed66b", "#f2b84b"),
        -2.7,
        785,
    ),
]


def hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def font(size: int, weight: str = "regular") -> ImageFont.FreeTypeFont:
    candidates = {
        "regular": [
            "/System/Library/Fonts/SFNS.ttf",
            "/System/Library/Fonts/HelveticaNeue.ttc",
            "/System/Library/Fonts/Helvetica.ttc",
        ],
        "bold": [
            "/System/Library/Fonts/SFNS.ttf",
            "/System/Library/Fonts/SFNSRounded.ttf",
            "/System/Library/Fonts/HelveticaNeue.ttc",
        ],
        "mono": [
            "/System/Library/Fonts/SFNSMono.ttf",
            "/System/Library/Fonts/Menlo.ttc",
        ],
    }[weight]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


FONT_EYEBROW = font(28, "mono")
FONT_TITLE = font(92, "bold")
FONT_TITLE_SMALL = font(82, "bold")
FONT_SUBTITLE = font(38)
FONT_METRIC = font(32, "bold")
FONT_BRAND = font(32, "bold")


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0], size[1]), radius=radius, fill=255)
    return mask


def gradient_background(size: tuple[int, int], colors: tuple[str, str, str, str]) -> Image.Image:
    w, h = size
    c0, c1, accent, warm = [hex_to_rgb(c) for c in colors]
    img = Image.new("RGB", size)
    pix = img.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        for x in range(w):
            u = x / max(w - 1, 1)
            r = int(c0[0] * (1 - t) + c1[0] * t)
            g = int(c0[1] * (1 - t) + c1[1] * t)
            b = int(c0[2] * (1 - t) + c1[2] * t)

            glow1 = math.exp(-(((u - 0.18) / 0.36) ** 2 + ((t - 0.2) / 0.22) ** 2))
            glow2 = math.exp(-(((u - 0.88) / 0.35) ** 2 + ((t - 0.78) / 0.3) ** 2))
            r = min(255, int(r + accent[0] * 0.28 * glow1 + warm[0] * 0.18 * glow2))
            g = min(255, int(g + accent[1] * 0.28 * glow1 + warm[1] * 0.18 * glow2))
            b = min(255, int(b + accent[2] * 0.28 * glow1 + warm[2] * 0.18 * glow2))
            pix[x, y] = (r, g, b)
    return img


def add_grain(img: Image.Image, opacity: int = 16) -> Image.Image:
    noise = Image.new("L", img.size)
    noise.putdata([RNG.randint(0, 255) for _ in range(img.size[0] * img.size[1])])
    grain = Image.merge("RGBA", (noise, noise, noise, Image.new("L", img.size, opacity)))
    return Image.alpha_composite(img.convert("RGBA"), grain)


def draw_orbs(canvas: Image.Image, scene: Scene) -> None:
    _, _, accent, warm = scene.colors
    for box, color, alpha in [
        ((-180, 170, 490, 840), accent, 58),
        ((790, 1180, 1550, 2040), warm, 42),
        ((-140, 2260, 520, 2920), "#ffffff", 16),
    ]:
        layer = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer)
        ld.ellipse(box, fill=(*hex_to_rgb(color), alpha))
        layer = layer.filter(ImageFilter.GaussianBlur(80))
        canvas.alpha_composite(layer)


def text_wrap(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.ImageFont, max_width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        trial = f"{current} {word}".strip()
        if draw.textbbox((0, 0), trial, font=fnt)[2] <= max_width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_multiline(draw: ImageDraw.ImageDraw, xy: tuple[int, int], lines: list[str], fnt, fill, spacing: int) -> int:
    x, y = xy
    for line in lines:
        draw.text((x, y), line, font=fnt, fill=fill)
        y += draw.textbbox((x, y), line, font=fnt)[3] - draw.textbbox((x, y), line, font=fnt)[1] + spacing
    return y


def icon_badge() -> Image.Image:
    icon = Image.open(ICON_PATH).convert("RGBA").resize((76, 76), Image.Resampling.LANCZOS)
    badge = Image.new("RGBA", (338, 108), (0, 0, 0, 0))
    d = ImageDraw.Draw(badge)
    d.rounded_rectangle((0, 0, 338, 108), radius=54, fill=(255, 255, 255, 22), outline=(255, 255, 255, 42), width=2)
    badge.alpha_composite(icon, (16, 16))
    d.text((108, 35), "Catalyst Cash", font=FONT_BRAND, fill=(246, 250, 255, 245))
    return badge


def make_phone(source: Path) -> Image.Image:
    screen_src = Image.open(source).convert("RGBA")
    screen_w = 746
    screen_h = int(screen_w * screen_src.height / screen_src.width)
    bezel = 44
    top = 82
    bottom = 44
    phone_w = screen_w + bezel * 2
    phone_h = screen_h + top + bottom

    phone = Image.new("RGBA", (phone_w, phone_h), (0, 0, 0, 0))
    d = ImageDraw.Draw(phone)
    d.rounded_rectangle((0, 0, phone_w, phone_h), radius=96, fill=(6, 8, 13, 255), outline=(124, 135, 160, 90), width=5)
    d.rounded_rectangle((10, 10, phone_w - 10, phone_h - 10), radius=88, outline=(255, 255, 255, 26), width=2)
    d.rounded_rectangle((phone_w // 2 - 84, 25, phone_w // 2 + 84, 53), radius=16, fill=(18, 20, 28, 255))

    screen = screen_src.resize((screen_w, screen_h), Image.Resampling.LANCZOS)
    screen_layer = Image.new("RGBA", (screen_w, screen_h), (0, 0, 0, 0))
    screen_layer.alpha_composite(screen)
    phone.alpha_composite(screen_layer, (bezel, top))
    phone.putalpha(Image.alpha_composite(Image.new("RGBA", phone.size, (0, 0, 0, 0)), phone).getchannel("A"))

    screen_mask = rounded_mask((screen_w, screen_h), 62)
    clipped = Image.new("RGBA", phone.size, (0, 0, 0, 0))
    clipped.paste(screen, (bezel, top), screen_mask)
    base = Image.new("RGBA", phone.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(base)
    d.rounded_rectangle((0, 0, phone_w, phone_h), radius=96, fill=(6, 8, 13, 255), outline=(124, 135, 160, 110), width=5)
    d.rounded_rectangle((10, 10, phone_w - 10, phone_h - 10), radius=88, outline=(255, 255, 255, 30), width=2)
    d.rounded_rectangle((phone_w // 2 - 84, 25, phone_w // 2 + 84, 53), radius=16, fill=(18, 20, 28, 255))
    base.alpha_composite(clipped)
    return base


def perspective_phone(phone: Image.Image, rotation: float) -> Image.Image:
    rotated = phone.rotate(rotation, expand=True, resample=Image.Resampling.BICUBIC)
    depth = Image.new("RGBA", (rotated.width + 34, rotated.height + 34), (0, 0, 0, 0))
    for offset, alpha in [(28, 56), (18, 62), (9, 70)]:
        layer = Image.new("RGBA", depth.size, (0, 0, 0, 0))
        layer.alpha_composite(rotated, (offset, offset))
        alpha_mask = layer.getchannel("A").point(lambda p: min(p, alpha))
        shadow_color = Image.new("RGBA", depth.size, (0, 0, 0, 255))
        shadow_color.putalpha(alpha_mask)
        shadow_color = shadow_color.filter(ImageFilter.GaussianBlur(14))
        depth.alpha_composite(shadow_color)
    depth.alpha_composite(rotated, (0, 0))
    return depth


def render_scene(scene: Scene) -> Path:
    canvas = add_grain(gradient_background(CANVAS, scene.colors), 12)
    draw = ImageDraw.Draw(canvas, "RGBA")
    draw_orbs(canvas, scene)

    canvas.alpha_composite(icon_badge(), (64, 70))

    accent = hex_to_rgb(scene.colors[2])
    warm = hex_to_rgb(scene.colors[3])
    pill_w = 250
    draw.rounded_rectangle((970, 78, 970 + pill_w, 166), radius=44, fill=(*accent, 34), outline=(*accent, 90), width=2)
    draw.text((1004, 105), scene.metric, font=FONT_METRIC, fill=(238, 255, 250, 245))

    draw.text((72, 250), scene.eyebrow, font=FONT_EYEBROW, fill=(*warm, 245))
    title_font = FONT_TITLE if len(scene.title) <= 31 else FONT_TITLE_SMALL
    title_lines = text_wrap(draw, scene.title, title_font, 1120)
    title_bottom = draw_multiline(draw, (68, 300), title_lines, title_font, (248, 250, 255, 255), 12)
    subtitle_lines = text_wrap(draw, scene.subtitle, FONT_SUBTITLE, 1040)
    draw_multiline(draw, (72, title_bottom + 24), subtitle_lines, FONT_SUBTITLE, (205, 218, 232, 235), 10)

    phone = perspective_phone(make_phone(SOURCE_DIR / scene.source), scene.rotation)
    x = (CANVAS[0] - phone.width) // 2
    canvas.alpha_composite(phone, (x, scene.phone_y))

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    target = OUTPUT_DIR / f"{scene.slug}.png"
    canvas.convert("RGB").save(target, "PNG", optimize=True)
    return target


def copy_upload_assets(paths: list[Path]) -> None:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    for path in paths:
        shutil.copy2(path, UPLOAD_DIR / path.name)


def render_contact_sheet(paths: list[Path]) -> Path:
    thumb_w = 214
    thumb_h = int(thumb_w * CANVAS[1] / CANVAS[0])
    gutter = 28
    label_h = 54
    cols = 4
    rows = math.ceil(len(paths) / cols)
    sheet_w = gutter + cols * (thumb_w + gutter)
    sheet_h = gutter + rows * (thumb_h + label_h + gutter)
    sheet = Image.new("RGB", (sheet_w, sheet_h), (8, 12, 20))
    d = ImageDraw.Draw(sheet)
    for idx, path in enumerate(paths):
        row = idx // cols
        col = idx % cols
        x = gutter + col * (thumb_w + gutter)
        y = gutter + row * (thumb_h + label_h + gutter)
        thumb = Image.open(path).convert("RGB").resize((thumb_w, thumb_h), Image.Resampling.LANCZOS)
        sheet.paste(thumb, (x, y))
        d.text((x, y + thumb_h + 14), path.stem, font=FONT_METRIC, fill=(229, 238, 249))
    target = OUTPUT_DIR / "contact-sheet.jpg"
    sheet.save(target, "JPEG", quality=92, optimize=True)
    return target


def main() -> None:
    generated = [render_scene(scene) for scene in SCENES]
    copy_upload_assets(generated)
    contact_sheet = render_contact_sheet(generated)
    print("\n".join(str(path) for path in [*generated, contact_sheet]))


if __name__ == "__main__":
    main()
