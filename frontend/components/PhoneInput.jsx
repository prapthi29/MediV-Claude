"use client";

import { PHONE_COUNTRIES, joinPhone, splitPhone } from "../lib/phone";

// A country code picker plus a digits-only number box, capped at the
// selected country's number length.
export default function PhoneInput({ id, value, onChange, dataField }) {
  const { code, digits } = splitPhone(value);
  const country = PHONE_COUNTRIES.find((c) => c.code === code);
  return (
    <div className="phone-input" data-field={dataField}>
      <select aria-label="Country code" value={code} onChange={(e) => onChange(joinPhone(e.target.value, digits))}>
        {PHONE_COUNTRIES.map((c) => (
          <option key={c.code} value={c.code}>
            +{c.code} {c.name}
          </option>
        ))}
      </select>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        value={digits}
        maxLength={country.max}
        placeholder={`${country.max} digits`}
        onChange={(e) => onChange(joinPhone(code, e.target.value.replace(/\D/g, "").slice(0, country.max)))}
      />
    </div>
  );
}
