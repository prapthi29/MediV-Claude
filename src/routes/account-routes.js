import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { createWalletController } from '../controllers/wallet-controller.js';

export function createAccountRouter(authService, walletService) {
  const router = Router();
  const controller = createWalletController(walletService);
  router.put('/wallet', authenticate(authService), controller.setOwn);
  return router;
}
