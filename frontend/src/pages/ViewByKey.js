import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";

export default function ViewByKey() {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await api.get(`forms/by-key/${key}/`);
      navigate(`/form/key/${key}`);
    } catch (err) {
      setError("No inspection found for that key.");
    }
  };

  return (
    <div className="page-container">
      <div className="auth-card" style={{ margin: "40px auto" }}>
        <h2>View / Edit by Key</h2>
        <p>Enter the 5-digit key that was generated when the inspection was saved.</p>
        {error && <div className="error-text">{error}</div>}
        <form onSubmit={submit}>
          <input
            maxLength={5}
            value={key}
            onChange={(e) => setKey(e.target.value.replace(/\D/g, ""))}
            placeholder="e.g. 48213"
            style={{ fontSize: "1.4rem", letterSpacing: "0.3rem", textAlign: "center" }}
          />
          <button type="submit" className="btn-primary" style={{ marginTop: 14 }}>
            Open Inspection
          </button>
        </form>
      </div>
    </div>
  );
}
