import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler.js';

const accessRequest = z.object({ patientId: z.string().uuid(), reason: z.string().trim().min(10).max(1000), expiresAt: z.coerce.date() }).strict();
const patientParams = z.object({ patientId: z.string().uuid() });

export function createEmergencyAccessController(emergencyAccessService) {
  return {
    grant: asyncHandler(async (req, res) => {
      const { patientId, reason, expiresAt } = accessRequest.parse(req.body);
      res.status(201).json({ emergencyAccess: await emergencyAccessService.grant(req.user.sub, patientId, reason, expiresAt) });
    }),
    listEssential: asyncHandler(async (req, res) => {
      const { patientId } = patientParams.parse(req.params);
      res.json({ records: await emergencyAccessService.listEssentialRecords(req.user.sub, patientId) });
    })
  };
}
