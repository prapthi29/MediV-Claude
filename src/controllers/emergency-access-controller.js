import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler.js';

const accessRequest = z.object({
  patientId: z.string().trim().min(1).max(64),
  reason: z.string().trim().min(10).max(1000),
  durationMinutes: z.coerce.number().int(),
  password: z.string().min(1).max(128)
}).strict();
const patientParams = z.object({ patientId: z.string().uuid() });
const grantParams = z.object({ grantId: z.string().uuid() });

export function createEmergencyAccessController(emergencyAccessService) {
  return {
    grant: asyncHandler(async (req, res) => {
      const { patientId, reason, durationMinutes, password } = accessRequest.parse(req.body);
      res.status(201).json({ emergencyAccess: await emergencyAccessService.grant(req.user.sub, patientId, reason, durationMinutes, password) });
    }),
    listActiveForDoctor: asyncHandler(async (req, res) => {
      res.json({ grants: await emergencyAccessService.listActiveForDoctor(req.user.sub) });
    }),
    viewBasicProfile: asyncHandler(async (req, res) => {
      const { patientId } = patientParams.parse(req.params);
      res.json(await emergencyAccessService.viewBasicProfile(req.user.sub, patientId));
    }),
    listForPatient: asyncHandler(async (req, res) => {
      res.json({ grants: await emergencyAccessService.listForPatient(req.user.sub) });
    }),
    revokeForPatient: asyncHandler(async (req, res) => {
      const { grantId } = grantParams.parse(req.params);
      res.json({ grant: await emergencyAccessService.revokeForPatient(req.user.sub, grantId) });
    })
  };
}
