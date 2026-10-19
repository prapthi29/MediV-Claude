"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  const portalLabel = PORTAL_LABELS[role] || "MediVault Portal";
  const userLabel =
    user?.name ||
    user?.fullName ||
    user?.email ||
    (role ? role.charAt(0).toUpperCase() + role.slice(1) : "User");

  const userEmail = user?.email || "";

  return (
    <div className="shell">
      <Sidebar role={role} userLabel={userLabel} />

      <main className="main">
        <div
          className="topbar"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0, flex: "1 1 260px" }}>
            <p
              className="eyebrow"
              style={{ marginBottom: 6 }}
            >
              {eyebrow || portalLabel}
            </p>

            <h1 className="page-title">{title}</h1>

            {subtitle && (
              <p className="page-sub">{subtitle}</p>
            )}
          </div>

          <div
            aria-label="Signed-in account"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 11,
              padding: "10px 14px",
              border: "1px solid var(--border, #e5e7eb)",
              borderRadius: 12,
              maxWidth: "100%",
              minWidth: 0,
            }}
          >
            <div
              aria-hidden="true"
              style={{
                width: 38,
                height: 38,
                flexShrink: 0,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--primary, #315c50)",
                color: "#fff",
                fontWeight: 700,
                fontSize: 15,
              }}
            >
              {String(userLabel).charAt(0).toUpperCase()}
            </div>

            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--muted)",
                  marginBottom: 3,
                }}
              >
                {portalLabel}
              </div>

              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  overflowWrap: "anywhere",
                }}
              >
                {userLabel}
              </div>

              {userEmail && userEmail !== userLabel && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--muted)",
                    overflowWrap: "anywhere",
                  }}
                >
                  {userEmail}
                </div>
              )}
            </div>
          </div>
        </div>

        {children}
      </main>
    </div>
  );
}
