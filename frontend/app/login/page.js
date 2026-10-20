"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "../../lib/api";
import EyeToggle from "../../components/EyeToggle";

const ROLES = [
  { id: "patient", label: "Patient" },
  { id: "doctor", label: "Doctor" },
  { id: "pharmacy", label: "Pharmacy" },
  //{ id: "admin", label: "Admin" },
];

const DASHBOARD_BY_ROLE = {
  admin: "/admin/dashboard",
  patient: "/patient/dashboard",
  doctor: "/doctor/dashboard",
  pharmacy: "/pharmacy/verify",
};

export default function LoginPage() {
  const router = useRouter();
  const [role, setRole] = useState("patient");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    setSessionExpired(new URLSearchParams(window.location.search).get("session") === "expired");
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.login({ email, password });
      window.localStorage.setItem("sch_token", res.token);
      window.localStorage.setItem("sch_user", JSON.stringify(res.user));
      router.push(DASHBOARD_BY_ROLE[res.user.role] || "/patient/dashboard");
    } catch (err) {
      if (err.code === "ACCOUNT_PENDING") {
        setError("Your account is waiting for admin approval.");
      } else if (err.code === "ACCOUNT_REJECTED") {
        setError("This account is not active.");
      } else {
        setError("Couldn't sign you in. Check your email and password and try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-visual">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3Z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 17 }}>MediVault</div>
        </div>

        {/* Decorative mark — purely visual, no claims to back up */}
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1 }}>
          <svg width="220" height="220" viewBox="0 0 220 220" fill="none">
            <circle cx="110" cy="110" r="108" stroke="rgba(255,255,255,0.14)" strokeWidth="1.5" />
            <circle cx="110" cy="110" r="82" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
            <circle cx="110" cy="110" r="56" fill="rgba(255,255,255,0.08)" />
            <path d="M110 78v64M78 110h64" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
          </svg>
        </div>

        <div>
          <h1 style={{ color: "#fff", fontSize: 30, lineHeight: 1.3, maxWidth: 380, fontWeight: 500 }}>
            Your health record, all in one place.
          </h1>
          <p style={{ color: "rgba(255,255,255,0.8)", fontSize: 14, maxWidth: 360, marginTop: 10 }}>
            One platform for patients, doctors, and pharmacies.
          </p>
        </div>
      </div>

      <div className="auth-form-col">
        <div className="auth-card">
          <div className="eyebrow">Sign in</div>
          {sessionExpired && <div className="error-text" role="alert">Your session expired after inactivity. Please sign in again; your data has not been deleted.</div>}
          <h2 style={{ margin: "0 0 4px" }}>Welcome back</h2>
          <p style={{ color: "var(--muted)", fontSize: 13.5, marginBottom: 22 }}>
            New here? <Link href="/register" style={{ color: "var(--primary)", fontWeight: 600 }}>Create an account</Link>
          </p>

          <div className="field">
            <label>I am signing in as</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>Email address</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div className="field">
              <label>Password</label>
              <div className="password-wrap">
                <input type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
                <EyeToggle shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />
              </div>
            </div>

            {error && <div className="error-text">{error}</div>}

            <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: "100%", justifyContent: "center", marginTop: 6, padding: "11px 14px" }}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
