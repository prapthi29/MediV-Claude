import { asyncHandler } from '../utils/async-handler.js';

export function createAuditController(auditRepository) {
  return {
    listOwn: asyncHandler(async (req, res) => {
      const events = await auditRepository.listForPatient(req.user.sub);
      res.json({ events: events.map((event) => ({
        id: event.id, eventType: event.event_type, actorUserId: event.actor_user_id,
        resourceType: event.resource_type, resourceId: event.resource_id,
        metadata: event.metadata, createdAt: event.created_at
      })) });
    })
  };
}
