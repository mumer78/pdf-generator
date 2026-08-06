import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(username, password);
      navigate("/history");
    } catch (err) {
      setError("Could not register. Username may already be taken.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        {/* Logo */}
        <div className="auth-logo">
          <div className="auth-logo-icon">🏠</div>
          <h1>TilTop Roofers</h1>
          <p>Roof Inspection System</p>
        </div>

        <h2>Create Account</h2>
        <p className="auth-subtitle">Start managing your inspections today</p>

        {error && <div className="error-text">⚠ {error}</div>}

        <label>Username</label>
        <input
          id="register-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Choose a username"
          required
          autoFocus
        />

        <label>Password</label>
        <input
          id="register-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Choose a password"
          required
        />

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Creating account…" : "Create Account →"}
        </button>

        <p>
          Already have an account? <Link to="/login">Sign In</Link>
        </p>

        {/* Portfolio footer */}
        <div className="auth-footer">
          <p className="auth-made-by">Made by <strong>Umer</strong></p>
          <a
            href="https://portfolio-muhammad-umer.vercel.app"
            target="_blank"
            rel="noreferrer"
            className="auth-portfolio-link"
          >
            <span>Visit Portfolio</span>
            <span>↗</span>
          </a>
        </div>
      </form>
    </div>
  );
}
