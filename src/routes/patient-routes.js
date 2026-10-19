import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { createWalletController } from '../controllers/wallet-controller.js';

// The basic profile is written only by doctors (see emergency-profile-routes.js);
// patients read it through GET /patients/me/emergency-profile.
export function createPatientRouter(authService, walletService) {
  const router = Router();
  const walletController = createWalletController(walletService);
  router.use(authenticate(authService), authorize('patient'));
  router.put('/me/wallet', walletController.setOwn);
  return router;
}
