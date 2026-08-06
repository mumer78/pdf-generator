import React from "react";
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Register from "./pages/Register";
import History from "./pages/History";
import ViewByKey from "./pages/ViewByKey";
import FormEditor from "./pages/FormEditor";

function PrivateRoute({ children }) {
  const { username } = useAuth();
  if (!username) return <Navigate to="/login" replace />;
  return children;
}

function TopNav() {
  const { username, logout } = useAuth();
  const navigate = useNavigate();
  if (!username) return null;
  return (
    <div className="topnav">
      <div className="topnav-brand">
        <span>🏠</span>
        TilTop Roofers
        <span className="topnav-brand-dot" />
        Inspection System
      </div>
      <div className="topnav-links">
        <Link to="/history">My History</Link>
        <Link to="/view-others">View Others</Link>
        <span className="topnav-sep" />
        <span className="topnav-user">👤 {username}</span>
        <button
          className="topnav-logout"
          onClick={() => { logout(); navigate("/login"); }}
        >
          ⏏ Logout
        </button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <TopNav />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/history"
            element={
              <PrivateRoute>
                <History />
              </PrivateRoute>
            }
          />
          <Route
            path="/view-others"
            element={
              <PrivateRoute>
                <ViewByKey />
              </PrivateRoute>
            }
          />
          <Route
            path="/form/:id"
            element={
              <PrivateRoute>
                <FormEditor mode="id" />
              </PrivateRoute>
            }
          />
          <Route
            path="/form/key/:key"
            element={
              <PrivateRoute>
                <FormEditor mode="key" />
              </PrivateRoute>
            }
          />
          <Route path="*" element={<Navigate to="/history" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
