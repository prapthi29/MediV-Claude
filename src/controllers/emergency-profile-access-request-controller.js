
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler.js';
import { AppError } from '../utils/app-error.js';

const uuidSchema = z.string().uuid();

const operationSchema = z.object({
  operation: z.enum(['view', 'create', 'update'])
}).strict();

const decisionSchema = z.object({
  status: z.enum(['approved', 'rejected'])
}).strict();

function parsePatientId(req) {
  const parsed = uuidSchema.safeParse(req.params.patientId);

  if (!parsed.success) {
    throw new AppError(
      400,
      'A valid patient ID is required.',
      'INVALID_PATIENT_ID'
    );
  }

  return parsed.data;
}

function parseRequestId(req) {
  const parsed = uuidSchema.safeParse(req.params.requestId);

  if (!parsed.success) {
    throw new AppError(
      400,
      'A valid approval request ID is required.',
      'INVALID_APPROVAL_REQUEST_ID'
    );
  }

  return parsed.data;
}

export function createEmergencyProfileAccessRequestController(service) {
  return {
    request: asyncHandler(async (req, res) => {
      const patientId = parsePatientId(req);
      const input = operationSchema.parse(req.body);

      const request = await service.requestPermission(
        req.user.sub,
        patientId,
        input.operation
      );

      res.status(201).json({ request });
    }),

    listForPatient: asyncHandler(async (req, res) => {
      const requests = await service.listForPatient(req.user.sub);
      res.json({ requests });
    }),

    listForDoctor: asyncHandler(async (req, res) => {
      const patientId = parsePatientId(req);

      const requests = await service.listForDoctor(
        req.user.sub,
        patientId
      );

      res.json({ requests });
    }),

    decide: asyncHandler(async (req, res) => {
      const requestId = parseRequestId(req);
      const input = decisionSchema.parse(req.body);

      const request = await service.decide(
        req.user.sub,
        requestId,
        input.status
      );

      res.json({ request });
    })
  };
}
