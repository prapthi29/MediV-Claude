// Phone numbers are stored as "+<country code> <digits>", for example
// "+91 9876543210". Each supported country allows its own number length.
export const PHONE_COUNTRIES = [
  { code: '91', name: 'India', min: 10, max: 10 },
  { code: '1', name: 'United States / Canada', min: 10, max: 10 },
  { code: '44', name: 'United Kingdom', min: 10, max: 10 },
  { code: '971', name: 'United Arab Emirates', min: 9, max: 9 },
  { code: '966', name: 'Saudi Arabia', min: 9, max: 9 },
  { code: '974', name: 'Qatar', min: 8, max: 8 },
  { code: '965', name: 'Kuwait', min: 8, max: 8 },
  { code: '968', name: 'Oman', min: 8, max: 8 },
  { code: '65', name: 'Singapore', min: 8, max: 8 },
  { code: '60', name: 'Malaysia', min: 9, max: 10 },
  { code: '61', name: 'Australia', min: 9, max: 9 },
  { code: '94', name: 'Sri Lanka', min: 9, max: 9 },
  { code: '977', name: 'Nepal', min: 10, max: 10 },
  { code: '880', name: 'Bangladesh', min: 10, max: 10 },
  { code: '49', name: 'Germany', min: 10, max: 11 }
];

// Returns an error message, or null when the number is valid.
export function phoneProblem(value) {
  const match = /^\+(\d{1,3}) (\d+)$/.exec(String(value ?? ''));
  if (!match) return 'Enter the phone number using digits only.';
  const country = PHONE_COUNTRIES.find((c) => c.code === match[1]);
  if (!country) return 'Choose a supported country code.';
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
