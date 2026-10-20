import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler.js';

const patientId = z.string().uuid();
const text = (max) => z.string().trim().min(1).max(max);
const medication = z.object({
  name: text(200),
  dose: text(100),
  frequency: text(100),
  duration: text(100),
  instructions: z.string().trim().max(500).optional()
}).strict();
const createBody = z.object({
  patientId,
  approvalId: z.string().uuid(),
  title: z.string().trim().min(1).max(200).optional(),
  medications: z.array(medication).min(1).max(20),
  diagnosis: z.string().trim().max(2000).optional(),
  symptoms: z.string().trim().max(2000).optional(),
  followUp: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
  password: z.string().min(1).max(128)
}).strict();
const prescriptionId = z.object({ prescriptionId: z.string().uuid() });
const patientParams = z.object({ patientId });
const patientPrescriptionParams = z.object({ patientId, prescriptionId: z.string().uuid() });
const requestParams = z.object({ requestId: z.string().uuid() });
const shareParams = z.object({ shareId: z.string().uuid() });
const shareBody = z.object({ pharmacyLicenseId: z.string().trim().min(1).max(100) }).strict();
const dispenseBody = z.object({ password: z.string().min(1).max(128) }).strict();

export function createPrescriptionController(prescriptionService) {
  const decide = (decision) => asyncHandler(async (req, res) => {
    const { requestId } = requestParams.parse(req.params);
    res.json({ approval: await prescriptionService.decideApproval(req.user.sub, requestId, decision) });
  });

  return {
    create: asyncHandler(async (req, res) => {
      const { patientId: patientUserId, ...input } = createBody.parse(req.body);
      const prescription = await prescriptionService.create(req.user.sub, patientUserId, input);
      res.status(201).json({ prescription });
    }),
    requestApproval: asyncHandler(async (req, res) => {
      const { patientId: id } = patientParams.parse(req.params);
      res.status(201).json({ approval: await prescriptionService.requestApproval(req.user.sub, id) });
    }),
    listApprovalsForDoctor: asyncHandler(async (req, res) => {
      const { patientId: id } = patientParams.parse(req.params);
      res.json({ approvals: await prescriptionService.listApprovalsForDoctor(req.user.sub, id) });
    }),
    listApprovalsForPatient: asyncHandler(async (req, res) => {
      res.json({ approvals: await prescriptionService.listApprovalsForPatient(req.user.sub) });
    }),
    approve: decide('approved'),
    reject: decide('rejected'),
    revoke: decide('revoked'),
    listForPatient: asyncHandler(async (req, res) => {
      res.json({ prescriptions: await prescriptionService.listForPatient(req.user.sub) });
    }),
    viewForPatient: asyncHandler(async (req, res) => {
      const { prescriptionId: id } = prescriptionId.parse(req.params);
      res.json(await prescriptionService.viewForPatient(req.user.sub, id));
    }),
    downloadForPatient: asyncHandler(async (req, res) => {
      const { prescriptionId: id } = prescriptionId.parse(req.params);
      const { prescription, body } = await prescriptionService.downloadForPatient(req.user.sub, id);
      res.type(prescription.contentType || 'application/octet-stream');
      res.attachment(prescription.originalFilename || 'prescription');
      res.send(body);
    }),
    listForDoctor: asyncHandler(async (req, res) => {
      const { patientId: id } = patientParams.parse(req.params);
      res.json({ prescriptions: await prescriptionService.listForDoctor(req.user.sub, id) });
    }),
    viewForDoctor: asyncHandler(async (req, res) => {
      const { patientId: pid, prescriptionId: id } = patientPrescriptionParams.parse(req.params);
      res.json(await prescriptionService.viewForDoctor(req.user.sub, pid, id));
    }),
    downloadForDoctor: asyncHandler(async (req, res) => {
      const { patientId: pid, prescriptionId: id } = patientPrescriptionParams.parse(req.params);
      const { prescription, body } = await prescriptionService.downloadForDoctor(req.user.sub, pid, id);
      res.type(prescription.contentType || 'application/octet-stream');
      res.attachment(prescription.originalFilename || 'prescription');
      res.send(body);
    }),
    pharmacyHistory: asyncHandler(async (req, res) => {
      res.json({ history: await prescriptionService.listPharmacyHistory(req.user.sub) });
    }),
    share: asyncHandler(async (req, res) => {
      const { prescriptionId: id } = prescriptionId.parse(req.params);
      const { pharmacyLicenseId } = shareBody.parse(req.body);
      res.status(201).json({ share: await prescriptionService.shareWithPharmacy(req.user.sub, id, pharmacyLicenseId) });
    }),
    listSharesForPatient: asyncHandler(async (req, res) => {
      res.json({ shares: await prescriptionService.listSharesForPatient(req.user.sub) });
    }),
    revokeShare: asyncHandler(async (req, res) => {
      const { shareId } = shareParams.parse(req.params);
      res.json({ share: await prescriptionService.revokeShare(req.user.sub, shareId) });
    }),
    listSharedWithPharmacy: asyncHandler(async (req, res) => {
      res.json({ shares: await prescriptionService.listSharedWithPharmacy(req.user.sub) });
    }),
    openForPharmacy: asyncHandler(async (req, res) => {
      const { shareId } = shareParams.parse(req.params);
      res.json(await prescriptionService.openForPharmacy(req.user.sub, shareId));
    }),
    dispense: asyncHandler(async (req, res) => {
      const { shareId } = shareParams.parse(req.params);
      const { password } = dispenseBody.parse(req.body);
      res.json({ dispensed: await prescriptionService.dispense(req.user.sub, shareId, password) });
    })
  };
}
