import { Router } from 'express';
import { createAuthController } from '../controllers/auth-controller.js';

export function createAuthRouter(authService) {
  const router = Router();
  const controller = createAuthController(authService);
  router.post('/register', controller.register);
  router.post('/login', controller.login);
  return router;
}
