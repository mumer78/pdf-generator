import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";

export default function History() {
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
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
