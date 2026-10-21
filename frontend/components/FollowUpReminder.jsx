"use client";

// Reminds the patient, on every page of their portal, of each follow-up a
// doctor has set, until the day has passed.
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { fmtDate } from "./ui";

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysUntil(day) {
  const [y, m, d] = day.split("-").map(Number);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return Math.round((new Date(y, m - 1, d) - start) / 86400000);
}

function when(days) {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

export default function FollowUpReminder() {
  const [followUps, setFollowUps] = useState([]);

  useEffect(() => {
    let active = true;
    api
      .getPatientPrescriptions()
      .then((rows) => {
        if (!active) return;
        const today = todayKey();
        setFollowUps(
          (rows || [])
            .filter((p) => p.followUpDate && p.followUpDate >= today)
            .sort((a, b) => a.followUpDate.localeCompare(b.followUpDate))
        );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (followUps.length === 0) return null;
  return (
    <div className="followup-reminder" role="status">
      {followUps.map((p) => {
        const days = daysUntil(p.followUpDate);
        return (
          <div key={p.id}>
            <strong>Follow-up {when(days)}</strong> with {p.doctorName || "your doctor"} on {fmtDate(p.followUpDate)}
            {p.title ? <span style={{ color: "var(--muted)" }}> · for “{p.title}”</span> : null}
          </div>
        );
      })}
    </div>
  );
}
