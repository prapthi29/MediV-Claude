
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler.js';
import { AppError } from '../utils/app-error.js';
import { phoneProblem } from '../utils/phone.js';

const text = (max) => z.string().trim().min(1).max(max);
const optionalText = (max) => z.string().trim().max(max).nullable().optional();

const status = z.enum(['unknown', 'none_known', 'provided']);

const phone = z.string().trim().superRefine((value, ctx) => {
  const problem = phoneProblem(value);
  if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
});

const allergySchema = z.object({
  substance: text(200),
  reaction: text(500),
  severity: z.enum(['mild', 'moderate', 'severe', 'unknown'])
}).strict();

const conditionSchema = z.object({
  name: text(200),
  notes: optionalText(1000)
}).strict();

const medicationSchema = z.object({
  name: text(200),
  dosage: text(200),
  frequency: text(200)
}).strict();

const dateOfBirth = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
  .refine((value) => !Number.isNaN(Date.parse(value)) && value <= new Date().toISOString().slice(0, 10), 'Date of birth cannot be in the future.');
const gender = z.enum(['female', 'male', 'other', 'prefer_not_to_say']);
const password = z.string().min(1).max(128);

const profileFields = {
  gender: gender.optional(),
  dateOfBirth: dateOfBirth.optional(),
  bloodGroup: z.enum([
    'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'
  ]).nullable().optional(),
  emergencyContactName: optionalText(200),
  emergencyContactPhone: phone.nullable().optional(),
  emergencyContactRelationship: optionalText(100),
  allergies: z.array(allergySchema).max(100).optional(),
  allergiesStatus: status.optional(),
  chronicConditions: z.array(conditionSchema).max(100).optional(),
  chronicConditionsStatus: status.optional(),
  currentMedications: z.array(medicationSchema).max(100).optional(),
  medicationsStatus: status.optional()
};

const createSchema = z.object({
  ...profileFields,
  gender,
  dateOfBirth,
  bloodGroup: profileFields.bloodGroup.unwrap().unwrap(),
  emergencyContactName: text(200),
  emergencyContactPhone: phone,
  password,
  allergies: z.array(allergySchema).max(100),
  allergiesStatus: status,
  chronicConditions: z.array(conditionSchema).max(100),
  chronicConditionsStatus: status,
  currentMedications: z.array(medicationSchema).max(100),
  medicationsStatus: status,
  reason: text(1000),
  approvalRequestId: z.string().uuid()
}).strict();

const updateSchema = z.object({
  ...profileFields,
  reason: text(1000),
  approvalRequestId: z.string().uuid(),
  password
}).strict().refine(
  (body) =>
    Object.keys(body).some(
      (key) => !['reason', 'approvalRequestId', 'password'].includes(key)
    ),
  'Provide at least one field to update.'
);

function parsePatientId(req) {
  const parsed = z.string().uuid().safeParse(req.params.patientId);

  if (!parsed.success) {
    throw new AppError(
      400,
      'A valid patient ID is required.',
      'INVALID_PATIENT_ID'
    );
  }

  return parsed.data;
}

function parseApprovalRequestId(req) {
  const parsed = z.string().uuid().safeParse(
    req.query.approvalRequestId
  );

  if (!parsed.success) {
    throw new AppError(
      400,
      'A valid approvalRequestId query parameter is required.',
      'INVALID_APPROVAL_REQUEST_ID'
    );
  }

  return parsed.data;
}

export function createEmergencyProfileController(service) {
  return {
    getOwn: asyncHandler(async (req, res) => {
      const profile = await service.getOwnProfile(req.user.sub);
      res.json({ profile });
    }),

    getPatient: asyncHandler(async (req, res) => {
      const patientId = parsePatientId(req);
      const approvalRequestId = parseApprovalRequestId(req);

      const profile = await service.getPatientProfile(
        req.user.sub,
        patientId,
        approvalRequestId
      );

      res.json({ profile });
    }),

    create: asyncHandler(async (req, res) => {
      const patientId = parsePatientId(req);
      const input = createSchema.parse(req.body);
      const { reason, approvalRequestId, password: signingPassword, ...profile } = input;

      const created = await service.createInitialProfile(
        req.user.sub,
        patientId,
        profile,
        reason,
        approvalRequestId,
        signingPassword
      );

      res.status(201).json({ profile: created });
    }),

    update: asyncHandler(async (req, res) => {
      const patientId = parsePatientId(req);
      const input = updateSchema.parse(req.body);
      const { reason, approvalRequestId, password: signingPassword, ...changes } = input;

      const updated = await service.updateProfile(
        req.user.sub,
        patientId,
        changes,
        reason,
        approvalRequestId,
        signingPassword
      );

      res.json({ profile: updated });
    })
  };
}
