"use client";

// Read-only view of a patient's basic profile, used wherever a doctor opens
// one (emergency access and the Basic profiles page).
const GENDER = { female: "Female", male: "Male", other: "Other", prefer_not_to_say: "Prefer not to say" };

export const NONE_YET = "None as of now";

function listOrStatus(items, status, render) {
  if (status === "provided" && items?.length) return items.map(render).join("; ");
  return NONE_YET;
}

export default function BasicProfileView({ profile }) {
  const contact = profile.emergencyContact || {};
  const rows = [
    ["Blood group", profile.bloodGroup],
    ["Gender", GENDER[profile.gender] || profile.gender],
    ["Date of birth", profile.dateOfBirth ? `${profile.dateOfBirth}${profile.age != null ? ` (age ${profile.age})` : ""}` : null],
    ["Allergies", listOrStatus(profile.allergies, profile.allergiesStatus, (a) => `${a.substance}${a.reaction ? ` (${a.reaction}${a.severity ? `, ${a.severity}` : ""})` : ""}`)],
    ["Chronic conditions", listOrStatus(profile.chronicConditions, profile.chronicConditionsStatus, (c) => (c.notes ? `${c.name} (${c.notes})` : c.name))],
    ["Current medications", listOrStatus(profile.currentMedications, profile.medicationsStatus, (m) => [m.name, m.dosage, m.frequency].filter(Boolean).join(" "))],
    ["Emergency contact", [contact.name, contact.relationship && `(${contact.relationship})`, contact.phone].filter(Boolean).join(" ")],
  ];
  return (
    <div>
      <p style={{ fontSize: 13, margin: "0 0 10px" }}>
        <strong style={{ color: profile.integrity?.verified ? "var(--primary)" : "var(--red)" }}>
          {profile.integrity?.verified ? "Verified" : "Could not be verified"}
        </strong>
        {profile.signature?.signedByDoctorName ? ` · added by ${profile.signature.signedByDoctorName}, version ${profile.version}` : ""}
      </p>
      <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "minmax(130px, 180px) 1fr", gap: "6px 14px", fontSize: 13.5 }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: "contents" }}>
            <dt style={{ color: "var(--muted)" }}>{label}</dt>
            <dd style={{ margin: 0, fontWeight: label === "Blood group" || label === "Allergies" ? 700 : 400 }}>{value || "Not recorded"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
