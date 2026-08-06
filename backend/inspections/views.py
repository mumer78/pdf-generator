from django.contrib.auth.models import User
from django.http import HttpResponse
from django.shortcuts import get_object_or_404

from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import InspectionForm, ImagePage, PageImage
from .serializers import (
    RegisterSerializer,
    InspectionFormSerializer,
    ImagePageSerializer,
    PageImageSerializer,
)
from .pdf_generator import build_pdf


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


class MyFormsView(generics.ListCreateAPIView):
    """History: list forms belonging to the logged in user, or create a new one."""

    serializer_class = InspectionFormSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return InspectionForm.objects.filter(owner=self.request.user).order_by("-updated_at")

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class FormDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Access your own form directly by numeric id."""

    serializer_class = InspectionFormSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return InspectionForm.objects.filter(owner=self.request.user)


class FormByKeyView(generics.RetrieveUpdateAPIView):
    """
    'View Others' tab: look a form up by its 5-digit share key.
    Any authenticated user can view/edit; edits are saved on the original
    owner's record (ownership never transfers).
    """

    serializer_class = InspectionFormSerializer
    permission_classes = [permissions.IsAuthenticated]
    lookup_field = "share_key"
    lookup_url_kwarg = "key"
    queryset = InspectionForm.objects.all()


class PageListCreateView(generics.ListCreateAPIView):
    """Add / list image pages for a given form id."""

    serializer_class = ImagePageSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return ImagePage.objects.filter(form_id=self.kwargs["form_id"]).order_by("order", "id")

    def perform_create(self, serializer):
        form = get_object_or_404(InspectionForm, id=self.kwargs["form_id"])
        serializer.save(form=form)


class PageDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ImagePageSerializer
    permission_classes = [permissions.IsAuthenticated]
    queryset = ImagePage.objects.all()


class PageImageUploadView(APIView):
    """
    Create or update the image (and its non-destructive edit state) for a
    given slot (1 or 2) on a page. Accepts multipart/form-data:
      - original_image (file, optional if already uploaded previously)
      - rendered_image (file, the flattened preview used in the PDF)
      - crop_data (JSON string)
      - shapes (JSON string)
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, page_id, slot):
        page = get_object_or_404(ImagePage, id=page_id)
        image, _ = PageImage.objects.get_or_create(page=page, slot=slot)

        if "original_image" in request.FILES:
            image.original_image = request.FILES["original_image"]
        if "rendered_image" in request.FILES:
            image.rendered_image = request.FILES["rendered_image"]

        import json

        if "crop_data" in request.data:
            raw = request.data["crop_data"]
            image.crop_data = json.loads(raw) if isinstance(raw, str) else raw
        if "shapes" in request.data:
            raw = request.data["shapes"]
            image.shapes = json.loads(raw) if isinstance(raw, str) else raw

        image.save()
        
        # Auto-upgrade layout to double if slot 2 is uploaded on a single page
        if int(slot) == 2 and page.layout == "single":
            page.layout = "double"
            page.save()

        return Response(PageImageSerializer(image).data, status=status.HTTP_200_OK)

    def delete(self, request, page_id, slot):
        page = get_object_or_404(ImagePage, id=page_id)
        # Convert slot parameter to integer
        slot_num = int(slot)
        
        # Delete the target image in this slot
        PageImage.objects.filter(page=page, slot=slot_num).delete()

        # If slot 1 was deleted but slot 2 still exists, shift slot 2 to slot 1
        slot1 = PageImage.objects.filter(page=page, slot=1).first()
        slot2 = PageImage.objects.filter(page=page, slot=2).first()
        if slot2 and not slot1:
            slot2.slot = 1
            slot2.save()

        # Automatically update layout to single if only 1 image remains
        remaining_count = PageImage.objects.filter(page=page).count()
        if remaining_count <= 1 and page.layout == "double":
            page.layout = "single"
            page.save()

        return Response(ImagePageSerializer(page).data, status=status.HTTP_200_OK)


class FormPdfView(APIView):
    """Generate and return the PDF for a form, looked up by numeric id."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, form_id):
        form = get_object_or_404(InspectionForm, id=form_id)
        pdf_bytes = build_pdf(form)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'inline; filename="inspection_{form.share_key}.pdf"'
        return response


class FormPdfByKeyView(APIView):
    """Generate and return the PDF for a form, looked up by its share key."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, key):
        form = get_object_or_404(InspectionForm, share_key=key)
        pdf_bytes = build_pdf(form)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'inline; filename="inspection_{form.share_key}.pdf"'
        return response
