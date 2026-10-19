import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler.js';

const nullableText = (max) => z.string().trim().max(max).nullable().optional();
const bloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const dateOfBirth = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').refine(
  (value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value && parsed <= new Date();
  },
  'Date of birth must be a valid past date.'
);
const profileFields = {
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  dateOfBirth: dateOfBirth.optional(),
  phone: nullableText(30),
  address: nullableText(1000),
  bloodType: z.enum(bloodTypes).nullable().optional(),
  allergies: nullableText(2000),
  emergencyContactName: nullableText(200),
  emergencyContactPhone: nullableText(30),
  emergencyContactRelationship: nullableText(100)
};
const createSchema = z.object({
  ...profileFields,
  firstName: profileFields.firstName.unwrap(),
  lastName: profileFields.lastName.unwrap(),
  dateOfBirth
}).strict();
const updateSchema = z.object(profileFields).strict().refine(
  (value) => Object.keys(value).length > 0,
  'Provide at least one profile field.'
);

export function createPatientProfileController(patientProfileService) {
  return {
    getOwn: asyncHandler(async (req, res) => {
      res.json({ profile: await patientProfileService.getOwnProfile(req.user.sub) });
    }),
    createOwn: asyncHandler(async (req, res) => {
      const profile = await patientProfileService.createOwnProfile(req.user.sub, createSchema.parse(req.body));
      res.status(201).json({ profile });
    }),
    updateOwn: asyncHandler(async (req, res) => {
      res.json({ profile: await patientProfileService.updateOwnProfile(req.user.sub, updateSchema.parse(req.body)) });
    })
  };
}
