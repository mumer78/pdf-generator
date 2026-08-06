import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      navigate("/history");
    } catch (err) {
      setError("Invalid username or password.");
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

        <h2>Welcome back</h2>
        <p className="auth-subtitle">Sign in to manage your inspections</p>

        {error && <div className="error-text">⚠ {error}</div>}

        <label>Username</label>
        <input
          id="login-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter your username"
          required
          autoFocus
        />

        <label>Password</label>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your password"
          required
        />

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Signing in…" : "Sign In →"}
        </button>

        <p>
          No account? <Link to="/register">Create one</Link>
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
