"use client";

// Eye icon inside a password field that shows or hides what was typed.
export default function EyeToggle({ shown, onToggle, label = "password" }) {
  return (
    <button
      type="button"
      className="eye-toggle"
      onClick={onToggle}
      aria-label={shown ? `Hide ${label}` : `Show ${label}`}
      aria-pressed={shown}
      title={shown ? `Hide ${label}` : `Show ${label}`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
        {shown && <path d="M4 4l16 16" />}
      </svg>
    </button>
  );
}
