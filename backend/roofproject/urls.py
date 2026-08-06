from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import TemplateView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("inspections.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.BASE_DIR / "static")

# Catch-all: let React Router handle any route Django doesn't recognize.
# Must stay last so it doesn't shadow admin/api/static/media.
urlpatterns += [
    re_path(r"^(?!admin/|api/|media/|static/).*$", TemplateView.as_view(template_name="index.html")),
]