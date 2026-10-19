import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler.js';

const strongPassword = z.string().min(12, 'Password must contain at least 12 characters.').max(128)
  .regex(/[a-z]/, 'Password must include a lowercase letter.')
  .regex(/[A-Z]/, 'Password must include an uppercase letter.')
  .regex(/[0-9]/, 'Password must include a number.')
  .regex(/[^A-Za-z0-9]/, 'Password must include a special character.');
const credentials = z.object({
  email: z.string().email().max(254),
  password: z.string().min(12).max(128)
});
const registration = credentials.extend({ name: z.string().trim().min(1).max(200), password: strongPassword, role: z.enum(['patient', 'doctor', 'pharmacy']), licenseId: z.string().trim().min(1).max(100).optional() }).superRefine((value, ctx) => { if ((value.role === 'doctor' || value.role === 'pharmacy') && !value.licenseId) ctx.addIssue({ code: 'custom', path: ['licenseId'], message: 'A professional license number is required.' }); if (value.role === 'patient' && value.licenseId) ctx.addIssue({ code: 'custom', path: ['licenseId'], message: 'Patients must not provide a license number.' }); });

export function createAuthController(authService) {
  return {
    register: asyncHandler(async (req, res) => {
      const input = registration.parse(req.body);
      const { user, token } = await authService.register(input);
      res.status(201).json({ user: authService.publicUser(user), token });
    }),
    login: asyncHandler(async (req, res) => {
      const input = credentials.parse(req.body);
      const result = await authService.login(input);
      res.json(result);
    })
  };
}
