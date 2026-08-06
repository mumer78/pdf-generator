import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api";
import FixedHeader from "../components/FixedHeader";
import SiteInspectedSection from "../components/SiteInspectedSection";
import SummarySection from "../components/SummarySection";
import ImagePageBlock from "../components/ImagePageBlock";

function PageToolbar({ index, page, onAddPage, onCopy, onPaste, onDelete, hasClipboard, isEndToolbar }) {
  return (
    <div className="page-toolbar">
      <div className="toolbar-section left">
        <span className="position-indicator">Position {index + 1}</span>
        <button className="btn-secondary btn-sm" onClick={onAddPage}>
          + Add Page
        </button>
        {hasClipboard && (
          <button className="btn-primary btn-sm btn-paste" onClick={onPaste}>
            📋 Paste Before
          </button>
        )}
      </div>
      {!isEndToolbar && page && (
        <div className="toolbar-section right">
          <button className="btn-secondary btn-sm" onClick={onCopy}>
            📄 Copy Page
          </button>
          <button className="btn-danger-link btn-sm" onClick={onDelete}>
            🗑 Delete Page
          </button>
        </div>
      )}
    </div>
  );
}

export default function FormEditor({ mode }) {
  const { id, key } = useParams();
  const navigate = useNavigate();

  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [clipboard, setClipboard] = useState(null); // stores copied page structure
  const [imageClipboard, setImageClipboard] = useState(null); // stores copied image slot data

  const endpointBase = mode === "key" ? `forms/by-key/${key}/` : `forms/${id}/`;

  const load = useCallback(async () => {
    const res = await api.get(endpointBase);
    let formRes = res.data;
    // Auto-create a Main Photo Page at position 0 if form has no pages
    if (formRes.pages.length === 0) {
      const pageRes = await api.post(`forms/${formRes.id}/pages/`, {
        layout: "main",
        order: 0,
        issue_concern: "",
      });
      formRes.pages = [pageRes.data];
    } else {
      // Ensure the first page is indeed set to "main" layout to guarantee position 0 is fixed Main Photo
      const firstPage = formRes.pages[0];
      if (firstPage.layout !== "main") {
        await api.put(`pages/${firstPage.id}/`, {
          ...firstPage,
          layout: "main",
        });
        firstPage.layout = "main";
      }
    }
    setForm(formRes);
  }, [endpointBase]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, key]);

  if (!form) return <div className="page-container">Loading...</div>;

  const patchHeader = (patch) => setForm({ ...form, ...patch });

  const saveAll = async () => {
    setSaving(true);
    const payload = {
      address: form.address,
      reason_for_inspection: form.reason_for_inspection,
      inspector: form.inspector,
      date_of_inspection: form.date_of_inspection,
      summary: form.summary,
    };
    const res = await api.put(endpointBase, { ...form, ...payload });

    // Save each page's text and keep ITS response (not the stale header
    // response captured above) so freshly-typed text never gets reverted.
    const updatedPages = [];
    for (const p of form.pages) {
      const pageRes = await api.put(`pages/${p.id}/`, {
        issue_concern: p.issue_concern,
        layout: p.layout,
        order: p.order,
        photo_height_in: p.photo_height_in,
        photo_width_in:  p.photo_width_in,
      });
      // The page PUT response doesn't include nested images, so keep the
      // images we already have locally.
      updatedPages.push({ ...pageRes.data, images: p.images });
    }

    setForm({ ...res.data, pages: updatedPages });
    setSaving(false);
    setSavedMsg("Saved!");
    setTimeout(() => setSavedMsg(""), 1500);
  };

  const addPage = async (insertBeforeIndex = null) => {
    setSaving(true);
    // Page at index 0 is fixed Main Photo. So insertBeforeIndex cannot be 0.
    const targetOrder = insertBeforeIndex !== null ? Math.max(1, insertBeforeIndex) : form.pages.length;

    // Create the page defaulting to double layout (which opens a 2 image frame)
    const res = await api.post(`forms/${form.id}/pages/`, {
      layout: "double",
      order: targetOrder,
      issue_concern: "",
    });
    const newPage = res.data;

    let newPages = [...form.pages];
    if (insertBeforeIndex !== null) {
      newPages.splice(targetOrder, 0, newPage);
    } else {
      newPages.push(newPage);
    }

    // Persist new orders for all pages (keeping position 0 Main Photo intact)
    const updatedPages = [];
    for (let i = 0; i < newPages.length; i++) {
      const p = newPages[i];
      const pageRes = await api.put(`pages/${p.id}/`, {
        issue_concern: p.issue_concern,
        layout: i === 0 ? "main" : p.layout, // enforce layout "main" on position 0
        order: i,
        photo_height_in: p.photo_height_in,
        photo_width_in: p.photo_width_in,
      });
      updatedPages.push({ ...pageRes.data, images: p.images || [] });
    }

    setForm({ ...form, pages: updatedPages });
    setSaving(false);
    setSavedMsg("Added Page!");
    setTimeout(() => setSavedMsg(""), 1500);
  };

  const copyPage = (page) => {
    setClipboard(page);
    setSavedMsg("Page Copied!");
    setTimeout(() => setSavedMsg(""), 1500);
  };

  const pastePage = async (insertBeforeIndex) => {
    if (!clipboard) return;
    setSaving(true);
    // Position 0 is fixed Main Photo. Paste must occur at index >= 1.
    const targetOrder = Math.max(1, insertBeforeIndex);

    // 1. Create a new page with layout and issue concern copied
    const res = await api.post(`forms/${form.id}/pages/`, {
      layout: clipboard.layout,
      order: targetOrder,
      issue_concern: clipboard.issue_concern,
      photo_height_in: clipboard.photo_height_in,
      photo_width_in: clipboard.photo_width_in,
    });
    const newPage = res.data;
    newPage.images = [];

    // 2. Duplicate each image in the clipboard page
    if (clipboard.images && clipboard.images.length > 0) {
      for (const img of clipboard.images) {
        try {
          const formData = new FormData();
          if (img.original_image) {
            const origRes = await fetch(img.original_image);
            const origBlob = await origRes.blob();
            formData.append("original_image", origBlob, "original.png");
          }
          if (img.rendered_image) {
            const rendRes = await fetch(img.rendered_image);
            const rendBlob = await rendRes.blob();
            formData.append("rendered_image", rendBlob, "rendered.png");
          }
          formData.append("crop_data", JSON.stringify(img.crop_data));
          formData.append("shapes", JSON.stringify(img.shapes));

          const uploadRes = await api.post(
            `pages/${newPage.id}/images/${img.slot}/`,
            formData,
            { headers: { "Content-Type": "multipart/form-data" } }
          );
          newPage.images.push(uploadRes.data);
        } catch (err) {
          console.error("Failed to copy image in slot", img.slot, err);
        }
      }
    }

    // 3. Re-order all pages
    let newPages = [...form.pages];
    newPages.splice(targetOrder, 0, newPage);

    const updatedPages = [];
    for (let i = 0; i < newPages.length; i++) {
      const p = newPages[i];
      const pageRes = await api.put(`pages/${p.id}/`, {
        issue_concern: p.issue_concern,
        layout: i === 0 ? "main" : p.layout, // enforce position 0 is main
        order: i,
        photo_height_in: p.photo_height_in,
        photo_width_in: p.photo_width_in,
      });
      updatedPages.push({ ...pageRes.data, images: p.images || [] });
    }

    setForm({ ...form, pages: updatedPages });
    setSaving(false);
    setClipboard(null); // clear clipboard after pasting once
    setSavedMsg("Pasted Page!");
    setTimeout(() => setSavedMsg(""), 1500);
  };

  const deletePage = async (pageId) => {
    // Prevent deleting position 0 (Main Photo)
    const targetPage = form.pages.find((p) => p.id === pageId);
    if (form.pages.indexOf(targetPage) === 0) {
      alert("The first page (Main Photo Page) is fixed and cannot be deleted.");
      return;
    }

    setSaving(true);
    await api.delete(`pages/${pageId}/`);
    const remainingPages = form.pages.filter((p) => p.id !== pageId);

    // Persist new orders
    const updatedPages = [];
    for (let i = 0; i < remainingPages.length; i++) {
      const p = remainingPages[i];
      const pageRes = await api.put(`pages/${p.id}/`, {
        issue_concern: p.issue_concern,
        layout: i === 0 ? "main" : p.layout, // enforce position 0 is main
        order: i,
        photo_height_in: p.photo_height_in,
        photo_width_in: p.photo_width_in,
      });
      updatedPages.push({ ...pageRes.data, images: p.images || [] });
    }

    setForm({ ...form, pages: updatedPages });
    setSaving(false);
  };

  // ── Image copy/paste/delete handlers ──────────────────────────────────
  const copyImage = (image) => {
    setImageClipboard(image);
    setSavedMsg("Image Copied!");
    setTimeout(() => setSavedMsg(""), 1500);
  };

  const handleImagePaste = async (pageId, targetSlot) => {
    if (!imageClipboard) return;
    setSaving(true);
    try {
      const formData = new FormData();
      if (imageClipboard.original_image) {
        const origRes = await fetch(imageClipboard.original_image);
        const origBlob = await origRes.blob();
        formData.append("original_image", origBlob, "original.png");
      }
      if (imageClipboard.rendered_image) {
        const rendRes = await fetch(imageClipboard.rendered_image);
        const rendBlob = await rendRes.blob();
        formData.append("rendered_image", rendBlob, "rendered.png");
      }
      formData.append("crop_data", JSON.stringify(imageClipboard.crop_data));
      formData.append("shapes", JSON.stringify(imageClipboard.shapes));

      const res = await api.post(
        `pages/${pageId}/images/${targetSlot}/`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );

      setForm({
        ...form,
        pages: form.pages.map((p) => {
          if (p.id !== pageId) return p;
          const otherImages = (p.images || []).filter((img) => img.slot !== targetSlot);
          // If slot 2 is pasted into a single layout page, auto-convert page layout to double
          const newLayout = (targetSlot === 2 && p.layout === "single") ? "double" : p.layout;
          return { ...p, layout: newLayout, images: [...otherImages, res.data] };
        }),
      });

      setImageClipboard(null); // clear clipboard after pasting once
      setSavedMsg("Pasted Image!");
      setTimeout(() => setSavedMsg(""), 1500);
    } catch (err) {
      console.error("Failed to paste image", err);
    }
    setSaving(false);
  };

  const handleImageDelete = async (pageId, slot) => {
    setSaving(true);
    try {
      const res = await api.delete(`pages/${pageId}/images/${slot}/`);
      // Backend delete endpoint returns updated ImagePage object
      setForm({
        ...form,
        pages: form.pages.map((p) => (p.id === pageId ? res.data : p)),
      });
      setSavedMsg("Deleted Image!");
      setTimeout(() => setSavedMsg(""), 1500);
    } catch (err) {
      console.error("Failed to delete image", err);
    }
    setSaving(false);
  };

  const changePageText = (pageId, text) => {
    setForm({
      ...form,
      pages: form.pages.map((p) => (p.id === pageId ? { ...p, issue_concern: text } : p)),
    });
  };

  const changePageHeight = (pageId, heightIn) => {
    setForm({
      ...form,
      pages: form.pages.map((p) => (p.id === pageId ? { ...p, photo_height_in: heightIn } : p)),
    });
  };

  const changePageWidth = (pageId, widthIn) => {
    setForm({
      ...form,
      pages: form.pages.map((p) => (p.id === pageId ? { ...p, photo_width_in: widthIn } : p)),
    });
  };

  const handleImageEdited = async (pageId, { slot, blob, cropData, shapes, originalFile }) => {
    const data = new FormData();
    if (originalFile) data.append("original_image", originalFile);
    data.append("rendered_image", blob, `page_${pageId}_slot_${slot}.png`);
    data.append("crop_data", JSON.stringify(cropData));
    data.append("shapes", JSON.stringify(shapes));

    const res = await api.post(`pages/${pageId}/images/${slot}/`, data, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    setForm({
      ...form,
      pages: form.pages.map((p) => {
        if (p.id !== pageId) return p;
        const otherImages = (p.images || []).filter((img) => img.slot !== slot);
        // If slot 2 is uploaded on a single layout page, auto-convert page layout to double
        const newLayout = (slot === 2 && p.layout === "single") ? "double" : p.layout;
        return { ...p, layout: newLayout, images: [...otherImages, res.data] };
      }),
    });
  };

  const saveAndViewPdf = async () => {
    await saveAll();
    const token = localStorage.getItem("access_token");
    const response = await fetch(`http://localhost:8000/api/forms/${form.id}/pdf/`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  };

  return (
    <div className="page-container">
      <div className="editor-top-bar">
        <button className="btn-link" onClick={() => navigate("/history")}>
          ← Back to History
        </button>
        <div className="share-key-badge">
          Share Key: <strong>{form.share_key}</strong>
        </div>
      </div>

      <div className="report-sheet">
        <FixedHeader />

        <SiteInspectedSection data={form} onChange={(patch) => patchHeader(patch)} />

        <SummarySection value={form.summary} onChange={(val) => patchHeader({ summary: val })} />

        {form.pages.map((page, index) => (
          <React.Fragment key={page.id}>
            {/* The first page toolbar is placed at index 1 (between page 0 and page 1)
                so that Main Photo (index 0) remains fixed at position 1. */}
            {index > 0 && (
              <PageToolbar
                index={index}
                page={page}
                onAddPage={() => addPage(index)}
                onCopy={() => copyPage(page)}
                onPaste={() => pastePage(index)}
                onDelete={() => deletePage(page.id)}
                hasClipboard={!!clipboard}
              />
            )}
            <ImagePageBlock
              page={page}
              onChangeText={changePageText}
              onImageEdited={handleImageEdited}
              onChangeHeight={changePageHeight}
              onChangeWidth={changePageWidth}
              imageClipboard={imageClipboard}
              onCopyImage={copyImage}
              onPasteImage={(slot) => handleImagePaste(page.id, slot)}
              onDeleteImage={(slot) => handleImageDelete(page.id, slot)}
            />
          </React.Fragment>
        ))}

        {form.pages.length > 0 && (
          <PageToolbar
            index={form.pages.length}
            onAddPage={() => addPage(form.pages.length)}
            onPaste={() => pastePage(form.pages.length)}
            hasClipboard={!!clipboard}
            isEndToolbar={true}
          />
        )}
      </div>

      <div className="editor-bottom-bar">
        <button className="btn-secondary" onClick={saveAll} disabled={saving}>
          {saving ? "Saving..." : "Save Draft"}
        </button>
        {savedMsg && <span className="saved-msg">{savedMsg}</span>}
        <button className="btn-primary" onClick={saveAndViewPdf}>
          Save &amp; View PDF
        </button>
      </div>
    </div>
  );
}