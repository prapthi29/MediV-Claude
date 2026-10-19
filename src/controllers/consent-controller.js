import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler.js';

const grantSchema = z.object({ licenseId: z.string().trim().min(1).max(100) }).strict();
const doctorIdSchema = z.object({ doctorId: z.string().uuid() });

export function createConsentController(consentService) {
  return {
    grant: asyncHandler(async (req, res) => {
      const { licenseId } = grantSchema.parse(req.body);
      res.status(201).json({ consent: await consentService.grantByLicense(req.user.sub, licenseId) });
    }),
    listForDoctor: asyncHandler(async (req, res) => {
      res.json({ patients: await consentService.listForDoctor(req.user.sub) });
    }),
    revoke: asyncHandler(async (req, res) => {
      const { doctorId } = doctorIdSchema.parse(req.params);
      res.json({ consent: await consentService.revoke(req.user.sub, doctorId) });
    }),
    listOwn: asyncHandler(async (req, res) => {
      res.json({ consents: await consentService.listForPatient(req.user.sub) });
    })
  };
}
