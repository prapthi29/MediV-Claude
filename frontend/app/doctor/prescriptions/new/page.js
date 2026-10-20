"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Prescriptions are now added from "Add a medical record".
export default function NewPrescriptionRedirect() {
  const router = useRouter();
  useEffect(() => {
    const patient = new URLSearchParams(window.location.search).get("patient");
    router.replace(`/doctor/records/new?type=prescription${patient ? `&patient=${patient}` : ""}`);
  }, [router]);
  return null;
}
