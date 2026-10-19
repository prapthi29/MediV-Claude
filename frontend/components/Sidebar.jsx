
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONS = {
  overview: "M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6V11h-6v9Zm0-16v5h6V4h-6Z",
  records: "M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm8 1.5V9h4.5",
  consents: "M8 12l3 3 5-6M12 3l8 4v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V7l8-4Z",
  prescriptions: "M9 3h6v4H9V3Zm-3 4h12v14H6V7Zm3 5h6M9 15h6",
  approvals: "M12 3l1.9 4.6L18 9l-4.1 1.4L12 15l-1.9-4.6L6 9l4.1-1.4L12 3ZM5 19h14",
  users: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20c0-3 2.7-5 6-5s6 2 6 5M14 15c3.3 0 6 2 6 5",
  audit: "M4 6h16M4 12h16M4 18h9",
  chain: "M9 7h3a3 3 0 0 1 0 6H9m6 4h-3a3 3 0 0 1 0-6h3M7 10h10",
  patients: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20c0-3 2.7-5 6-5s6 2 6 5M14 15c3.3 0 6 2 6 5",
  upload: "M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3",
  writeRx: "M9 3h6v4H9V3Zm-3 4h12v14H6V7Zm3 5h6M9 15h6",
  verify: "M9 12l2 2 4-4m5-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  history: "M12 8v4l3 2M3 12a9 9 0 1 0 3.5-7.1M3 4v5h5",
};

function Icon({ d }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

const PORTAL_LABEL = {
  admin: "Admin",
  patient: "Patient",
  doctor: "Doctor",
  pharmacy: "Pharmacy",
};

export default function Sidebar({ role, userLabel }) {
  const pathname = usePathname();

  const LINKS_BY_ROLE = {
    admin: [
      { href: "/admin/dashboard", label: "Overview", icon: ICONS.overview },
      { href: "/admin/dashboard", label: "Pending approvals", icon: ICONS.approvals },
      { href: "/admin/users", label: "Doctors & pharmacies", icon: ICONS.users },
      { href: "/admin/audit-log", label: "Audit log", icon: ICONS.audit },
      { href: "/admin/chain-log", label: "Chain log", icon: ICONS.chain },
    ],

    patient: [
      { href: "/patient/dashboard", label: "Overview", icon: ICONS.overview },
      { href: "/patient/records", label: "Records", icon: ICONS.records },
      { href: "/patient/emergency-profile", label: "Emergency profile", icon: ICONS.verify },
      { href: "/patient/consents", label: "Consent wallet", icon: ICONS.consents },
      { href: "/patient/prescriptions", label: "Prescriptions", icon: ICONS.prescriptions },
    ],

    doctor: [
      { href: "/doctor/dashboard", label: "Overview", icon: ICONS.overview },
      { href: "/doctor/patients", label: "My patients", icon: ICONS.patients },
      { href: "/doctor/emergency", label: "Emergency access", icon: ICONS.approvals },
      { href: "/doctor/emergency-profiles", label: "Emergency profiles", icon: ICONS.verify },
      { href: "/doctor/records/new", label: "Add record", icon: ICONS.upload },
      { href: "/doctor/prescriptions/new", label: "Write prescription", icon: ICONS.writeRx },
    ],

    pharmacy: [
      { href: "/pharmacy/verify", label: "Shared prescriptions", icon: ICONS.verify },
      { href: "/pharmacy/history", label: "Verification history", icon: ICONS.history },
    ],
  };

  const links = LINKS_BY_ROLE[role] || LINKS_BY_ROLE.patient;

  // De-duplicate repeated hrefs (e.g. admin's two dashboard entries).
  const seen = new Set();
  const finalLinks = links.filter((l) =>
    seen.has(l.href) ? false : seen.add(l.href)
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3Z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
        </div>

        <div className="brand-name">
          MediVault <small>{PORTAL_LABEL[role] || "Patient"} Portal</small>
        </div>
      </div>

      {finalLinks.map((l) => (
        <Link
          key={l.label}
          href={l.href}
          className={`nav-link ${pathname === l.href ? "active" : ""}`}
        >
          <Icon d={l.icon} />
          {l.label}
        </Link>
      ))}

      <div className="sidebar-foot">
        Signed in as
        <div
          style={{
            color: "var(--ink)",
            fontWeight: 600,
            marginTop: 2,
          }}
        >
          {userLabel}
        </div>

        <Link
          href="/login"
          style={{
            color: "var(--primary)",
            fontWeight: 600,
            display: "inline-block",
            marginTop: 8,
          }}
        >
          Sign out
        </Link>
      </div>
    </aside>
  );
}

