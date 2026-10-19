import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

export function createHealthRouter(authService) {
  const router = Router();
  router.get('/', (req, res) => res.json({ status: 'ok' }));
  router.get('/me', authenticate(authService), (req, res) => res.json({ user: req.user }));
  router.get('/doctor-only', authenticate(authService), authorize('doctor'), (req, res) => res.json({ status: 'ok' }));
  return router;
}
