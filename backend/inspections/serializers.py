from django.contrib.auth.models import User
from rest_framework import serializers

from .models import InspectionForm, ImagePage, PageImage


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=4)

    class Meta:
        model = User
        fields = ["id", "username", "password"]

    def create(self, validated_data):
        user = User(username=validated_data["username"])
        user.set_password(validated_data["password"])
        user.save()
        return user


class PageImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = PageImage
        fields = [
            "id",
            "page",
            "slot",
            "original_image",
            "rendered_image",
            "crop_data",
            "shapes",
        ]
        read_only_fields = ["id"]


class ImagePageSerializer(serializers.ModelSerializer):
    images = PageImageSerializer(many=True, read_only=True)
    photo_height_in = serializers.FloatField(required=False, allow_null=True, default=5.6)
    photo_width_in = serializers.FloatField(required=False, allow_null=True, default=7.06)

    class Meta:
        model = ImagePage
        fields = ["id", "form", "order", "layout", "issue_concern", "photo_height_in", "photo_width_in", "images"]
        read_only_fields = ["id", "form", "images"]

    def validate_photo_height_in(self, value):
        if value is None:
            return 5.6
        return value

    def validate_photo_width_in(self, value):
        if value is None:
            return 7.06
        return value


class InspectionFormSerializer(serializers.ModelSerializer):
    pages = ImagePageSerializer(many=True, read_only=True)
    owner_username = serializers.CharField(source="owner.username", read_only=True)

    class Meta:
        model = InspectionForm
        fields = [
            "id",
            "share_key",
            "owner_username",
            "address",
            "reason_for_inspection",
            "inspector",
            "date_of_inspection",
            "summary",
            "created_at",
            "updated_at",
            "pages",
        ]
        read_only_fields = ["id", "share_key", "owner_username", "created_at", "updated_at", "pages"]