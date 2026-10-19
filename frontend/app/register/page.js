"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "../../lib/api";

export default function RegisterPage() {
  const router = useRouter();

  const [role, setRole] = useState("patient");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
    license_id: "",
  });
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const needsLicense = role === "doctor" || role === "pharmacy";

  const passwordChecks = {
    length: form.password.length >= 12,
    lowercase: /[a-z]/.test(form.password),
    uppercase: /[A-Z]/.test(form.password),
    number: /[0-9]/.test(form.password),
    special: /[^A-Za-z0-9]/.test(form.password),
  };

  const passwordValid = Object.values(passwordChecks).every(Boolean);
  const passwordsMatch =
    form.password.length > 0 && form.password === form.confirm;

  function set(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!passwordValid) {
      setError(
        "Your password must contain at least 12 characters, including uppercase and lowercase letters, a number, and a special character."
      );
      return;
    }

    if (!passwordsMatch) {
      setError("Passwords do not match.");
      return;
    }

    if (!agreed) {
      setError("You need to accept the consent statements to continue.");
      return;
    }

    setLoading(true);

    try {
      // Keep the payload compatible with the current backend.
      await api.register({
        role,
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        ...(needsLicense ? { licenseId: form.license_id.trim() } : {}),
      });

      setDone(true);
    } catch (err) {
      if (err.status === 409) {
        setError("That email is already registered. Try signing in instead.");
      } else {
        setError(
          err.message ||
            "Something went wrong creating your account. Please try again."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="auth-shell">
        <div className="auth-visual">
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 17 }}>
            MediVault
          </div>
          <div />
          <div />
        </div>

        <div className="auth-form-col">
          <div className="auth-card">
            <div className="eyebrow">Almost there</div>
            <h2>
              {needsLicense
                ? "Your account is pending approval"
                : "Welcome to MediVault"}
            </h2>

            <p
              style={{
                color: "var(--muted)",
                fontSize: 13.5,
                lineHeight: 1.6,
                marginTop: 10,
              }}
            >
              {needsLicense
                ? "An admin needs to approve this account before you can sign in."
                : "You can sign in and set up your consent wallet from your dashboard."}
            </p>

            <Link
              href="/login"
              className="btn btn-primary"
              style={{ marginTop: 18, display: "inline-flex" }}
            >
              Go to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-visual">
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 17 }}>
          MediVault
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            flex: 1,
          }}
        >
          <svg width="200" height="200" viewBox="0 0 220 220" fill="none">
            <circle
              cx="110"
              cy="110"
              r="108"
              stroke="rgba(255,255,255,0.14)"
              strokeWidth="1.5"
            />
            <circle
              cx="110"
              cy="110"
              r="82"
              stroke="rgba(255,255,255,0.18)"
              strokeWidth="1.5"
            />
            <circle cx="110" cy="110" r="56" fill="rgba(255,255,255,0.08)" />
            <path
              d="M110 78v64M78 110h64"
              stroke="#fff"
              strokeWidth="6"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <div>
          <h1
            style={{
              color: "#fff",
              fontSize: 28,
              lineHeight: 1.3,
              maxWidth: 380,
              fontWeight: 500,
            }}
          >
            Set up your account in a few steps.
          </h1>

          <p
            style={{
              color: "rgba(255,255,255,0.8)",
              fontSize: 14,
              maxWidth: 360,
              marginTop: 10,
            }}
          >
            For patients, providers, and pharmacies alike.
          </p>
        </div>
      </div>

      <div className="auth-form-col">
        <form className="auth-card" onSubmit={handleSubmit}>
          <div className="eyebrow">Create account</div>
          <h2 style={{ margin: "0 0 4px" }}>Get started</h2>

          <p
            style={{ color: "var(--muted)", fontSize: 13.5, marginBottom: 20 }}
          >
            Already registered?{" "}
            <Link
              href="/login"
              style={{ color: "var(--primary)", fontWeight: 600 }}
            >
              Sign in
            </Link>
          </p>

          <div className="field">
            <label htmlFor="role">Account type</label>
            <select
              id="role"
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              <option value="patient">Patient</option>
              <option value="doctor">Doctor</option>
              <option value="pharmacy">Pharmacy</option>
            </select>

            {needsLicense && (
              <div className="field-hint">
                Doctor and pharmacy accounts are reviewed by an admin before
                activation.
              </div>
            )}
          </div>

          <div className="field">
            <label htmlFor="name">Full name</label>
            <input
              id="name"
              autoComplete="name"
              required
              value={form.name}
              onChange={(event) => set("name", event.target.value)}
              placeholder="Your full name"
            />
          </div>

          <div className="field">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={(event) => set("email", event.target.value)}
              placeholder="you@example.com"
            />
          </div>

          {needsLicense && (
            <div className="field">
              <label htmlFor="license_id">
                {role === "doctor"
                  ? "Medical license number"
                  : "Pharmacy license number"}
              </label>
              <input
                id="license_id"
                required
                value={form.license_id}
                onChange={(event) => set("license_id", event.target.value)}
                placeholder="Enter your license number"
              />
            </div>
          )}

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={12}
              value={form.password}
              onChange={(event) => set("password", event.target.value)}
              placeholder="At least 12 characters"
              aria-describedby="password-requirements"
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"} password</button>

            <div
              id="password-requirements"
              className="field-hint"
              style={{ lineHeight: 1.8 }}
            >
              <div>Password requirements:</div>
              <div>
                {passwordChecks.length ? "✓" : "○"} At least 12 characters
              </div>
              <div>
                {passwordChecks.uppercase ? "✓" : "○"} One uppercase letter
              </div>
              <div>
                {passwordChecks.lowercase ? "✓" : "○"} One lowercase letter
              </div>
              <div>
                {passwordChecks.number ? "✓" : "○"} One number
              </div>
              <div>
                {passwordChecks.special ? "✓" : "○"} One special character
              </div>
            </div>
          </div>

          <div className="field">
            <label htmlFor="confirm">Confirm password</label>
            <input
              id="confirm"
              type={showConfirm ? "text" : "password"}
              autoComplete="new-password"
              required
              value={form.confirm}
              onChange={(event) => set("confirm", event.target.value)}
              placeholder="Re-enter your password"
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowConfirm((v) => !v)} aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}>{showConfirm ? "Hide" : "Show"} confirm password</button>

            {form.confirm.length > 0 && (
              <div className="field-hint">
                {passwordsMatch
                  ? "Passwords match."
                  : "Passwords do not match."}
              </div>
            )}
          </div>

          <label
            style={{
              display: "flex",
              gap: 9,
              alignItems: "flex-start",
              fontSize: 12.5,
              color: "var(--muted)",
              marginBottom: 16,
            }}
          >
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
              style={{ width: "auto", marginTop: 2 }}
            />
            I agree to the terms of service and privacy policy.
          </label>

          {error && (
            <div className="error-text" role="alert">
              {error}
            </div>
          )}

          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              justifyContent: "center",
              padding: "11px 14px",
            }}
          >
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}