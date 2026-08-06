import random
import string

from django.conf import settings
from django.db import models


def generate_share_key():
    """Generate a unique 5-digit numeric key used to share/view a form."""
    while True:
        key = "".join(random.choices(string.digits, k=5))
        if not InspectionForm.objects.filter(share_key=key).exists():
            return key


class InspectionForm(models.Model):
    """One roof inspection report/document."""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="forms"
    )
    share_key = models.CharField(max_length=5, unique=True, editable=False)

    # "Site Inspected" section
    address = models.CharField(max_length=255, blank=True, default="")
    reason_for_inspection = models.CharField(max_length=255, blank=True, default="")
    inspector = models.CharField(max_length=255, blank=True, default="")
    date_of_inspection = models.CharField(max_length=50, blank=True, default="")

    # "Summary of Inspection" section
    summary = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if not self.share_key:
            self.share_key = generate_share_key()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Inspection {self.share_key} ({self.address or 'no address'})"


class ImagePage(models.Model):
    """A page in the report: 1 image, 2 images, or a resizable Main Photo, with an Issue/Concern block."""

    LAYOUT_CHOICES = (
        ("main", "Main Photo Page"),
        ("single", "1 Image Page"),
        ("double", "2 Image Page"),
    )

    form = models.ForeignKey(
        InspectionForm, on_delete=models.CASCADE, related_name="pages"
    )
    order = models.PositiveIntegerField(default=0)
    layout = models.CharField(max_length=10, choices=LAYOUT_CHOICES, default="single")
    issue_concern = models.TextField(blank=True, default="")
    # Only meaningful for layout="main": lets the user resize the big photo
    # frame in the PDF instead of it being a fixed size. Values in inches.
    photo_height_in = models.FloatField(default=5.6)
    photo_width_in  = models.FloatField(default=7.06)  # default = full content width

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"Page {self.order} ({self.layout}) of {self.form.share_key}"


class PageImage(models.Model):
    """A single image slot within an ImagePage, with its non-destructive edit state."""

    page = models.ForeignKey(ImagePage, on_delete=models.CASCADE, related_name="images")
    slot = models.PositiveIntegerField(default=1)  # 1 or 2

    original_image = models.ImageField(upload_to="uploads/originals/", blank=True, null=True)
    # Flattened preview/output used for PDF generation & thumbnail display.
    rendered_image = models.ImageField(upload_to="uploads/rendered/", blank=True, null=True)

    # Non-destructive edit state so the editor can be reopened later.
    crop_data = models.JSONField(blank=True, null=True)  # {x, y, width, height} in % of original
    shapes = models.JSONField(blank=True, null=True)  # list of {x,y,rx,ry,thickness,color}

    class Meta:
        ordering = ["slot"]

    def __str__(self):
        return f"Image slot {self.slot} of page {self.page_id}"