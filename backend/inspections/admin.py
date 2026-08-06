from django.contrib import admin
from .models import InspectionForm, ImagePage, PageImage


@admin.register(InspectionForm)
class InspectionFormAdmin(admin.ModelAdmin):
    list_display = ["id", "share_key", "owner", "address", "updated_at"]
    search_fields = ["share_key", "address", "owner__username"]


@admin.register(ImagePage)
class ImagePageAdmin(admin.ModelAdmin):
    list_display = ["id", "form", "order", "layout"]


@admin.register(PageImage)
class PageImageAdmin(admin.ModelAdmin):
    list_display = ["id", "page", "slot"]
