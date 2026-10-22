// Phone numbers are stored as "+<country code> <digits>", for example
// "+91 9876543210". Only Indian numbers are accepted.
export const PHONE_COUNTRIES = [
  { code: '91', name: 'India', min: 10, max: 10 }
];

// Returns an error message, or null when the number is valid.
export function phoneProblem(value) {
  const match = /^\+(\d{1,3}) (\d+)$/.exec(String(value ?? ''));
  if (!match) return 'Enter the phone number using digits only.';
  const country = PHONE_COUNTRIES.find((c) => c.code === match[1]);
  if (!country) return 'Only Indian (+91) phone numbers are accepted.';
  const length = match[2].length;
  if (length < country.min || length > country.max) {
    const digits = country.min === country.max ? `${country.min}` : `${country.min} to ${country.max}`;
    return `Phone numbers in ${country.name} have ${digits} digits.`;
  }
  if (country.code === '91' && !/^[6-9]/.test(match[2])) {
    return 'An India mobile number starts with 6, 7, 8 or 9.';
  }
  return null;
}
