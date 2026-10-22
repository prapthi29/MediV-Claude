"use client";

import { joinPhone, splitPhone } from "../lib/phone";

// Indian numbers only: a fixed +91 prefix and a 10-digit, digits-only box.
export default function PhoneInput({ id, value, onChange, dataField }) {
  const { digits } = splitPhone(value);
  return (
    <div className="phone-input" data-field={dataField}>
      <span className="phone-prefix" aria-label="Country code">+91</span>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        value={digits}
        maxLength={10}
        placeholder="10-digit mobile number"
        onChange={(e) => onChange(joinPhone("91", e.target.value.replace(/\D/g, "").slice(0, 10)))}
      />
    </div>
  );
}
