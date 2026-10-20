"use client";

// A validation message shown directly under the field it is about.
export function FieldError({ message }) {
  if (!message) return null;
  return (
    <div className="error-text field-error" role="alert">
      {message}
    </div>
  );
}

// Brings the field with data-field={key} into view and focuses its input,
// so the user sees at once why saving did not go through. Given several
// keys, it goes to whichever of those fields comes first on the page.
export function scrollToField(keys) {
  const list = (Array.isArray(keys) ? keys : [keys]).filter(Boolean);
  if (typeof window === "undefined" || list.length === 0) return;
  window.requestAnimationFrame(() => {
    const el = list
      .map((key) => document.querySelector(`[data-field="${key}"]`))
      .filter(Boolean)
      .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))[0];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const input = el.matches("input, select, textarea") ? el : el.querySelector("input, select, textarea");
    input?.focus({ preventScroll: true });
  });
}
