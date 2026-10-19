import crypto from 'node:crypto';

// JSON with object keys sorted at every level, so the same profile always hashes the same
// whether it came from a request body or from a PostgreSQL jsonb column.
export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

// The exact content a doctor signs for one version of a patient's basic profile.
export function canonicalBasicProfile(patientUserId, version, profile) {
  return stableStringify({
    type: 'medivault-basic-profile',
    patientUserId,
    version,
    bloodGroup: profile.bloodGroup ?? null,
    gender: profile.gender ?? null,
    dateOfBirth: profile.dateOfBirth ?? null,
    emergencyContact: {
      name: profile.emergencyContactName ?? profile.emergencyContact?.name ?? null,
      phone: profile.emergencyContactPhone ?? profile.emergencyContact?.phone ?? null,
      relationship: profile.emergencyContactRelationship ?? profile.emergencyContact?.relationship ?? null
    },
    allergies: { status: profile.allergiesStatus, items: profile.allergies ?? [] },
    chronicConditions: { status: profile.chronicConditionsStatus, items: profile.chronicConditions ?? [] },
    currentMedications: { status: profile.medicationsStatus, items: profile.currentMedications ?? [] }
  });
}

export function basicProfileSha256(patientUserId, version, profile) {
  return crypto.createHash('sha256').update(canonicalBasicProfile(patientUserId, version, profile)).digest('hex');
}

export function basicProfileChainId(patientUserId) {
  return `basic-profile:${patientUserId}`;
}

export function ageFromDateOfBirth(dateOfBirth, now = new Date()) {
  if (!dateOfBirth) return null;
  const [year, month, day] = dateOfBirth.split('-').map(Number);
  let age = now.getUTCFullYear() - year;
  if (now.getUTCMonth() + 1 < month || (now.getUTCMonth() + 1 === month && now.getUTCDate() < day)) age -= 1;
  return age;
}
