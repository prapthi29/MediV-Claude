"use client";

import { useEffect, useState } from "react";

// Short-lived messages shown in the corner of the screen, so a result is
// noticed wherever the user is on the page. Call toast.success("...") or
// toast.error("...") from anywhere; PortalShell renders the <Toaster />.
const EVENT = "mv-toast";
let nextId = 1;

function show(kind, message) {
  if (typeof window === "undefined" || !message) return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { id: nextId++, kind, message } }));
}

export const toast = {
  success: (message) => show("success", message),
  error: (message) => show("error", message),
};

export function Toaster() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const onToast = (e) => {
      const item = e.detail;
      setItems((list) => [...list.slice(-2), item]);
      setTimeout(() => setItems((list) => list.filter((t) => t.id !== item.id)), item.kind === "error" ? 7000 : 4500);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  if (items.length === 0) return null;
  return (
    <div className="toaster" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === "error" ? "alert" : "status"}>
          <span>{t.message}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setItems((list) => list.filter((x) => x.id !== t.id))}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
