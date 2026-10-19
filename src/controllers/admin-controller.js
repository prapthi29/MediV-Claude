import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler.js';

const userIdParams = z.object({ userId: z.string().uuid() });

export function createAdminController(adminService) {
  return {
    listPendingUsers: asyncHandler(async (req, res) => {
      res.json({ users: await adminService.listPendingUsers() });
    }),
    listAllUsers: asyncHandler(async (req, res) => {
      res.json({ users: await adminService.listAllUsers() });
    }),
    approveUser: asyncHandler(async (req, res) => {
      const { userId } = userIdParams.parse(req.params);
      res.json({ user: await adminService.approveUser(req.user.sub, userId) });
    }),
    rejectUser: asyncHandler(async (req, res) => {
      const { userId } = userIdParams.parse(req.params);
      res.json({ user: await adminService.rejectUser(req.user.sub, userId) });
    }),
    listAuditEvents: asyncHandler(async (req, res) => {
      res.json({ events: await adminService.listAllAuditEvents() });
    })
  };
}
