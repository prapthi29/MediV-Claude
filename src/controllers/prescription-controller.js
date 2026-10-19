import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler.js';

const patientId = z.string().uuid();
const createMetadata = z.object({
  patientId,
  title: z.string().trim().min(1).max(200).optional(),
  signature: z.string().trim().min(1).max(1024)
}).strict();
const prescriptionId = z.object({ prescriptionId: z.string().uuid() });

export function createPrescriptionController(prescriptionService) {
  return {
    create: asyncHandler(async (req, res) => {
      const { patientId: patientUserId, title, signature } = createMetadata.parse(req.body);
      const prescription = await prescriptionService.create(req.user.sub, patientUserId, req.file, { title, signature });
      res.status(201).json({ prescription });
    }),
    listForPatient: asyncHandler(async (req, res) => {
      res.json({ prescriptions: await prescriptionService.listForPatient(req.user.sub) });
    }),
    downloadForPatient: asyncHandler(async (req, res) => {
      const { prescriptionId: id } = prescriptionId.parse(req.params);
      const { prescription, body } = await prescriptionService.downloadForPatient(req.user.sub, id);
      res.type(prescription.contentType || 'application/octet-stream');
      res.attachment(prescription.originalFilename || 'prescription');
      res.send(body);
    }),
    pharmacyHistory: asyncHandler(async (req, res) => {
      res.json({ history: await prescriptionService.listPharmacyHistory(req.user.sub) });
    }),
    verifyForPharmacy: asyncHandler(async (req, res) => {
      const { prescriptionId: id } = prescriptionId.parse(req.params);
      res.json({ verification: await prescriptionService.verifyForPharmacy(id, req.user.sub) });
    })
  };
}
