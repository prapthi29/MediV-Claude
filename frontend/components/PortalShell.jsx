"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

const PORTAL_LABELS = {
  admin: "Admin Portal",
  patient: "Patient Portal",
  doctor: "Doctor Portal",
  pharmacy: "Pharmacy Portal",
};

function getStoredUser() {
  try {
    return JSON.parse(window.localStorage.getItem("sch_user") || "null");
  } catch {
    return null;
  }
}

export default function PortalShell({
  role,
  eyebrow,
  title,
  subtitle,
  children,
}) {
  const [user, setUser] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  // Close the mobile menu on navigation and on Escape.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const portalLabel = PORTAL_LABELS[role] || "MediVault Portal";
  const userLabel =
    user?.name ||
    user?.fullName ||
    user?.email ||
    (role ? role.charAt(0).toUpperCase() + role.slice(1) : "User");

  const userEmail = user?.email || "";

  return (
    <div className="shell">
      <Sidebar
        role={role}
        userLabel={userLabel}
        userEmail={userEmail}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />

      {menuOpen && (
        <div
          className="sidebar-backdrop"
          aria-hidden="true"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <main className="main">
        <div className="mobile-bar">
          <button
            type="button"
            className="hamburger"
            aria-label="Open menu"
            aria-controls="portal-sidebar"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="mobile-bar-title">MediVault · {portalLabel}</span>
        </div>

        <div className="main-inner">
          <header className="topbar">
            <p className="eyebrow">{eyebrow || portalLabel}</p>
            <h1 className="page-title">{title}</h1>
            {subtitle && <p className="page-sub">{subtitle}</p>}
          </header>

          <div className="page-body">{children}</div>
        </div>
      </main>
    </div>
  );
}
