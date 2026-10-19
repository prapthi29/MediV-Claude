import { Router } from 'express';
import { createPatientProfileController } from '../controllers/patient-profile-controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { createWalletController } from '../controllers/wallet-controller.js';

export function createPatientRouter(authService, patientProfileService, walletService) {
  const router = Router();
  const controller = createPatientProfileController(patientProfileService);
  const walletController = walletService && createWalletController(walletService);
  router.use(authenticate(authService), authorize('patient'));
  router.get('/me/profile', controller.getOwn);
  router.post('/me/profile', controller.createOwn);
  router.patch('/me/profile', controller.updateOwn);
  if (walletController) router.put('/me/wallet', walletController.setOwn);
  return router;
}
