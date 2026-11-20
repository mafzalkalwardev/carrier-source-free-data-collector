#!/usr/bin/env python3
"""Build optimized images, favicons, and the Open Graph card for site/.

Outputs are committed under site/ so the folder can be copied to a web root
without running this script. Re-run after screenshot updates.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "docs" / "screenshots"
SITE = ROOT / "site"
IMAGES = SITE / "images"
ICONS = SITE / "icons"

SHOTS = {
    "popup-over-search": ("01-popup-over-search.png", (1024, 559)),
    "popup-closeup": ("02-popup-closeup.png", (397, 308)),
    "dashboard-stats": ("03-dashboard-stats.png", (448, 588)),
    "pagination": ("04-carriersource-pagination.png", (1024, 460)),
    "dashboard-authorization": ("06b-dashboard-hero.png", (785, 497)),
    "collection-controls": ("07-dashboard-collection-controls.png", (785, 497)),
}

PAPER = (247, 245, 239)
INK = (20, 28, 43)
BLUE = (29, 78, 216)
BLUE_SOFT = (219, 234, 254)
CREAM = (243, 240, 232)

FONT_BOLD = "/usr/share/fonts/truetype/macos/Inter-Bold.ttf"
FONT_SEMIBOLD = "/usr/share/fonts/truetype/macos/Inter-SemiBold.ttf"
FONT_REGULAR = "/usr/share/fonts/truetype/macos/Inter-Regular.ttf"


def flatten(im: Image.Image, bg=PAPER) -> Image.Image:
    if im.mode == "RGB":
        return im
    base = Image.new("RGB", im.size, bg)
    if im.mode == "RGBA":
        base.paste(im, mask=im.split()[-1])
        return base
    return im.convert("RGB")


def save_photo(im: Image.Image, stem: Path) -> None:
    im.save(stem.with_suffix(".avif"), quality=48, speed=6)
    im.save(stem.with_suffix(".webp"), quality=76, method=6)
    im.save(stem.with_suffix(".jpg"), quality=80, optimize=True, progressive=True)


def paint_mark(size: int) -> Image.Image:
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    cx = cy = size / 2
    radius = size * 0.42
    draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=BLUE + (255,))
    inner = radius * 0.55
    draw.ellipse((cx - inner, cy - inner, cx + inner, cy + inner), fill=BLUE_SOFT + (255,))
    return im


def rounded_paste(base: Image.Image, im: Image.Image, xy: tuple[int, int], radius: int) -> None:
    im = im.convert("RGBA")
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, im.size[0] - 1, im.size[1] - 1), radius=radius, fill=255)
    base.paste(im, xy, mask)


def build_og() -> None:
    canvas = Image.new("RGB", (1200, 630), INK)
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, 0, 14, 630), fill=BLUE)

    mark = paint_mark(64)
    canvas.paste(mark, (52, 52), mark)

    kicker = ImageFont.truetype(FONT_SEMIBOLD, 20)
    title = ImageFont.truetype(FONT_BOLD, 48)
    body = ImageFont.truetype(FONT_REGULAR, 24)
    small = ImageFont.truetype(FONT_REGULAR, 20)

    draw.text((132, 68), "INDUS WEB AGENCY", font=kicker, fill=BLUE_SOFT)
    draw.text((52, 188), "CarrierSource", font=title, fill=(255, 255, 255))
    draw.text((52, 250), "Free Data Collector", font=title, fill=(255, 255, 255))
    draw.text((52, 360), "Freely visible carrier cards,", font=body, fill=(226, 232, 240))
    draw.text((52, 396), "saved locally in Chrome.", font=body, fill=(226, 232, 240))
    draw.text((52, 456), "No API. No contact data.", font=small, fill=(203, 213, 225))
    draw.text((52, 552), "carriersource.induswebagency.com", font=small, fill=(219, 234, 254))
    draw.text((52, 582), "Not affiliated with CarrierSource", font=small, fill=(203, 213, 225))

    shot = flatten(Image.open(SRC / "06b-dashboard-hero.png"), (255, 255, 255))
    shot.thumbnail((500, 430), Image.Resampling.LANCZOS)
    panel = Image.new("RGB", (shot.width + 24, shot.height + 24), CREAM)
    panel.paste(shot, (12, 12))
    x = 1200 - panel.width - 40
    y = (630 - panel.height) // 2
    # Keep the headline column clear of the card.
    headline_end = 52 + int(title.getbbox("Free Data Collector")[2]) + 28
    if x < headline_end:
        raise SystemExit(f"OG card overlaps headline column at x={x}, text ends {headline_end}")
    rounded_paste(canvas, panel, (x, y), 26)

    out = IMAGES / "og.jpg"
    canvas.save(out, quality=86, optimize=True, progressive=True)
    if canvas.size != (1200, 630):
        raise SystemExit(f"OG image is {canvas.size}, expected 1200x630")


def main() -> None:
    IMAGES.mkdir(parents=True, exist_ok=True)
    ICONS.mkdir(parents=True, exist_ok=True)

    for name, (filename, expected) in SHOTS.items():
        im = flatten(Image.open(SRC / filename))
        if im.size != expected:
            raise SystemExit(f"{filename} is {im.size}, expected {expected}")
        save_photo(im, IMAGES / name)
        print(f"{name}: {im.size[0]}x{im.size[1]}")

    build_og()

    master = paint_mark(512)
    for size, dest in (
        (32, ICONS / "icon-32.png"),
        (180, SITE / "apple-touch-icon.png"),
        (192, ICONS / "icon-192.png"),
        (512, ICONS / "icon-512.png"),
    ):
        master.resize((size, size), Image.Resampling.LANCZOS).save(dest)

    ico_master = paint_mark(48)
    ico_master.save(
        SITE / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )

    (SITE / "favicon.svg").write_text(
        """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <circle cx="16" cy="16" r="13.44" fill="#1d4ed8"/>
  <circle cx="16" cy="16" r="7.392" fill="#dbeafe"/>
</svg>
""",
        encoding="utf-8",
    )

    print("\nBytes:")
    for path in sorted(SITE.rglob("*")):
        if path.is_file() and path.suffix.lower() in {".avif", ".webp", ".jpg", ".png", ".ico", ".svg"}:
            print(f"  {path.relative_to(SITE)}  {path.stat().st_size}")


if __name__ == "__main__":
    main()
