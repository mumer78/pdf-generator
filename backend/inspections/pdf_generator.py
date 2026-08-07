import io
import os

from django.conf import settings

from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_JUSTIFY
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageTemplate,
    NextPageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
    Flowable,
)

# ── Brand colours ─────────────────────────────────────────────────────────────
NAVY   = colors.HexColor("#13315C")
YELLOW = colors.HexColor("#F5A623")
RED    = colors.HexColor("#C0392B")

PAGE_W, PAGE_H = A4                  # 595.28 × 841.89 pt  (21 cm × 29.7 cm) — matches the Canva export exactly
L_MARGIN       = 0.6 * inch          # 43.2 pt
R_MARGIN       = 0.6 * inch          # 43.2 pt
CONTENT_W      = PAGE_W - L_MARGIN - R_MARGIN   # ≈ 508.9 pt

FOOTER_H        = 0.32 * inch
FOOTER_YELLOW_W = 2.20 * inch

HEADER_IMAGE_PATH = os.path.join(settings.BASE_DIR, "static", "assets", "header.png")
FONT_DIR          = os.path.join(settings.BASE_DIR, "static", "fonts")

# Calculate exact height of full-bleed header image across PAGE_W
HEADER_H = 172.4  # fallback estimate
if os.path.exists(HEADER_IMAGE_PATH):
    try:
        from PIL import Image as PILImage
        with PILImage.open(HEADER_IMAGE_PATH) as im:
            HEADER_H = PAGE_W * (im.height / im.width)
    except Exception:
        pass

# ── Font registry ─────────────────────────────────────────────────────────────
# Fonts pulled directly from the Canva template via pdfplumber inspection:
#   Title "ROOF INSPECTION"                         -> League Spartan Bold, 53.1pt
#   "Site Inspected" / "Summary of Inspection"      -> Calibri Bold, 25pt
#   Labels (Address, Reason for Inspection, etc.)   -> CanvaSans-Bold, 15pt (Canva-internal
#                                                       font, not downloadable — we substitute
#                                                       Arimo Bold at the same 15pt size)
#   Values / table content                          -> CanvaSans-Regular, 14pt (substitute:
#                                                       Arimo Regular, 14pt)
#   Summary + Issue/Concern body text                -> Arimo Regular, 14pt
#   "Issue/Concern" heading                          -> Anton Regular, 25pt
_FONT_FILES = {
    "Arimo-Regular":      "Arimo-Regular.ttf",
    "Arimo-Bold":         "Arimo-Bold.ttf",
    "Anton-Regular":      "Anton-Regular.ttf",
    "Calibri-Bold":       "calibrib.ttf",
    "LeagueSpartan-Bold": "LeagueSpartan-Bold.ttf",
}


def _register_fonts():
    registered = pdfmetrics.getRegisteredFontNames()
    for name, filename in _FONT_FILES.items():
        if name in registered:
            continue
        path = os.path.join(FONT_DIR, filename)
        if os.path.exists(path):
            try:
                pdfmetrics.registerFont(TTFont(name, path))
            except Exception:
                pass


def _font(preferred, fallback):
    return preferred if preferred in pdfmetrics.getRegisteredFontNames() else fallback


# ── Paragraph styles ──────────────────────────────────────────────────────────

def _styles():
    _register_fonts()
    styles = getSampleStyleSheet()

    # "ROOF INSPECTION" title — League Spartan Bold, 53.1pt in the template.
    # spaceAfter=54 matches the measured ~54pt gap before "Site Inspected".
    styles.add(ParagraphStyle(
        name="RoofTitle",
        fontName=_font("LeagueSpartan-Bold", "Helvetica-Bold"),
        fontSize=51,
        leading=100,
        textColor=NAVY,
        spaceBefore=25,
        spaceAfter=54,      # matches the Canva template's title -> heading gap
        alignment=TA_LEFT,
    ))

    # "Site Inspected" / "Summary of Inspection" headings — Calibri Bold 25 pt
    styles.add(ParagraphStyle(
        name="SectionHeading",
        fontName=_font("Calibri-Bold", "Helvetica-Bold"),
        fontSize=25,
        leading=30,
        textColor=colors.black,
        spaceBefore=10,
        spaceAfter=20,
    ))

    # "Issue/Concern" heading — Anton Regular 25 pt, Red, Underlined
    styles.add(ParagraphStyle(
        name="IssueHeading",
        fontName=_font("Anton-Regular", "Helvetica-Bold"),
        fontSize=25,
        leading=30,
        textColor=RED,
        underlineColor=RED,
        underlineWidth=1.2,
        underlineOffset=-3,
        spaceBefore=14,
        spaceAfter=8,
    ))

    # Summary / Issue-Concern body text — Arimo Regular 14 pt, Left-aligned, no indent
    styles.add(ParagraphStyle(
        name="BodyJustify",
        fontName=_font("Arimo-Regular", "Helvetica"),
        fontSize=14,
        leading=20,
        alignment=TA_LEFT,
        leftIndent=20,
    ))

    # Table values — Arimo Regular 14 pt, Left-aligned
    # (Canva template uses "CanvaSans-Regular" 14pt here — that font is
    # Canva-internal and can't be exported, so Arimo Regular at the same
    # 14pt size is the closest available match.)
    styles.add(ParagraphStyle(
        name="BodyLeft",
        fontName=_font("Arimo-Regular", "Helvetica"),
        fontSize=14,
        leading=20,
        alignment=TA_LEFT,
        leftIndent=40,
    ))

    # Table labels — Arimo Bold 15 pt
    # (Canva template uses "CanvaSans-Bold" 15pt — same substitution as above.)
    styles.add(ParagraphStyle(
        name="LabelBold",
        fontName=_font("Arimo-Bold", _font("Arimo-Regular", "Helvetica-Bold")),
        fontSize=15,
        leading=21,
        leftIndent=24,
        textColor=colors.black,
    ))

    return styles


# ── Page canvas callbacks ─────────────────────────────────────────────────────

def _draw_slanted_footer(canvas):
    """Draws the Navy + Yellow footer bar with a slanted diagonal divider line."""
    h = FOOTER_H
    w = PAGE_W
    split_x = w * 0.58   # ~345 pt
    slant_dx = 14        # horizontal slant offset

    # 1. Navy polygon (left side with slanted right edge)
    p1 = canvas.beginPath()
    p1.moveTo(0, 0)
    p1.lineTo(split_x + slant_dx, 0)
    p1.lineTo(split_x, h)
    p1.lineTo(0, h)
    p1.close()
    canvas.setFillColor(NAVY)
    canvas.drawPath(p1, fill=True, stroke=False)

    # 2. Yellow polygon (right side with matching slanted left edge)
    p2 = canvas.beginPath()
    p2.moveTo(split_x + slant_dx, 0)
    p2.lineTo(w, 0)
    p2.lineTo(w, h)
    p2.lineTo(split_x, h)
    p2.close()
    canvas.setFillColor(YELLOW)
    canvas.drawPath(p2, fill=True, stroke=False)


def _draw_first_page(canvas, doc):
    """Draws full-bleed header image (0 margin top/left/right) + slanted footer bar."""
    canvas.saveState()
    if os.path.exists(HEADER_IMAGE_PATH):
        canvas.drawImage(
            ImageReader(HEADER_IMAGE_PATH),
            0, PAGE_H - HEADER_H,
            width=PAGE_W, height=HEADER_H,
            mask="auto"
        )
    _draw_slanted_footer(canvas)
    canvas.restoreState()


def _draw_later_pages(canvas, doc):
    """Draws slanted footer bar at the bottom of subsequent pages."""
    canvas.saveState()
    _draw_slanted_footer(canvas)
    canvas.restoreState()


# ── Rounded-corner image flowable ─────────────────────────────────────────────

def _get_optimized_image(path):
    """Loads, downscales to max 900px, and compresses image in memory to
    speed up PDF generation and reduce file sizes on limited hosting."""
    try:
        from PIL import Image as PILImage
        im = PILImage.open(path)
        max_size = 900
        if im.width > max_size or im.height > max_size:
            im.thumbnail((max_size, max_size), PILImage.Resampling.LANCZOS)

        # Always save as JPEG for fastest encode / smallest size
        buf = io.BytesIO()
        if im.mode in ("RGBA", "P", "LA"):
            im = im.convert("RGB")
        im.save(buf, format="JPEG", quality=72, optimize=True)
        buf.seek(0)
        return buf
    except Exception:
        return path


class _RoundedImage(Flowable):
    def __init__(self, path, width, height, radius=12):
        super().__init__()
        self.path   = path
        self.width  = width
        self.height = height
        self.radius = radius

    def wrap(self, _aw, _ah):
        return self.width, self.height

    def draw(self):
        c = self.canv
        c.saveState()
        p = c.beginPath()
        p.roundRect(0, 0, self.width, self.height, self.radius)
        c.clipPath(p, stroke=0, fill=0)

        opt_src = _get_optimized_image(self.path)
        c.drawImage(
            ImageReader(opt_src), 0, 0,
            width=self.width, height=self.height,
            preserveAspectRatio=True, anchor="c",
        )
        c.restoreState()


# ── Image helpers ─────────────────────────────────────────────────────────────

def _image_path(img):
    if img.rendered_image:
        return img.rendered_image.path
    if img.original_image:
        return img.original_image.path
    return None


def _fit_dims(img_path, max_w, max_h):
    from PIL import Image as PILImage
    with PILImage.open(img_path) as im:
        ratio = im.height / im.width
    w = max_w
    h = w * ratio
    if h > max_h:
        h = max_h
        w = h / ratio
    return w, h


def _rounded_image(path, max_w, max_h, radius=12):
    w, h = _fit_dims(path, max_w, max_h)
    return _RoundedImage(path, w, h, radius=radius)


# ── Layout helpers ────────────────────────────────────────────────────────────

def _single_column_images(images, story):
    for img in images:
        path = _image_path(img)
        if path and os.path.exists(path):
            story.append(_rounded_image(path, CONTENT_W, 4.8 * inch))
            story.append(Spacer(1, 10))


def _stacked_two_images(img1, img2, story):
    path1 = _image_path(img1)
    path2 = _image_path(img2)
    if not (path1 and os.path.exists(path1) and path2 and os.path.exists(path2)):
        _single_column_images([i for i in (img1, img2) if i], story)
        return

    # Image 1 (top): left-aligned, width = 5.6 in, height = 3.5 in
    img_w, img_h = 5.6 * inch, 3.5 * inch
    img1_flowable = _rounded_image(path1, img_w, img_h)
    t1 = Table([[img1_flowable]], colWidths=[img_w], hAlign='LEFT')
    t1.setStyle(TableStyle([
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(t1)
    story.append(Spacer(1, 12))

    # Image 2 (bottom): right-aligned, width = 5.6 in, height = 3.5 in
    img2_flowable = _rounded_image(path2, img_w, img_h)
    t2 = Table([[img2_flowable]], colWidths=[img_w], hAlign='RIGHT')
    t2.setStyle(TableStyle([
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(t2)
    story.append(Spacer(1, 12))


def _main_photo_images(images, story):
    """Render a single large photo at full content width.
    The image's own aspect ratio (from the free crop) determines the height,
    capped at 7.5 in so it always fits on the page."""
    for img in images:
        path = _image_path(img)
        if path and os.path.exists(path):
            story.append(_rounded_image(path, CONTENT_W, 7.5 * inch))
            story.append(Spacer(1, 14))



# ── Main PDF builder ──────────────────────────────────────────────────────

def build_pdf(form) -> bytes:
    buffer = io.BytesIO()

    bottom_margin    = FOOTER_H + 0.4 * inch
    first_top_margin = HEADER_H + 0.40 * inch   # below full-bleed header image
    later_top_margin = 0.45 * inch               # normal top gap for pages 2+

    # Frames define the text area on each page type
    first_frame = Frame(
        L_MARGIN, bottom_margin,
        CONTENT_W,
        PAGE_H - first_top_margin - bottom_margin,
        id="first_frame", showBoundary=0,
    )
    later_frame = Frame(
        L_MARGIN, bottom_margin,
        CONTENT_W,
        PAGE_H - later_top_margin - bottom_margin,
        id="later_frame", showBoundary=0,
    )

    doc = BaseDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=L_MARGIN,
        rightMargin=R_MARGIN,
        topMargin=first_top_margin,
        bottomMargin=bottom_margin,
    )
    doc.addPageTemplates([
        PageTemplate(id="First",  frames=[first_frame], onPage=_draw_first_page),
        PageTemplate(id="Later",  frames=[later_frame], onPage=_draw_later_pages),
    ])

    from reportlab.platypus import KeepInFrame

    styles = _styles()
    story  = []

    # After page 1 ends, switch to the "Later" template (no header space)
    story.append(NextPageTemplate("Later"))

    # First page content (Title, Site Inspected, Summary)
    first_page_story = []
    first_page_story.append(Paragraph("ROOF INSPECTION", styles["RoofTitle"]))
    first_page_story.append(Paragraph("Site Inspected", styles["SectionHeading"]))
    site_rows = [
        [Paragraph("Address",               styles["LabelBold"]),
         Paragraph(form.address or "-",             styles["BodyLeft"])],
        [Paragraph("Reason for Inspection", styles["LabelBold"]),
         Paragraph(form.reason_for_inspection or "-", styles["BodyLeft"])],
        [Paragraph("Inspector",             styles["LabelBold"]),
         Paragraph(form.inspector or "-",           styles["BodyLeft"])],
        [Paragraph("Date of Inspection",    styles["LabelBold"]),
         Paragraph(form.date_of_inspection or "-", styles["BodyLeft"])],
    ]
    site_table = Table(site_rows, colWidths=[2.8 * inch, 4.3 * inch])
    site_table.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
    ]))
    first_page_story.append(site_table)

    first_page_story.append(Paragraph("Summary of Inspection", styles["SectionHeading"]))
    first_page_story.append(Paragraph(
        (form.summary or "").replace("\n", "<br/>"), styles["BodyJustify"]
    ))

    first_max_h = PAGE_H - first_top_margin - bottom_margin - 10
    story.append(KeepInFrame(CONTENT_W, first_max_h, first_page_story, mode='shrink'))

    # Image pages
    for page in form.pages.all().order_by("order", "id"):
        story.append(PageBreak())
        images = list(page.images.all().order_by("slot"))

        max_h = PAGE_H - later_top_margin - bottom_margin - 10
        page_story = []

        if page.layout == "main":
            _main_photo_images(images, page_story)
        elif len(images) >= 2:
            # 2 images uploaded
            _stacked_two_images(images[0], images[1], page_story)
        else:
            # 0 or 1 image
            _single_column_images(images, page_story)

        page_story.append(Paragraph("<u>Issue/Concern</u>", styles["IssueHeading"]))
        page_story.append(Paragraph(
            (page.issue_concern or "").replace("\n", "<br/>"), styles["BodyJustify"]
        ))

        story.append(KeepInFrame(CONTENT_W, max_h, page_story, mode='shrink'))

    # BaseDocTemplate uses onPage set in PageTemplate; no callbacks here
    doc.build(story)
    return buffer.getvalue()