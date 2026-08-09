from django.db.models.signals import post_delete, pre_save
from django.dispatch import receiver

from .models import PageImage


@receiver(post_delete, sender=PageImage)
def delete_image_files_on_delete(sender, instance, **kwargs):
    """
    Runs whenever a PageImage row is deleted — whether directly, or via
    cascade delete from removing its ImagePage or InspectionForm.
    Removes the actual files from disk so they don't become orphaned.
    """
    if instance.original_image:
        instance.original_image.delete(save=False)
    if instance.rendered_image:
        instance.rendered_image.delete(save=False)


@receiver(pre_save, sender=PageImage)
def delete_old_files_on_replace(sender, instance, **kwargs):
    """
    Runs before a PageImage row is saved. If this is an update (not a new
    row) and the image fields are being replaced with new files, delete the
    old files from disk first so re-editing a photo doesn't leave the
    previous version behind forever.
    """
    if not instance.pk:
        return  # new row being created, nothing to clean up

    try:
        old = PageImage.objects.get(pk=instance.pk)
    except PageImage.DoesNotExist:
        return

    if old.original_image and old.original_image != instance.original_image:
        old.original_image.delete(save=False)
    if old.rendered_image and old.rendered_image != instance.rendered_image:
        old.rendered_image.delete(save=False)