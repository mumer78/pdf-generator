import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";

export default function History() {
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get("forms/");
      setForms(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const createNew = async () => {
    const res = await api.post("forms/", {});
    navigate(`/form/${res.data.id}`);
  };

  const deleteForm = async (e, form) => {
    e.stopPropagation(); // don't trigger the card's navigate onClick
    const confirmed = window.confirm(
      `Delete inspection "${form.address || form.share_key}"? This will permanently remove the report and all its photos. This cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingId(form.id);
    try {
      await api.delete(`forms/${form.id}/`);
      setForms((prev) => prev.filter((f) => f.id !== form.id));
    } catch (err) {
      console.error("Failed to delete inspection", err);
      alert("Failed to delete inspection. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="page-container">
      <div className="history-header">
        <div>
          <h2>My Inspections</h2>
          <p className="history-tagline">All your roof inspection reports in one place</p>
        </div>
        <button className="btn-primary" onClick={createNew}>
          + New Inspection
        </button>
      </div>

      {loading && (
        <div className="history-empty">
          <div className="history-empty-icon">⏳</div>
          <p>Loading your inspections…</p>
        </div>
      )}

      {!loading && forms.length === 0 && (
        <div className="history-empty">
          <div className="history-empty-icon">📋</div>
          <p>No inspections yet. Create your first one above!</p>
        </div>
      )}

      <div className="history-grid">
        {forms.map((f) => (
          <div
            className="history-card"
            key={f.id}
            onClick={() => navigate(`/form/${f.id}`)}
          >
            <button
              className="history-delete-btn"
              title="Delete inspection"
              onClick={(e) => deleteForm(e, f)}
              disabled={deletingId === f.id}
            >
              {deletingId === f.id ? "…" : "🗑"}
            </button>
            <div className="history-key">🔑 {f.share_key}</div>
            <div className="history-address">{f.address || "(no address yet)"}</div>
            <div className="history-meta">
              {f.reason_for_inspection || "—"} · {f.date_of_inspection || "—"}
            </div>
            <div className="history-updated">
              🕐 Updated: {new Date(f.updated_at).toLocaleString()}
            </div>
            <span className="history-arrow">›</span>
          </div>
        ))}
      </div>
    </div>
  );
}