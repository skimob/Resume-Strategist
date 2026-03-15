"use client";
import { useState, useEffect } from "react";
import ResumeAgent from "../components/ResumeAgent";

export default function Home() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);

  // Check if already authenticated this session
  useEffect(() => {
    if (sessionStorage.getItem("resume_authed") === "true") {
      setAuthed(true);
    }
    setChecking(false);
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      sessionStorage.setItem("resume_authed", "true");
      setAuthed(true);
    } else {
      setError("Incorrect password. Try again.");
      setPassword("");
    }
  };

  if (checking) return null;

  if (!authed) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#0d0d0f",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'DM Sans', sans-serif",
        padding: "1rem",
      }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@400;500;600&display=swap');`}</style>
        <div style={{
          background: "#111010",
          border: "1px solid #2a2420",
          borderRadius: 16,
          padding: "2.5rem 2rem",
          width: "100%",
          maxWidth: 380,
          textAlign: "center",
        }}>
          <div style={{
            width: 52, height: 52,
            background: "linear-gradient(135deg, #d4a853, #8b6520)",
            borderRadius: 13,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, margin: "0 auto 1.25rem",
          }}>📄</div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", color: "#e8c97a", fontSize: "1.4rem", marginBottom: "0.4rem" }}>
            Resume Strategist
          </h1>
          <p style={{ color: "#5a4a38", fontSize: "0.85rem", marginBottom: "1.75rem", lineHeight: 1.5 }}>
            AI-powered resume tailoring. Enter the password to continue.
          </p>
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
              autoFocus
              style={{
                background: "#1a1714", border: `1px solid ${error ? "#c06060" : "#3a2e1a"}`,
                borderRadius: 9, padding: "0.75rem 1rem", color: "#e8e0d4",
                fontSize: "0.9rem", outline: "none", fontFamily: "'DM Sans', sans-serif",
              }}
            />
            {error && <div style={{ color: "#c06060", fontSize: "0.8rem" }}>{error}</div>}
            <button type="submit" disabled={!password} style={{
              background: "linear-gradient(135deg, #d4a853, #8b6520)",
              border: "none", borderRadius: 9, padding: "0.75rem",
              color: "#0d0d0f", fontWeight: 600, cursor: password ? "pointer" : "not-allowed",
              fontSize: "0.9rem", fontFamily: "'DM Sans', sans-serif",
              opacity: password ? 1 : 0.5,
            }}>
              Enter →
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <ResumeAgent />;
}
