from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from . import views

urlpatterns = [
    # Auth
    path("auth/register/", views.RegisterView.as_view(), name="register"),
    path("auth/login/", TokenObtainPairView.as_view(), name="login"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),

    # Forms (History = "my forms")
    path("forms/", views.MyFormsView.as_view(), name="my-forms"),
    path("forms/<int:pk>/", views.FormDetailView.as_view(), name="form-detail"),
    path("forms/<int:form_id>/pdf/", views.FormPdfView.as_view(), name="form-pdf"),

    # View Others by 5-digit key
    path("forms/by-key/<str:key>/", views.FormByKeyView.as_view(), name="form-by-key"),
    path("forms/by-key/<str:key>/pdf/", views.FormPdfByKeyView.as_view(), name="form-by-key-pdf"),

    # Image pages
    path("forms/<int:form_id>/pages/", views.PageListCreateView.as_view(), name="page-list-create"),
    path("pages/<int:pk>/", views.PageDetailView.as_view(), name="page-detail"),
    path("pages/<int:page_id>/images/<int:slot>/", views.PageImageUploadView.as_view(), name="page-image-upload"),
]
