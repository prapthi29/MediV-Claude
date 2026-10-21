// Mirrors src/utils/phone.js on the server. Numbers are stored as
// "+<country code> <digits>", for example "+91 9876543210".
export const PHONE_COUNTRIES = [
  { code: "91", name: "India", min: 10, max: 10 },
  { code: "1", name: "United States / Canada", min: 10, max: 10 },
  { code: "44", name: "United Kingdom", min: 10, max: 10 },
  { code: "971", name: "United Arab Emirates", min: 9, max: 9 },
  { code: "966", name: "Saudi Arabia", min: 9, max: 9 },
  { code: "974", name: "Qatar", min: 8, max: 8 },
  { code: "965", name: "Kuwait", min: 8, max: 8 },
  { code: "968", name: "Oman", min: 8, max: 8 },
  { code: "65", name: "Singapore", min: 8, max: 8 },
  { code: "60", name: "Malaysia", min: 9, max: 10 },
  { code: "61", name: "Australia", min: 9, max: 9 },
  { code: "94", name: "Sri Lanka", min: 9, max: 9 },
  { code: "977", name: "Nepal", min: 10, max: 10 },
  { code: "880", name: "Bangladesh", min: 10, max: 10 },
  { code: "49", name: "Germany", min: 10, max: 11 },
];

// Splits a stored number into its country code and digits. Older free-text
// numbers keep their digits and default to India.
export function splitPhone(value) {
  const match = /^\+(\d{1,3}) (\d*)$/.exec(String(value || ""));
  if (match && PHONE_COUNTRIES.some((c) => c.code === match[1])) return { code: match[1], digits: match[2] };
  return { code: "91", digits: String(value || "").replace(/\D/g, "") };
}

export const joinPhone = (code, digits) => (digits ? `+${code} ${digits}` : "");

export function phoneProblem(value) {
  if (!value) return "Enter the phone number.";
  const { code, digits } = splitPhone(value);
  const country = PHONE_COUNTRIES.find((c) => c.code === code);
  if (digits.length < country.min || digits.length > country.max) {
    const n = country.min === country.max ? `${country.min}` : `${country.min} to ${country.max}`;
    return `Phone numbers in ${country.name} have ${n} digits.`;
  }
  if (code === "91" && !/^[6-9]/.test(digits)) return "An India mobile number starts with 6, 7, 8 or 9.";
  return null;
}
