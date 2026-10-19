import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { asyncHandler } from '../utils/async-handler.js';
import { createWalletController } from '../controllers/wallet-controller.js';

export function createAccountRouter(authService, walletService, signingKeyService) {
  const router = Router();
  const controller = createWalletController(walletService);
  router.put('/wallet', authenticate(authService), controller.setOwn);
  if (signingKeyService) {
    router.get(
      '/signing-key',
      authenticate(authService),
      authorize('doctor', 'pharmacy'),
      asyncHandler(async (req, res) => {
        res.json({ signingKey: await signingKeyService.getActiveKeyInfo(req.user.sub) });
      })
    );
  }
  return router;
}
