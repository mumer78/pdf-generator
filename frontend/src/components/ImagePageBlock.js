import React, { useState } from "react";
import ImageEditorModal from "./ImageEditorModal";

function ImageSlot({
  image,
  slot,
  onEdited,
  freeAspect,
  hasImageClipboard,
  onCopyImage,
  onPasteImage,
  onDeleteImage,
  progress, // number 0-100, or undefined when not uploading
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);

  // Cache-bust: append a fresh query param whenever `image` changes so the
  // browser re-fetches the file instead of showing a stale cached version
  // at the same URL (filenames are fixed per page/slot, so the URL alone
  // doesn't change between edits).
  const rawUrl = image?.rendered_image || image?.original_image || null;
  const displayUrl = rawUrl ? `${rawUrl}${rawUrl.includes("?") ? "&" : "?"}v=${Date.now()}` : null;

  const sourceForModal = pendingFile
    ? URL.createObjectURL(pendingFile)
    : image?.original_image || null;

  const isUploading = typeof progress === "number";

  const onPickFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPendingFile(file);
    setModalOpen(true);
  };

  const handleSave = ({ blob, cropData, shapes, newOriginalFile }) => {
    const originalFile = newOriginalFile || pendingFile;
    onEdited({ slot, blob, cropData, shapes, originalFile });
    setModalOpen(false);
    setPendingFile(null);
  };

  return (
    <div className="image-slot">
      {displayUrl ? (
        <div className="image-slot-preview">
          <img src={displayUrl} alt={`Slot ${slot}`} />

          {/* Overlay controls */}
          <div className="image-slot-overlay">
            <button className="slot-action-btn" title="Copy Image" onClick={() => onCopyImage(image)}>
              📋 Copy
            </button>
            {hasImageClipboard && (
              <button className="slot-action-btn btn-paste" title="Paste Image" onClick={() => onPasteImage(slot)}>
                📥 Paste
              </button>
            )}
            <button className="slot-action-btn btn-danger" title="Delete Image" onClick={() => onDeleteImage(slot)}>
              🗑 Delete
            </button>
          </div>

          <button className="btn-secondary btn-edit-photo" onClick={() => setModalOpen(true)}>
            ✏ Edit Photo
          </button>

          {isUploading && (
            <div className="upload-progress-overlay">
              <div className="upload-progress-bar">
                <div className="upload-progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <span className="upload-progress-text">Saving… {progress}%</span>
            </div>
          )}
        </div>
      ) : (
        <div className="image-upload-wrapper">
          <label className="image-upload-box">
            <span>+ Upload Photo {slot}</span>
            <input type="file" accept="image/*" onChange={onPickFile} hidden />
          </label>
          {hasImageClipboard && (
            <button className="btn-primary btn-sm btn-paste-empty" onClick={() => onPasteImage(slot)}>
              📋 Paste Image here
            </button>
          )}
          {isUploading && (
            <div className="upload-progress-bar">
              <div className="upload-progress-fill" style={{ width: `${progress}%` }} />
              <span className="upload-progress-text">{progress}%</span>
            </div>
          )}
        </div>
      )}

      {modalOpen && sourceForModal && (
        <ImageEditorModal
          sourceUrl={sourceForModal}
          initialCrop={image?.crop_data || null}
          initialShapes={image?.shapes || null}
          freeAspect={freeAspect}
          onClose={() => {
            setModalOpen(false);
            setPendingFile(null);
          }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

export default function ImagePageBlock({
  page,
  uploadProgress,
  onChangeText,
  onImageEdited,
  imageClipboard,
  onCopyImage,
  onPasteImage,
  onDeleteImage,
}) {
  const textareaRef = React.useRef(null);

  React.useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [page.issue_concern]);

  const isMain = page.layout === "main";
  // 1-Image page ("single") and 2-Image page ("double") both use slot 1 and 2,
  // showing the smaller slot 2 upload box when layout is "single" so users can add a second image.
  const slots = isMain ? [1] : [1, 2];
  const imagesBySlot = {};
  (page.images || []).forEach((img) => (imagesBySlot[img.slot] = img));

  const layoutLabel =
    page.layout === "double"
      ? "2-Image Page"
      : isMain
      ? "Main Photo Page"
      : "1-Image Page";

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedText = (e.clipboardData || window.clipboardData).getData("text");
    // Standardize line endings
    let clean = pastedText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    // Preserve paragraph breaks (double newlines or more)
    clean = clean.replace(/\n\n+/g, "___PARAGRAPH_BREAK___");
    // Replace single newlines with space
    clean = clean.replace(/\n/g, " ");
    // Restore paragraph breaks
    clean = clean.replace(/___PARAGRAPH_BREAK___/g, "\n\n");
    // Remove extra spaces
    clean = clean.replace(/ {2,}/g, " ");

    const target = e.target;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const currentValue = target.value;
    const newValue = currentValue.substring(0, start) + clean + currentValue.substring(end);

    onChangeText(page.id, newValue);

    setTimeout(() => {
      if (target) {
        target.selectionStart = target.selectionEnd = start + clean.length;
      }
    }, 0);
  };

  return (
    <div className="section-block image-page-block">
      <h4 className="page-layout-label">{layoutLabel}</h4>

      <div className={`image-slots layout-${isMain ? "single" : page.layout}`}>
        {slots.map((slot) => (
          <ImageSlot
            key={slot}
            slot={slot}
            image={imagesBySlot[slot]}
            freeAspect={isMain}
            onEdited={(payload) => onImageEdited(page.id, payload)}
            hasImageClipboard={!!imageClipboard}
            onCopyImage={onCopyImage}
            onPasteImage={onPasteImage}
            onDeleteImage={onDeleteImage}
            progress={uploadProgress ? uploadProgress[`${page.id}-${slot}`] : undefined}
          />
        ))}
      </div>

      <h4 className="issue-heading">Issue/Concern</h4>
      <textarea
        ref={textareaRef}
        rows={3}
        value={page.issue_concern || ""}
        onChange={(e) => onChangeText(page.id, e.target.value)}
        onPaste={handlePaste}
        placeholder="Describe the issue/concern for this photo..."
        style={{ overflowY: "hidden", resize: "none" }}
      />
    </div>
  );
}